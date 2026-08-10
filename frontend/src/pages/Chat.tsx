/**
 * Team Chat — Production Implementation
 *
 * Architecture:
 *  - Each user sees ONLY the teams they belong to (fetched from /api/chat/channels)
 *  - Messages are scoped to a single teamId — never global
 *  - Socket.io room: "team:<teamId>" — joined after membership verified on backend
 *  - Switching teams: old socket room is LEFT before joining new one
 *  - Switching accounts (accessToken change): socket disconnected, all state cleared,
 *    channels and messages re-fetched for the new user
 *  - No mock / demo data is ever shown
 */

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  Send, Hash, Search, Smile, Paperclip, Phone, Video,
  AlertCircle, Shield, Trash2, Copy, Edit3, Check, X, Users,
  MessageSquareOff,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import api from '../utils/api';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isYesterday);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderInitials: string;
  content: string;
  time: string;          // formatted display time
  rawTime: string;       // ISO string for grouping/sorting
  isOwn: boolean;
  isOptimistic?: boolean;
  reactions?: Record<string, string[]>; // emoji → userIds
}

interface TeamChannel {
  id: string;              // real team UUID from DB
  displayName: string;     // slugified for display e.g. "projectcollab-ai-dev"
  rawName: string;         // original team name
  memberCount: number;
  lastMsg: string;
  unread: number;
}

interface OnlineMember {
  userId: string;
  name: string;
  socketId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_PALETTE: Record<string, string> = {
  A: '#7c3aed', B: '#2563eb', C: '#059669', D: '#e11d48',
  E: '#d97706', F: '#0891b2', G: '#4f46e5', H: '#db2777',
  I: '#0284c7', J: '#c2410c', K: '#7c3aed', L: '#15803d',
  M: '#2563eb', N: '#1d4ed8', O: '#b91c1c', P: '#7c3aed',
  Q: '#0e7490', R: '#15803d', S: '#b45309', T: '#1d4ed8',
  U: '#6d28d9', V: '#0f766e', W: '#92400e', X: '#be185d',
  Y: '#064e3b', Z: '#312e81',
};
function avatarBg(name: string) {
  return AVATAR_PALETTE[name?.[0]?.toUpperCase()] ?? '#3b82f6';
}

function dateSeparatorLabel(iso: string) {
  const d = dayjs(iso);
  if (d.isToday()) return 'Today';
  if (d.isYesterday()) return 'Yesterday';
  return d.format('MMMM D, YYYY');
}

function makeInitials(name: string) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const EMOJI_QUICK = ['👍', '❤️', '🔥', '🚀', '😂', '🎉', '👀', '✅', '💯', '🙌', '🤝', '😮'];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Chat() {
  const { user, accessToken } = useAuthStore();

  // ── Core state (all reset on account switch) ──
  const [channels, setChannels]         = useState<TeamChannel[]>([]);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [input, setInput]               = useState('');
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [typingUsers, setTypingUsers]   = useState<string[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);

  // ── UI state ──
  const [showEmojiPicker, setShowEmojiPicker]   = useState(false);
  const [showMemberPanel, setShowMemberPanel]   = useState(false);
  const [editingId, setEditingId]               = useState<string | null>(null);
  const [editContent, setEditContent]           = useState('');
  const [contextMenu, setContextMenu]           = useState<{ msgId: string; x: number; y: number } | null>(null);
  const [reactionPicker, setReactionPicker]     = useState<string | null>(null);
  const [searchQuery, setSearchQuery]           = useState('');

  const bottomRef    = useRef<HTMLDivElement>(null);
  const socketRef    = useRef<Socket | null>(null);
  const prevTeamRef  = useRef<string | null>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─────────────────────────────────────────────
  // Helpers: scroll
  // ─────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, typingUsers.length, scrollToBottom]);

  // ─────────────────────────────────────────────
  // ACCOUNT SWITCH: when accessToken changes,
  // fully reset all chat state and re-fetch
  // ─────────────────────────────────────────────
  useEffect(() => {
    // Tear down existing socket immediately
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Clear everything
    setChannels([]);
    setActiveTeamId(null);
    setMessages([]);
    setInput('');
    setError(null);
    setTypingUsers([]);
    setOnlineMembers([]);
    setShowEmojiPicker(false);
    prevTeamRef.current = null;

    if (!accessToken) {
      setLoadingChannels(false);
      return;
    }

    // Fetch this user's teams
    setLoadingChannels(true);
    let mounted = true;

    api.get('/chat/channels')
      .then(res => {
        if (!mounted) return;
        const raw: any[] = res.data.channels ?? [];
        const mapped: TeamChannel[] = raw.map(ch => ({
          id: ch.id,
          displayName: ch.name.toLowerCase().replace(/\s+/g, '-'),
          rawName: ch.name,
          memberCount: ch.memberCount ?? 0,
          lastMsg: ch.lastMessage
            ? `${ch.lastMessage.senderName}: ${ch.lastMessage.content}`
            : 'No messages yet',
          unread: 0,
        }));
        setChannels(mapped);
        if (mapped.length > 0) setActiveTeamId(mapped[0].id);
      })
      .catch(() => {
        if (mounted) setError('Failed to load your teams. Please refresh.');
      })
      .finally(() => { if (mounted) setLoadingChannels(false); });

    return () => { mounted = false; };
  }, [accessToken]); // ← runs every time the logged-in user changes

  // ─────────────────────────────────────────────
  // TEAM SWITCH: load messages for active team
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!activeTeamId) return;

