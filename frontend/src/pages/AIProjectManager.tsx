import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BrainCircuit, Sparkles, Send, Plus, Trash2, Loader2,
  CheckSquare, Calendar, Zap, AlertCircle, CheckCircle2,
  GitBranch, Clock, Target, ArrowRight, X, UserCheck, ChevronDown,
  Layers, Code2, TrendingUp, Star
} from 'lucide-react';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AIConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  planData?: string | null;
  createdAt: string;
}

interface GeneratedPlan {
  projectTitle: string;
  summary: string;
  architecture: { overview: string; components: string[]; techStack: string[] };
  milestones: Array<{
    title: string;
    description: string;
    weekNumber: number;
    tasks: Array<{
      title: string;
      description: string;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      estimatedHours: number;
      suggestedSkills: string[];
    }>;
  }>;
  timeline: Array<{ week: number; focus: string; deliverables: string[] }>;
  risks: string[];
  successCriteria: string[];
}

interface CreatedTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  milestoneId: string | null;
  milestoneTitle: string;
  estimatedHours: number;
  suggestedSkills: string[];
  suggestedAssigneeId: string | null;
  suggestedAssigneeName: string | null;
  assigneeId: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
  skills: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  HIGH:   { label: 'High',   cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  MEDIUM: { label: 'Medium', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  LOW:    { label: 'Low',    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
} as const;

function parsePlan(msg: AIMessage): GeneratedPlan | null {
  if (!msg.planData) return null;
  try { return JSON.parse(msg.planData) as GeneratedPlan; } catch { return null; }
}

function relativeTime(dt: string) {
  const diff = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AIProjectManager() {
  const user = useAuthStore((s) => s.user);

  // Conversation sidebar
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  // Chat / messages
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Input form (new conversation)
  const [showForm, setShowForm] = useState(false);
  const [idea, setIdea] = useState('');
  const [techStack, setTechStack] = useState('');
  const [teamSize, setTeamSize] = useState('4');
  const [duration, setDuration] = useState('6 weeks');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  // Follow-up message
  const [followUp, setFollowUp] = useState('');
  const [sendingFollowUp, setSendingFollowUp] = useState(false);

  // Create board state
  const [showBoardModal, setShowBoardModal] = useState(false);
  const [boardPlan, setBoardPlan] = useState<GeneratedPlan | null>(null);
  const [boardTeamId, setBoardTeamId] = useState('');
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [boardError, setBoardError] = useState('');

  // Assignment panel
  const [showAssignPanel, setShowAssignPanel] = useState(false);
  const [createdTasks, setCreatedTasks] = useState<CreatedTask[]>([]);
  const [boardMembers, setBoardMembers] = useState<TeamMember[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Load teams & conversations on mount ─────────────────────────────────────
  useEffect(() => {
    api.get('/teams/my-teams').then((r) => {
      setTeams((r.data.teams || []).map((t: any) => ({ id: t.id, name: t.name })));
    }).catch(() => {});

    setLoadingConvs(true);
    api.get('/ai-pm/conversations').then((r) => {
      setConversations(r.data.conversations || []);
    }).catch(() => {}).finally(() => setLoadingConvs(false));
  }, []);

  // ── Load a conversation's messages ───────────────────────────────────────────
  const loadConversation = useCallback(async (id: string) => {
    setActiveConvId(id);
    setMessages([]);
    setLoadingMessages(true);
    setShowForm(false);
    setShowAssignPanel(false);
    setAssignSuccess(false);
    try {
      const r = await api.get(`/ai-pm/conversations/${id}`);
      setMessages(r.data.conversation.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Create new conversation ──────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!idea.trim()) { setGenError('Please describe your project idea.'); return; }
    setGenerating(true);
    setGenError('');
    try {
      const r = await api.post('/ai-pm/conversations', {
        idea: idea.trim(),
        techStack: techStack.trim() || undefined,
        teamSize: teamSize || '4',
        duration: duration || '6 weeks',
        teamId: selectedTeamId || undefined,
      });
      const newConv: AIConversation = {
        id: r.data.conversation.id,
        title: r.data.conversation.title,
        createdAt: r.data.conversation.createdAt,
        updatedAt: r.data.conversation.updatedAt,
      };
      setConversations((prev) => [newConv, ...prev]);
      setMessages(r.data.conversation.messages || []);
      setActiveConvId(r.data.conversation.id);
      setShowForm(false);
      setIdea(''); setTechStack(''); setTeamSize('4'); setDuration('6 weeks'); setSelectedTeamId('');
    } catch (e: any) {
      setGenError(e.response?.data?.error || 'Failed to generate plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // ── Send follow-up message ───────────────────────────────────────────────────
  const handleFollowUp = async () => {
    if (!followUp.trim() || !activeConvId) return;
    const text = followUp.trim();
    setFollowUp('');
    setSendingFollowUp(true);
    // Optimistically add user message
    setMessages((prev) => [...prev, {
      id: `tmp-${Date.now()}`, role: 'user', content: text,
      planData: null, createdAt: new Date().toISOString(),
    }]);
    try {
      const r = await api.post(`/ai-pm/conversations/${activeConvId}/messages`, { content: text });
      setMessages((prev) => [...prev, r.data.message]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`, role: 'assistant',
        content: 'Sorry, I had trouble processing that. Please try again.',
        planData: null, createdAt: new Date().toISOString(),
      }]);
    } finally {
      setSendingFollowUp(false);
    }
  };

  // ── Delete conversation ──────────────────────────────────────────────────────
  const handleDeleteConv = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    await api.delete(`/ai-pm/conversations/${id}`).catch(() => {});
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
  };

  // ── Create full board ────────────────────────────────────────────────────────
  const handleCreateBoard = async () => {
    if (!boardPlan || !boardTeamId) { setBoardError('Please select a team.'); return; }
    setCreatingBoard(true);
    setBoardError('');
    try {
      const r = await api.post('/ai-pm/create-board', {
        teamId: boardTeamId,
        plan: boardPlan,
        conversationId: activeConvId,
      });
      setCreatedProjectId(r.data.project.id);
      setCreatedTasks(r.data.tasks || []);
      setBoardMembers(r.data.members || []);
      // Pre-fill suggested assignments
      const init: Record<string, string> = {};
      (r.data.tasks as CreatedTask[]).forEach((t) => {
        if (t.suggestedAssigneeId) init[t.id] = t.suggestedAssigneeId;
      });
      setAssignments(init);
      setShowBoardModal(false);
      setShowAssignPanel(true);
    } catch (e: any) {
      setBoardError(e.response?.data?.error || 'Failed to create project board.');
    } finally {
      setCreatingBoard(false);
    }
  };

  // ── Save assignments ─────────────────────────────────────────────────────────
  const handleSaveAssignments = async () => {
    setSavingAssignments(true);
    try {
      const arr = Object.entries(assignments).map(([taskId, assigneeId]) => ({ taskId, assigneeId }));
      await api.post('/ai-pm/assign', { assignments: arr });
      setAssignSuccess(true);
      setShowAssignPanel(false);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to save assignments.');
    } finally {
      setSavingAssignments(false);
    }
  };

  // ── Find the latest plan in the conversation ──────────────────────────────────
  const latestPlan = [...messages].reverse().find((m) => m.role === 'assistant' && m.planData)
    ? parsePlan([...messages].reverse().find((m) => m.role === 'assistant' && m.planData)!)
    : null;

  const totalTasks = latestPlan?.milestones?.reduce((acc, ms) => acc + ms.tasks.length, 0) ?? 0;
  const totalHours = latestPlan?.milestones?.reduce(
    (acc, ms) => acc + ms.tasks.reduce((a, t) => a + (t.estimatedHours || 0), 0), 0
  ) ?? 0;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-0 h-[calc(100vh-6rem)] -m-6 lg:-m-8 overflow-hidden">

      {/* ── Left Sidebar: Conversation History ─────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-border glass-panel rounded-none">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
              <BrainCircuit className="w-4 h-4 text-primary" />
            </div>
            <span className="font-extrabold text-foreground text-sm tracking-wide">AI Project Manager</span>
          </div>
          <button
            onClick={() => { setShowForm(true); setActiveConvId(null); setMessages([]); setAssignSuccess(false); setShowAssignPanel(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" /> New Project Plan
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1" style={{ scrollbarWidth: 'none' }}>
          {loadingConvs ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 px-2 leading-relaxed">
              No plans yet.<br />Click <strong>New Project Plan</strong> to start.
            </p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className={`group flex items-start gap-2 p-2.5 rounded-xl cursor-pointer transition-all ${
                  activeConvId === c.id ? 'bg-primary/15 border border-primary/20' : 'hover:bg-secondary/60'
                }`}
              >
                <Sparkles className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${activeConvId === c.id ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold truncate ${activeConvId === c.id ? 'text-primary' : 'text-foreground'}`}>{c.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(c.updatedAt)}</p>
                </div>
                <button
                  onClick={(e) => handleDeleteConv(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Main Area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── New Conversation Form ─────────────────────────────────────────── */}
        {showForm && !activeConvId && (
          <div className="flex-1 overflow-y-auto p-6 lg:p-8">
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                  <BrainCircuit className="w-6 h-6 text-primary" /> New AI Project Plan
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Describe your project idea and Gemini will generate a complete plan, milestones, and tasks.
                </p>
              </div>

              {genError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {genError}
                </div>
              )}

              <div className="glass-panel rounded-2xl p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">
                    Project Idea <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    rows={4}
                    placeholder="e.g. A university student marketplace app where students can sell/buy second-hand items, with real-time chat, photo uploads, and category filters..."
                    className="w-full px-4 py-3 glass-input text-sm text-foreground rounded-xl outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Tech Stack</label>
                    <input
                      type="text"
                      value={techStack}
                      onChange={(e) => setTechStack(e.target.value)}
                      placeholder="e.g. React, Node.js, PostgreSQL, AWS"
                      className="w-full px-3 py-2 glass-input text-sm text-foreground rounded-xl outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Team Size</label>
                    <select
                      value={teamSize}
                      onChange={(e) => setTeamSize(e.target.value)}
                      className="w-full px-3 py-2 glass-input text-sm text-foreground rounded-xl outline-none"
                    >
                      {['1','2','3','4','5','6','8','10','15','20+'].map((n) => (
                        <option key={n} value={n}>{n} {n === '1' ? 'person' : 'people'}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Duration</label>
                    <select
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full px-3 py-2 glass-input text-sm text-foreground rounded-xl outline-none"
                    >
                      {['1 week','2 weeks','4 weeks','6 weeks','8 weeks','12 weeks','16 weeks','6 months','1 year'].map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Existing Team (optional)</label>
                    <select
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                      className="w-full px-3 py-2 glass-input text-sm text-foreground rounded-xl outline-none"
                    >
                      <option value="">No team selected</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-1">Team skills will be used for assignment suggestions</p>
                  </div>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={generating || !idea.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-xl transition-all disabled:opacity-50 shadow-lg"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'Generating Plan with Gemini AI…' : '✨ Generate Project Plan'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty State ───────────────────────────────────────────────────── */}
        {!showForm && !activeConvId && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-5">
            <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10">
              <BrainCircuit className="w-14 h-14 text-primary mx-auto" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">AI Project Manager</h2>
              <p className="text-muted-foreground text-sm mt-2 max-w-md leading-relaxed">
                Describe your project idea and let Gemini generate a complete project plan with milestones, tasks, timelines, and smart team assignments.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg text-xs">
              {[
                { icon: Sparkles, label: 'AI-Generated Plans', desc: 'Full milestones & tasks from your idea', color: 'text-purple-400' },
                { icon: CheckSquare, label: 'One-Click Board', desc: 'Create project, milestones & tasks instantly', color: 'text-blue-400' },
                { icon: UserCheck, label: 'Smart Assignment', desc: 'Skill-based team member suggestions', color: 'text-emerald-400' },
              ].map((f) => (
                <div key={f.label} className="glass-card rounded-xl p-3 text-left">
                  <f.icon className={`w-4 h-4 ${f.color} mb-1.5`} />
                  <p className="font-bold text-foreground">{f.label}</p>
                  <p className="text-muted-foreground text-[11px] mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:opacity-90 transition-all shadow-lg"
            >
              <Plus className="w-4 h-4" /> Start with your project idea
            </button>
          </div>
        )}

        {/* ── Conversation / Chat View ──────────────────────────────────────── */}
        {activeConvId && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ scrollbarWidth: 'thin' }}>
              {loadingMessages ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
              ) : (
                messages.map((msg) => {
                  const plan = parsePlan(msg);
                  return (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <BrainCircuit className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className={`max-w-[85%] space-y-4 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                        {/* Text bubble */}
                        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'glass-card border border-border text-foreground rounded-tl-sm'
                        }`}>
                          {msg.content}
                        </div>

                        {/* Plan display (only for assistant messages with planData) */}
                        {plan && <PlanDisplay plan={plan} onCreateBoard={(p) => { setBoardPlan(p); setBoardTeamId(teams[0]?.id || ''); setShowBoardModal(true); setBoardError(''); }} />}
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5 text-sm font-extrabold text-muted-foreground">
                          {(user?.name || 'U').charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {sendingFollowUp && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  </div>
                  <div className="glass-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-muted-foreground">
                    Gemini is thinking…
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Success banner */}
            {assignSuccess && (
              <div className="mx-5 mb-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-emerald-400 text-sm">
                <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Project board created and tasks assigned! </span>
                {createdProjectId && (
                  <Link to={`/projects/${createdProjectId}`} className="flex items-center gap-1 text-xs font-bold underline hover:text-emerald-300">
                    View Project <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            )}

            {/* Follow-up input */}
            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFollowUp(); } }}
                  placeholder="Ask a follow-up… e.g. 'Add a mobile app milestone' or 'Make it a 3-month plan'"
                  className="flex-1 px-4 py-2.5 glass-input text-sm text-foreground rounded-xl outline-none"
                  disabled={sendingFollowUp}
                />
                <button
                  onClick={handleFollowUp}
                  disabled={!followUp.trim() || sendingFollowUp}
                  className="px-4 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              {latestPlan && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span>Plan ready: <strong className="text-foreground">{latestPlan.milestones?.length} milestones</strong> · <strong className="text-foreground">{totalTasks} tasks</strong> · <strong className="text-foreground">~{totalHours}h</strong> estimated</span>
                  <button
                    onClick={() => { setBoardPlan(latestPlan); setBoardTeamId(teams[0]?.id || ''); setShowBoardModal(true); setBoardError(''); }}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:opacity-90 transition-all"
                  >
                    <Zap className="w-3 h-3" /> Create Full Project Board
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Create Board Modal ────────────────────────────────────────────── */}
      {showBoardModal && boardPlan && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowBoardModal(false)}>
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md space-y-5 border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" /> Create Full Project Board
              </h3>
              <button onClick={() => setShowBoardModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="glass-card rounded-xl p-4 space-y-2">
              <p className="text-sm font-bold text-foreground">{boardPlan.projectTitle}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{boardPlan.summary}</p>
              <div className="flex gap-3 text-xs text-muted-foreground mt-2 flex-wrap">
                <span className="flex items-center gap-1"><GitBranch className="w-3 h-3 text-primary" /> {boardPlan.milestones?.length} milestones</span>
                <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3 text-blue-400" /> {totalTasks} tasks</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-400" /> ~{totalHours}h total</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">
                Create in Team <span className="text-destructive">*</span>
              </label>
              {teams.length === 0 ? (
                <p className="text-xs text-destructive">You must be in a team first. <Link to="/teams" className="underline">Create or join a team →</Link></p>
              ) : (
                <select
                  value={boardTeamId}
                  onChange={(e) => setBoardTeamId(e.target.value)}
                  className="w-full px-3 py-2.5 glass-input text-sm text-foreground rounded-xl outline-none"
                >
                  <option value="">Select a team…</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>

            {boardError && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {boardError}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowBoardModal(false)} className="flex-1 px-4 py-2.5 border border-border text-muted-foreground text-sm rounded-xl hover:bg-secondary transition-all">
                Cancel
              </button>
              <button
                onClick={handleCreateBoard}
                disabled={creatingBoard || !boardTeamId}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
              >
                {creatingBoard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {creatingBoard ? 'Creating…' : 'Create Board'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assignment Panel (Right Drawer) ───────────────────────────────── */}
      {showAssignPanel && (
        <aside className="w-96 flex-shrink-0 flex flex-col border-l border-border glass-panel rounded-none overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" /> Assign Tasks
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{createdTasks.length} tasks · {boardMembers.length} team members</p>
            </div>
            <button onClick={() => setShowAssignPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Bulk assign */}
          {boardMembers.length > 1 && (
            <div className="p-3 border-b border-border bg-secondary/20">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted-foreground flex-shrink-0">Bulk assign all:</label>
                <select
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const all: Record<string, string> = {};
                    createdTasks.forEach((t) => { all[t.id] = e.target.value; });
                    setAssignments(all);
                  }}
                  className="flex-1 px-2 py-1.5 glass-input text-xs text-foreground rounded-lg outline-none"
                >
                  <option value="">Select member…</option>
                  {boardMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Task list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ scrollbarWidth: 'thin' }}>
            {createdTasks.map((task) => {
              const pc = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.MEDIUM;
              const assignedMember = boardMembers.find((m) => m.id === assignments[task.id]);
              return (
                <div key={task.id} className="glass-card rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className={`px-1.5 py-0.5 text-[10px] font-bold rounded border flex-shrink-0 mt-0.5 ${pc.cls}`}>
                      {pc.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground leading-tight">{task.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{task.milestoneTitle}</p>
                    </div>
                    {task.estimatedHours > 0 && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> {task.estimatedHours}h
                      </span>
                    )}
                  </div>

                  {task.suggestedSkills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {task.suggestedSkills.slice(0, 4).map((s) => (
                        <span key={s} className="px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded-md">{s}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <select
                      value={assignments[task.id] || ''}
                      onChange={(e) => setAssignments((prev) => ({ ...prev, [task.id]: e.target.value }))}
                      className="flex-1 px-2 py-1.5 glass-input text-xs text-foreground rounded-lg outline-none"
                    >
                      <option value="">Unassigned</option>
                      {boardMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id === task.suggestedAssigneeId ? `★ ${m.name}` : m.name}
                        </option>
                      ))}
                    </select>
                    {assignedMember && (
                      <div className="w-6 h-6 rounded-lg flex-shrink-0 overflow-hidden bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                        {assignedMember.avatarUrl
                          ? <img src={assignedMember.avatarUrl} alt={assignedMember.name} className="w-full h-full object-cover" />
                          : assignedMember.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {task.suggestedAssigneeName && !assignments[task.id] && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-1">
                      <Star className="w-2.5 h-2.5" /> Suggested: {task.suggestedAssigneeName}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-border space-y-2">
            <div className="text-xs text-muted-foreground text-center">
              {Object.values(assignments).filter(Boolean).length} / {createdTasks.length} tasks assigned
            </div>
            <button
              onClick={handleSaveAssignments}
              disabled={savingAssignments}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm rounded-xl transition-all disabled:opacity-50"
            >
              {savingAssignments ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {savingAssignments ? 'Saving…' : 'Create & Assign Tasks'}
            </button>
            <button
              onClick={() => setShowAssignPanel(false)}
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip for now
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

// ─── Plan Display Component ──────────────────────────────────────────────────

function PlanDisplay({ plan, onCreateBoard }: { plan: GeneratedPlan; onCreateBoard: (p: GeneratedPlan) => void }) {
  const [openMilestone, setOpenMilestone] = useState<number | null>(0);
  const [tab, setTab] = useState<'plan' | 'timeline' | 'arch'>('plan');

  const totalTasks = plan.milestones?.reduce((a, ms) => a + ms.tasks.length, 0) ?? 0;
  const totalHours = plan.milestones?.reduce((a, ms) => a + ms.tasks.reduce((b, t) => b + (t.estimatedHours || 0), 0), 0) ?? 0;

  return (
    <div className="w-full glass-panel rounded-2xl border border-border overflow-hidden">
      {/* Plan header */}
      <div className="p-5 border-b border-border bg-primary/5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" /> {plan.projectTitle}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{plan.summary}</p>
          </div>
          <button
            onClick={() => onCreateBoard(plan)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-bold text-xs rounded-xl hover:opacity-90 transition-all shadow-md flex-shrink-0"
          >
            <Zap className="w-3.5 h-3.5" /> Create Full Project Board
          </button>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-4 mt-4 text-xs">
          {[
            { icon: GitBranch, label: `${plan.milestones?.length || 0} Milestones`, color: 'text-primary' },
            { icon: CheckSquare, label: `${totalTasks} Tasks`, color: 'text-blue-400' },
            { icon: Clock, label: `~${totalHours}h Estimated`, color: 'text-amber-400' },
            { icon: Target, label: `${plan.successCriteria?.length || 0} Success Criteria`, color: 'text-emerald-400' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-muted-foreground">
              <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              <span className="font-semibold">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        {([
          { id: 'plan', label: 'Milestones & Tasks', icon: CheckSquare },
          { id: 'timeline', label: 'Timeline', icon: Calendar },
          { id: 'arch', label: 'Architecture', icon: Layers },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Milestones & Tasks */}
      {tab === 'plan' && (
        <div className="p-4 space-y-3">
          {(plan.milestones || []).map((ms, idx) => {
            const isOpen = openMilestone === idx;
            const msHours = ms.tasks.reduce((a, t) => a + (t.estimatedHours || 0), 0);
            return (
              <div key={idx} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpenMilestone(isOpen ? null : idx)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-secondary/30 transition-all text-left"
                >
                  <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-extrabold text-primary flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{ms.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{ms.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-[10px] text-muted-foreground">
                    <span>Week {ms.weekNumber}</span>
                    <span>·</span>
                    <span>{ms.tasks.length} tasks</span>
                    <span>·</span>
                    <span>{msHours}h</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {ms.tasks.map((t, ti) => {
                      const pc = PRIORITY_CONFIG[t.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.MEDIUM;
                      return (
                        <div key={ti} className="flex items-start gap-3 p-3 hover:bg-secondary/20 transition-all">
                          <CheckSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground">{t.title}</p>
                            {t.description && <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{t.description}</p>}
                            {t.suggestedSkills?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {t.suggestedSkills.map((s) => (
                                  <span key={s} className="px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded-md">{s}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${pc.cls}`}>{pc.label}</span>
                            {t.estimatedHours > 0 && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" /> {t.estimatedHours}h
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Timeline */}
      {tab === 'timeline' && (
        <div className="p-4 space-y-2">
          {(plan.timeline || []).map((w) => (
            <div key={w.week} className="flex items-start gap-3 p-3 glass-card rounded-xl">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-[10px] text-muted-foreground font-semibold">WK</span>
                <span className="text-base font-extrabold text-primary">{w.week}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">{w.focus}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(w.deliverables || []).map((d) => (
                    <span key={d} className="px-2 py-0.5 text-[10px] bg-emerald-500/10 text-emerald-400 rounded-md font-semibold border border-emerald-500/20">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {plan.risks?.length > 0 && (
            <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <p className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Risks to Watch</p>
              {plan.risks.map((r) => (
                <p key={r} className="text-[11px] text-muted-foreground flex items-start gap-1.5 mt-1">
                  <span className="text-amber-400 mt-0.5">•</span> {r}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Architecture */}
      {tab === 'arch' && (
        <div className="p-4 space-y-4">
          <div className="glass-card rounded-xl p-4">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2"><Layers className="w-3.5 h-3.5 text-purple-400" /> Overview</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{plan.architecture?.overview}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card rounded-xl p-4">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2"><Code2 className="w-3.5 h-3.5 text-blue-400" /> Tech Stack</p>
              <div className="flex flex-wrap gap-1.5">
                {(plan.architecture?.techStack || []).map((t) => (
                  <span key={t} className="px-2 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 rounded-md font-semibold border border-blue-500/20">{t}</span>
                ))}
              </div>
            </div>
            <div className="glass-card rounded-xl p-4">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2"><Layers className="w-3.5 h-3.5 text-emerald-400" /> Components</p>
              {(plan.architecture?.components || []).map((c) => (
                <p key={c} className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" /> {c}
                </p>
              ))}
            </div>
          </div>
          {plan.successCriteria?.length > 0 && (
            <div className="glass-card rounded-xl p-4">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5 mb-2"><TrendingUp className="w-3.5 h-3.5 text-primary" /> Success Criteria</p>
              {plan.successCriteria.map((c) => (
                <p key={c} className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" /> {c}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
