import { useState, useEffect } from 'react';
import { Bell, CheckCheck, X, CheckSquare, GitBranch, MessageSquare, AlertTriangle, Users, Clock, Trash2, Loader2 } from 'lucide-react';
import { io } from 'socket.io-client';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';

type NotifType = 'task' | 'commit' | 'message' | 'risk' | 'invite' | 'deadline' | 'general';

interface Notification {
  id: string;
  type?: NotifType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  task: { icon: CheckSquare, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  commit: { icon: GitBranch, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  message: { icon: MessageSquare, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  risk: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  invite: { icon: Users, color: 'text-pink-400', bg: 'bg-pink-500/10' },
  deadline: { icon: Clock, color: 'text-red-400', bg: 'bg-red-500/10' },
  general: { icon: Bell, color: 'text-slate-400', bg: 'bg-slate-500/10' },
};

function getTypeFromTitle(title: string): NotifType {
  const lower = title.toLowerCase();
  if (lower.includes('task') || lower.includes('assign')) return 'task';
  if (lower.includes('commit') || lower.includes('push') || lower.includes('github')) return 'commit';
  if (lower.includes('message') || lower.includes('chat') || lower.includes('mention')) return 'message';
  if (lower.includes('risk') || lower.includes('alert') || lower.includes('danger')) return 'risk';
  if (lower.includes('invite') || lower.includes('invitation') || lower.includes('join')) return 'invite';
  if (lower.includes('deadline') || lower.includes('due') || lower.includes('overdue')) return 'deadline';
  return 'general';
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await api.get('/misc/notifications');
      setNotifications(res.data.notifications || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const accessToken = useAuthStore((s) => s.accessToken);
  const activeUserId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    loadNotifications();

    if (!accessToken) return;

    const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '');
    if (!apiBase) return;
    const WS_URL = apiBase.replace(/\/api$/, '');
    const socket = io(WS_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    socket.on('notification:new', (newNotif: Notification) => {
      setNotifications(prev => [newNotif, ...prev]);
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, activeUserId]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const filtered = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  const markRead = async (id: string) => {
    if (notifications.find(n => n.id === id)?.isRead) return;
    try {
      setActionLoading(id);
      await api.put(`/misc/notifications/${id}/read`);
      setNotifications((ns) => ns.map((n) => n.id === id ? { ...n, isRead: true } : n));
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    } finally {
      setActionLoading(null);
    }
  };

  const markAllRead = async () => {
    try {
      // Mark all unread ones
      const unread = notifications.filter(n => !n.isRead);
      await Promise.all(unread.map(n => api.put(`/misc/notifications/${n.id}/read`)));
      setNotifications((ns) => ns.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Failed to mark all as read', err);
    }
  };

  // Local dismiss (no delete endpoint, just hide locally)
  const dismiss = (id: string) => setNotifications((ns) => ns.filter((n) => n.id !== id));
  const clearAll = () => setNotifications([]);

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm mb-1 flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5" /> Notification Center
          </p>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Notifications</h1>
          <p className="text-slate-500 text-sm mt-1">
            {unreadCount > 0 ? <><span className="text-white font-medium">{unreadCount} unread</span> · </> : 'All caught up! · '}
            {notifications.length} total
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-all"
            >
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </button>
          )}
          <button
            onClick={clearAll}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl hover:bg-red-500/20 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear all
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 p-1 bg-slate-900/60 border border-slate-800 rounded-xl w-fit">
        {['all', 'unread'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              filter === f ? 'bg-primary text-primary-foreground' : 'text-slate-400 hover:text-white'
            }`}
          >
            {f === 'unread' && unreadCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary/30 text-primary text-xs flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="glass-panel rounded-2xl p-12 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-slate-400">Loading notifications...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center">
              <Bell className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-base font-semibold text-slate-400">No notifications</p>
              <p className="text-sm text-slate-600 mt-1">You're all caught up!</p>
            </div>
          ) : (
            filtered.map((notif) => {
              const type = getTypeFromTitle(notif.title);
              const config = typeConfig[type] || typeConfig.general;
              return (
                <div
                  key={notif.id}
                  onClick={() => markRead(notif.id)}
                  className={`relative flex items-start gap-4 p-5 rounded-2xl transition-all cursor-pointer group ${
                    !notif.isRead
                      ? 'glass-panel border-slate-700 hover:border-slate-600'
                      : 'glass-card opacity-70 hover:opacity-100'
                  }`}
                >
                  {/* Unread dot */}
                  {!notif.isRead && (
                    <div className="absolute top-5 right-5 w-2 h-2 rounded-full bg-primary" />
                  )}

                  {/* Loading indicator */}
                  {actionLoading === notif.id && (
                    <div className="absolute top-4 right-4">
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    </div>
                  )}

                  {/* Icon */}
                  <div className={`flex-shrink-0 p-2.5 rounded-xl ${config.bg}`}>
                    <config.icon className={`w-4 h-4 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold mb-0.5 ${!notif.isRead ? 'text-white' : 'text-slate-300'}`}>{notif.title}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{notif.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-600 font-mono">
                        {new Date(notif.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* Dismiss */}
                  <button
                    onClick={(e) => { e.stopPropagation(); dismiss(notif.id); }}
                    className="p-1.5 rounded-lg text-slate-700 hover:text-slate-400 hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