    // Clear messages from previous team immediately
    setMessages([]);
    setTypingUsers([]);
    setOnlineMembers([]);
    setError(null);

    let mounted = true;
    setLoadingMessages(true);

    api.get(`/chat/team/${activeTeamId}`)
      .then(res => {
        if (!mounted) return;
        const raw: any[] = res.data.messages ?? [];
        const mapped: ChatMessage[] = raw.map(m => {
          const isOwn = m.senderId === user?.id;
          return {
            id: m.id,
            senderId: m.senderId,
            senderName: isOwn ? (user?.name ?? 'You') : (m.sender?.name ?? 'Member'),
            senderInitials: isOwn ? makeInitials(user?.name ?? 'ME') : makeInitials(m.sender?.name ?? 'MB'),
            content: m.content,
            time: dayjs(m.createdAt).format('h:mm A'),
            rawTime: m.createdAt,
            isOwn,
          };
        });
        setMessages(mapped);
      })
      .catch(err => {
        if (!mounted) return;
        const status = err.response?.status;
        if (status === 403) {
          setError('Access denied: You are not a member of this team.');
        } else {
          setError('Failed to load messages. Please try again.');
        }
      })
      .finally(() => { if (mounted) setLoadingMessages(false); });

    return () => { mounted = false; };
  }, [activeTeamId, user?.id]);

  // ─────────────────────────────────────────────
  // SOCKET: connect once per session, switch rooms
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken || !activeTeamId) return;

    const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';
    const socketUrl = apiBaseUrl.replace(/\/api\/?$/, '');

    // Create socket if not yet connected for this session
    if (!socketRef.current || !socketRef.current.connected) {
      const socket = io(socketUrl, {
        auth: { token: accessToken },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 500,
      });
      socketRef.current = socket;

      socket.on('connect_error', (err) => {
        console.warn('Socket connection error:', err.message);
      });
    }

    const socket = socketRef.current;

    // Leave previous team room
    if (prevTeamRef.current && prevTeamRef.current !== activeTeamId) {
      socket.emit('leave-team', { teamId: prevTeamRef.current });
    }
    prevTeamRef.current = activeTeamId;

    // Join new team room (backend verifies membership)
    const joinRoom = () => {
      socket.emit('join-team', { teamId: activeTeamId });
    };

    if (socket.connected) {
      joinRoom();
    } else {
      socket.once('connect', joinRoom);
    }

    // ── Event handlers for THIS team ──
    const onNewMessage = (data: any) => {
      // Strict: only process if message belongs to current active team
      if (data.teamId !== activeTeamId) return;
      const isOwn = data.senderId === user?.id;

      setMessages(prev => {
        // Remove matching optimistic message
        const withoutOpt = prev.filter(m =>
          !(m.isOptimistic && m.content === data.content && isOwn)
        );
        // De-duplicate by id
        if (withoutOpt.some(m => m.id === data.id)) return withoutOpt;

        return [...withoutOpt, {
          id: data.id,
          senderId: data.senderId,
          senderName: isOwn ? (user?.name ?? 'You') : (data.sender?.name ?? 'Member'),
          senderInitials: isOwn
            ? makeInitials(user?.name ?? 'ME')
            : makeInitials(data.sender?.name ?? 'MB'),
          content: data.content,
          time: dayjs(data.createdAt ?? Date.now()).format('h:mm A'),
          rawTime: data.createdAt ?? new Date().toISOString(),
          isOwn,
        }];
      });
    };

    const onTyping = (data: { userId: string; name: string; isTyping: boolean }) => {
      if (data.userId === user?.id) return;
      setTypingUsers(prev =>
        data.isTyping
          ? prev.includes(data.name) ? prev : [...prev, data.name]
          : prev.filter(n => n !== data.name)
      );
    };

    const onPresence = (members: OnlineMember[]) => {
      setOnlineMembers(members);
    };

    const onError = (data: { message: string }) => {
      setError(data.message);
    };

    socket.on('new-team-message', onNewMessage);
    socket.on('user-typing', onTyping);
    socket.on('online-team-members', onPresence);
    socket.on('error-msg', onError);

    return () => {
      socket.off('new-team-message', onNewMessage);
      socket.off('user-typing', onTyping);
      socket.off('online-team-members', onPresence);
      socket.off('error-msg', onError);
    };
  }, [activeTeamId, accessToken, user?.id, user?.name]);

  // ─────────────────────────────────────────────
  // Close context menu on outside click
  // ─────────────────────────────────────────────
  useEffect(() => {
    const close = () => { setContextMenu(null); setReactionPicker(null); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // ─────────────────────────────────────────────
  // Send message
  // ─────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || !activeTeamId) return;
    setInput('');
    setShowEmojiPicker(false);

    const tempId = `opt-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      senderId: user?.id ?? '',
      senderName: user?.name ?? 'You',
      senderInitials: makeInitials(user?.name ?? 'ME'),
      content,
      time: dayjs().format('h:mm A'),
      rawTime: new Date().toISOString(),
      isOwn: true,
      isOptimistic: true,
    };
    setMessages(prev => [...prev, optimistic]);

    if (socketRef.current?.connected) {
      socketRef.current.emit('send-team-message', { teamId: activeTeamId, content });
    } else {
      // REST fallback
      try {
        const res = await api.post(`/chat/team/${activeTeamId}/message`, { content });
        setMessages(prev =>
          prev.map(m => m.id === tempId ? { ...m, id: res.data.message.id, isOptimistic: false } : m)
        );
      } catch (err: any) {
        const status = err.response?.status;
        if (status === 403) {
          setError('You are not authorized to post to this team.');
        }
        // Remove failed optimistic message
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    }
  }, [input, activeTeamId, user?.id, user?.name]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (socketRef.current?.connected && activeTeamId) {
      socketRef.current.emit('typing', { teamId: activeTeamId, isTyping: true });
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        socketRef.current?.emit('typing', { teamId: activeTeamId, isTyping: false });
      }, 2000);
    }
  };

  // ─────────────────────────────────────────────
  // Message actions
  // ─────────────────────────────────────────────
  const deleteMessage = (id: string) => setMessages(prev => prev.filter(m => m.id !== id));
  const copyMessage   = (content: string) => navigator.clipboard.writeText(content);

  const submitEdit = (id: string) => {
    if (!editContent.trim()) return;
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content: editContent } : m));
    setEditingId(null);
    setEditContent('');
  };

  const toggleReaction = (msgId: string, emoji: string) => {
    const uid = user?.id ?? 'me';
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const rx = { ...(m.reactions ?? {}) };
      const users = rx[emoji] ?? [];
      rx[emoji] = users.includes(uid) ? users.filter(u => u !== uid) : [...users, uid];
      if (rx[emoji].length === 0) delete rx[emoji];
      return { ...m, reactions: rx };
    }));
    setReactionPicker(null);
  };

  // ─────────────────────────────────────────────
  // Switch team handler (leaves old room first)
  // ─────────────────────────────────────────────
  const handleSwitchTeam = (teamId: string) => {
    if (teamId === activeTeamId) return;
    setActiveTeamId(teamId);
  };

  // ─────────────────────────────────────────────
  // Grouped messages (date separators)
  // ─────────────────────────────────────────────
  const groupedMessages = useMemo(() => {
    const filtered = searchQuery
      ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
      : messages;

    const groups: { date: string; msgs: ChatMessage[] }[] = [];
    let lastDate = '';
    for (const msg of filtered) {
      const date = dateSeparatorLabel(msg.rawTime);
      if (date !== lastDate) { groups.push({ date, msgs: [] }); lastDate = date; }
      groups[groups.length - 1].msgs.push(msg);
    }
    return groups;
  }, [messages, searchQuery]);

  const activeChannel = channels.find(c => c.id === activeTeamId);

  // ─────────────────────────────────────────────
  // RENDER — Empty state (no teams)
  // ─────────────────────────────────────────────
  if (!loadingChannels && channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] -m-6 text-center space-y-4 px-4">
        <div className="w-16 h-16 rounded-2xl bg-secondary/80 flex items-center justify-center text-muted-foreground">
          <MessageSquareOff className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-foreground">No Team Chats Available</h2>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
          You are not a member of any team yet. Create or join a team to start chatting with your teammates.
        </p>
        <a
          href="/teams"
          className="mt-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-all"
        >
          Browse Teams →
        </a>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // RENDER — Loading channels
  // ─────────────────────────────────────────────
  if (loadingChannels) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)] -m-6">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Loading your team chats…</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // RENDER — Full chat UI
  // ─────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-8rem)] -m-6 overflow-hidden rounded-2xl border border-slate-800 bg-background">

      {/* ═══ SIDEBAR: Team List ═══ */}
      <div className="w-60 flex-shrink-0 border-r border-slate-800 bg-background/80 flex flex-col">

        {/* Search */}
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="w-full pl-8 pr-3 py-1.5 glass-input text-xs rounded-lg"
            />
          </div>
        </div>

        {/* Team channels */}
        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            Your Teams ({channels.length})
          </p>
          {channels.map(ch => (
            <button
              key={ch.id}
              onClick={() => handleSwitchTeam(ch.id)}
              className={`w-full flex flex-col px-3 py-2.5 rounded-xl text-left transition-all mb-1 ${
                activeTeamId === ch.id
                  ? 'bg-primary/15 text-primary border border-primary/25'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <Hash className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 text-xs font-semibold truncate">{ch.displayName}</span>
                {ch.unread > 0 && (
                  <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] rounded-full font-bold min-w-[18px] text-center">
                    {ch.unread}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5 pl-5">{ch.lastMsg}</p>
            </button>
          ))}
        </div>

        {/* Online presence */}
        <div className="p-3 border-t border-slate-800 flex-shrink-0">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
            Online · {onlineMembers.length > 0 ? onlineMembers.length : 1}
          </p>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
              style={{ background: avatarBg(user?.name ?? '') }}
            >
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <span className="text-xs text-foreground font-medium truncate flex-1">{user?.name}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          </div>
          {onlineMembers.filter(m => m.userId !== user?.id).slice(0, 5).map(m => (
            <div key={m.socketId} className="flex items-center gap-2 mt-1.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ background: avatarBg(m.name) }}
              >
                {m.name[0]}
              </div>
              <span className="text-xs text-foreground truncate flex-1">{m.name}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* ═══ MAIN CHAT AREA ═══ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-background/90 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Hash className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                #{activeChannel?.displayName ?? '…'}
              </h3>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                {activeChannel?.memberCount ?? '…'} members · Real-time
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowMemberPanel(v => !v)}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              title="Team Members"
            >
              <Users className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="Voice">
              <Phone className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="Video">
              <Video className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2 flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 space-y-1"
          onContextMenu={e => e.preventDefault()}
        >
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Loading {activeChannel?.rawName ?? 'team'} messages…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 px-6">
              <div className="w-12 h-12 rounded-2xl bg-secondary/80 flex items-center justify-center text-primary">
                <Hash className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-foreground">
                Welcome to #{activeChannel?.displayName}!
              </h4>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                This is the beginning of your team's conversation. Send the first message!
              </p>
            </div>
          ) : (
            groupedMessages.map(group => (
              <div key={group.date}>
                {/* Date Separator */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-secondary border border-border">
                    {group.date}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {group.msgs.map((msg, idx) => {
                  const prev = idx > 0 ? group.msgs[idx - 1] : null;
                  const grouped = prev?.senderId === msg.senderId &&
                    dayjs(msg.rawTime).diff(dayjs(prev?.rawTime), 'minute') < 5;

                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 group relative ${msg.isOwn ? 'flex-row-reverse' : ''} ${grouped ? 'mt-0.5' : 'mt-3'}`}
                      onContextMenu={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY });
                      }}
                    >
                      {/* Avatar */}
                      {grouped ? (
                        <div className="w-8 flex-shrink-0" />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                          style={{ background: msg.isOwn ? 'hsl(var(--primary))' : avatarBg(msg.senderName) }}
                        >
                          {msg.senderInitials}
                        </div>
                      )}

                      {/* Bubble */}
                      <div className={`flex flex-col gap-0.5 max-w-[72%] ${msg.isOwn ? 'items-end' : 'items-start'}`}>
                        {!grouped && (
                          <div className={`flex items-baseline gap-2 px-0.5 ${msg.isOwn ? 'flex-row-reverse' : ''}`}>
                            <span className="text-xs font-bold text-foreground">{msg.senderName}</span>
                            <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                          </div>
                        )}

                        {editingId === msg.id ? (
                          <div className="flex flex-col gap-2 min-w-[240px]">
                            <textarea
                              className="glass-input text-xs w-full resize-none rounded-xl p-2.5"
                              rows={2}
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(msg.id); } }}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button onClick={() => submitEdit(msg.id)} className="flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground text-[11px] rounded-lg font-bold">
                                <Check className="w-3 h-3" /> Save
                              </button>
                              <button onClick={() => { setEditingId(null); setEditContent(''); }} className="flex items-center gap-1 px-2.5 py-1 bg-secondary text-foreground text-[11px] rounded-lg">
                                <X className="w-3 h-3" /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                            msg.isOwn
                              ? 'bg-primary text-primary-foreground rounded-tr-sm'
                              : 'bg-secondary/80 border border-border text-foreground rounded-tl-sm'
                          } ${msg.isOptimistic ? 'opacity-60' : ''}`}>
                            {msg.content}
                            {msg.isOptimistic && (
                              <span className="ml-1.5 inline-block w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin opacity-60" />
                            )}
                          </div>
                        )}

                        {/* Reactions */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {Object.entries(msg.reactions).map(([emoji, users]) => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(msg.id, emoji)}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                                  users.includes(user?.id ?? '')
                                    ? 'bg-primary/20 border-primary/40 text-primary'
                                    : 'bg-secondary border-border text-foreground'
                                }`}
                              >
                                {emoji} <span className="font-bold">{users.length}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Reaction Picker (inline) */}
                        {reactionPicker === msg.id && (
                          <div className="flex gap-1 p-1.5 bg-card border border-border rounded-xl shadow-xl mt-1" onClick={e => e.stopPropagation()}>
                            {EMOJI_QUICK.slice(0, 8).map(em => (
                              <button key={em} onClick={() => toggleReaction(msg.id, em)} className="hover:scale-125 transition-transform text-sm p-0.5">{em}</button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Hover Action Bar */}
                      <div className={`absolute top-0 ${msg.isOwn ? 'right-12' : 'left-12'} hidden group-hover:flex items-center gap-0.5 bg-card border border-border rounded-xl px-1.5 py-1 shadow-lg z-10`}>
                        <button
                          onClick={e => { e.stopPropagation(); setReactionPicker(p => p === msg.id ? null : msg.id); }}
                          className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground" title="React"
                        >
                          <Smile className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => copyMessage(msg.content)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground" title="Copy">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        {msg.isOwn && (
                          <>
                            <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground" title="Edit">
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteMessage(msg.id)} className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {/* Typing Indicator */}
          {typingUsers.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground italic mt-2 px-2">
              <div className="flex gap-0.5 items-end h-4">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.8s' }} />
                ))}
              </div>
              <span>
                {typingUsers.length === 1
                  ? `${typingUsers[0]} is typing…`
                  : `${typingUsers.join(', ')} are typing…`}
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-background/90 flex-shrink-0 relative">
          {showEmojiPicker && (
            <div className="absolute bottom-20 left-5 p-2 bg-card border border-border rounded-xl shadow-2xl flex flex-wrap gap-1.5 w-64 z-20">
              {EMOJI_QUICK.map(em => (
                <button key={em} onClick={() => { setInput(p => p + em); setShowEmojiPicker(false); }}
                  className="hover:scale-125 transition-transform text-lg p-0.5">{em}</button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 bg-secondary/40 border border-border rounded-2xl p-2 focus-within:border-primary/50 transition-all">
            <button onClick={() => setShowEmojiPicker(v => !v)} className="p-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" title="Emoji">
              <Smile className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" title="Attach File">
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message #${activeChannel?.displayName ?? 'team'}…`}
              rows={1}
              disabled={!activeTeamId}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none max-h-32 py-1.5 leading-relaxed disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !activeTeamId}
              className="p-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm flex-shrink-0"
              title="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between px-1 mt-1.5 text-[10px] text-muted-foreground">
            <span>Enter to send · Shift+Enter for new line</span>
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-500" /> Team-scoped · JWT Secured
            </span>
          </div>
        </div>
      </div>

      {/* ═══ MEMBER PANEL ═══ */}
      {showMemberPanel && (
        <div className="w-52 flex-shrink-0 border-l border-slate-800 bg-background/80 flex flex-col p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-foreground">
              {activeChannel?.rawName ?? 'Team'} Members
            </h4>
            <button onClick={() => setShowMemberPanel(false)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-2">
            Online · {onlineMembers.length > 0 ? onlineMembers.length : 1}
          </p>
          {/* Current user */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="relative">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: avatarBg(user?.name ?? '') }}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-background" />
            </div>
            <div>
              <span className="text-xs font-semibold text-foreground truncate block">{user?.name}</span>
              <span className="text-[10px] text-muted-foreground">you</span>
            </div>
          </div>
          {onlineMembers.filter(m => m.userId !== user?.id).map(m => (
            <div key={m.socketId} className="flex items-center gap-2 mb-1.5">
              <div className="relative">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white" style={{ background: avatarBg(m.name) }}>
                  {m.name[0]}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-background" />
              </div>
              <span className="text-xs font-semibold text-foreground truncate">{m.name}</span>
            </div>
          ))}
          {(activeChannel?.memberCount ?? 0) > onlineMembers.length + 1 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              +{(activeChannel?.memberCount ?? 0) - onlineMembers.length - 1} offline
            </p>
          )}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (() => {
        const msg = messages.find(m => m.id === contextMenu.msgId);
        if (!msg) return null;
        return (
          <div
            className="fixed bg-card border border-border rounded-xl shadow-2xl py-1 z-[200] min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => { setReactionPicker(contextMenu.msgId); setContextMenu(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-secondary">
              <Smile className="w-3.5 h-3.5" /> Add Reaction
            </button>
            <button onClick={() => { copyMessage(msg.content); setContextMenu(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-secondary">
              <Copy className="w-3.5 h-3.5" /> Copy Text
            </button>
            {msg.isOwn && (
              <>
                <button onClick={() => { setEditingId(msg.id); setEditContent(msg.content); setContextMenu(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-secondary">
                  <Edit3 className="w-3.5 h-3.5" /> Edit Message
                </button>
                <div className="my-1 border-t border-border" />
                <button onClick={() => { deleteMessage(msg.id); setContextMenu(null); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-3.5 h-3.5" /> Delete Message
                </button>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
