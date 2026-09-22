import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useProjectStore } from '../store/project.store';
import {
  LayoutDashboard, FolderOpen, Users, CheckSquare, Clock, TrendingUp,
  Zap, ArrowUpRight, Plus, Activity,
  Flame, Loader2, GripVertical, EyeOff, Eye, Settings2, Sparkles,
  ChevronRight, ArrowRight, X, Target, Github, Brain, FileText
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import api from '../utils/api';

const DEFAULT_WIDGETS = [
  { id: 'stats', label: 'Overview Stats', visible: true },
  { id: 'myprojects', label: 'My Projects', visible: true },
  { id: 'mytasks', label: 'My Assigned Tasks', visible: true },
  { id: 'deadlines', label: 'Upcoming Deadlines', visible: true },
  { id: 'activity', label: 'Recent Activity', visible: true },
  { id: 'quickactions', label: 'Quick Actions', visible: true },
];

function loadWidgets() {
  try { return JSON.parse(localStorage.getItem('dash_widgets_v2') || 'null') || DEFAULT_WIDGETS; }
  catch { return DEFAULT_WIDGETS; }
}
function saveWidgets(w: typeof DEFAULT_WIDGETS) {
  localStorage.setItem('dash_widgets_v2', JSON.stringify(w));
}

interface DashStats {
  projects: number;
  openTasks: number;
  totalTasks: number;
  teamMembers: number;
  recentActivity: any[];
  upcomingDeadlines: any[];
  projectHealthScores: { title: string; score: number | null }[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { switchProject, fetchUserProjects } = useProjectStore();

  const [greeting, setGreeting] = useState('Good day');
  const [stats, setStats] = useState<DashStats | null>(null);
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [myTasksList, setMyTasksList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<typeof DEFAULT_WIDGETS>(loadWidgets);
  const [showWidgetMenu, setShowWidgetMenu] = useState(false);

  // Join Project Modal State
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');

  const onDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(widgets);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setWidgets(reordered);
    saveWidgets(reordered);
  }, [widgets]);

  const toggleWidget = (id: string) => {
    const updated = widgets.map((w: any) => w.id === id ? { ...w, visible: !w.visible } : w);
    setWidgets(updated);
    saveWidgets(updated);
  };

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) setGreeting('Good morning');
    else if (h >= 12 && h < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      const [projectsRes, myTasksRes] = await Promise.all([
        api.get('/projects/my-projects').catch(() => ({ data: { projects: [] } })),
        api.get('/tasks/my-tasks').catch(() => ({ data: { tasks: [] } })),
      ]);

      const projects = projectsRes.data.projects || [];
      const myTasks = myTasksRes.data.tasks || [];

      setProjectsList(projects);
      setMyTasksList(myTasks);

      let totalTasksCount = 0;
      let openTasksCount = 0;
      const memberSet = new Set<string>();
      const allDeadlines: any[] = [];
      const projectScores: { title: string; score: number | null }[] = [];

      projects.forEach((p: any) => {
        const pTasks = p.tasks || [];
        totalTasksCount += pTasks.length;
        const notDone = pTasks.filter((t: any) => t.status !== 'COMPLETED');
        openTasksCount += notDone.length;

        (p.team?.members || []).forEach((m: any) => {
          if (m.user?.id) memberSet.add(m.user.id);
        });

        notDone
          .filter((t: any) => t.dueDate)
          .forEach((t: any) => {
            allDeadlines.push({
              task: t.title,
              project: p.title,
              projectId: p.id,
              due: new Date(t.dueDate),
              priority: t.priority,
            });
          });

        projectScores.push({
          title: p.title,
          score: typeof p.healthScore === 'number' ? p.healthScore : null,
        });
      });

      // Load activities for up to 5 projects
      let activities: any[] = [];
      if (projects.length > 0) {
        const activityResults = await Promise.allSettled(
          projects.slice(0, 5).map((p: any) => api.get(`/misc/projects/${p.id}/activities`))
        );

        const rawLogs: any[] = [];
        activityResults.forEach((res) => {
          if (res.status === 'fulfilled' && res.value.data?.logs) {
            rawLogs.push(...res.value.data.logs);
          }
        });

        rawLogs
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 6)
          .forEach((log: any) => {
            activities.push({
              user: log.user?.name || 'Teammate',
              action: (log.action || '').replace(/_/g, ' ').toLowerCase(),
              target: log.metadata?.title || '',
              time: new Date(log.createdAt).toLocaleDateString(),
            });
          });
      }

      allDeadlines.sort((a, b) => a.due.getTime() - b.due.getTime());

      setStats({
        projects: projects.length,
        openTasks: openTasksCount,
        totalTasks: totalTasksCount,
        teamMembers: memberSet.size,
        recentActivity: activities,
        upcomingDeadlines: allDeadlines.slice(0, 5),
        projectHealthScores: projectScores.slice(0, 5),
      });
    } catch (err) {
      console.error('Dashboard load error:', err);
      setStats({
        projects: 0,
        openTasks: 0,
        totalTasks: 0,
        teamMembers: 0,
        recentActivity: [],
        upcomingDeadlines: [],
        projectHealthScores: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinLoading(true);
    setJoinError('');
    setJoinSuccess('');

    try {
      const res = await api.post('/teams/join', { inviteCode: joinCode.trim() });
      setJoinSuccess(`Successfully joined team "${res.data.team?.name || 'Workspace'}"!`);
      await fetchUserProjects();
      await loadDashboard();
      setTimeout(() => {
        setShowJoinModal(false);
        setJoinCode('');
        setJoinSuccess('');
      }, 1500);
    } catch (err: any) {
      setJoinError(err.response?.data?.error || 'Invalid invite code or unable to join.');
    } finally {
      setJoinLoading(false);
    }
  };

  const completionRate = stats && stats.totalTasks > 0
    ? Math.round(((stats.totalTasks - stats.openTasks) / stats.totalTasks) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Join Team Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-border shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Join Project Team
              </h3>
              <button
                onClick={() => { setShowJoinModal(false); setJoinError(''); }}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Enter the 8-character team invite code provided by your project lead or colleague to immediately join the workspace.
            </p>

            {joinError && (
              <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold">
                {joinError}
              </div>
            )}
            {joinSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                {joinSuccess}
              </div>
            )}

            <form onSubmit={handleJoinTeam} className="space-y-4">
              <div>
                <label className="block text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider mb-1.5">
                  8-Character Invite Code
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 7A8B9C0D"
                  maxLength={10}
                  className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm font-mono tracking-widest text-foreground focus:border-primary focus:outline-none uppercase"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joinLoading || !joinCode.trim()}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
                >
                  {joinLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Users className="w-4 h-4" /> Join Team</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5">
            <LayoutDashboard className="w-3.5 h-3.5" /> Main Dashboard
          </p>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
            {greeting}, {user?.name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {projectsList.length === 0
              ? 'Welcome to ProjectCollab AI. Let us get your workspace set up.'
              : 'Here is what is happening across your projects and assignments today.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {projectsList.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowWidgetMenu(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 glass-card text-xs font-semibold text-foreground rounded-xl hover:bg-secondary transition-all border border-border"
              >
                <Settings2 className="w-3.5 h-3.5" /> Widgets
              </button>
              {showWidgetMenu && (
                <div className="absolute right-0 top-full mt-2 w-52 glass-panel rounded-xl border border-border p-2 z-20 shadow-xl">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2 py-1 mb-1">Toggle Widgets</p>
                  {widgets.map((w: any) => (
                    <button
                      key={w.id}
                      onClick={() => toggleWidget(w.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors text-left"
                    >
                      {w.visible ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                      <span className={`text-xs font-semibold ${w.visible ? 'text-foreground' : 'text-muted-foreground'}`}>{w.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setShowJoinModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-secondary/80 hover:bg-secondary border border-border text-foreground text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-primary" /> Join Project
          </button>

          <Link
            to="/projects?create=true"
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-md"
          >
            <Plus className="w-4 h-4" /> New Project
          </Link>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="glass-panel rounded-2xl p-12 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading workspace and project assignments...</p>
        </div>
      )}

      {/* ─── First-Time Onboarding Experience (When 0 Projects exist) ─── */}
      {!loading && projectsList.length === 0 && (
        <div className="space-y-6">
          <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/10 via-slate-900/80 to-slate-950/90 shadow-2xl relative overflow-hidden animate-fade-in">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" /> Workspace Onboarding
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight">
                Welcome to ProjectCollab AI!
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                You are not enrolled in any collaborative project yet. You can launch your own engineering project with our 8-step AI Setup Wizard or join an existing team using an invite code.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to="/projects?create=true"
                  className="px-6 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-xl transition-all shadow-lg inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Create New Project
                </Link>
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="px-6 py-3.5 bg-secondary hover:bg-secondary/80 text-foreground text-sm font-semibold rounded-xl transition-all border border-border inline-flex items-center gap-2 cursor-pointer"
                >
                  <Users className="w-4 h-4 text-primary" /> Join Project with Invite Code
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-5 rounded-2xl border border-border flex flex-col justify-between space-y-3 hover:border-primary/40 transition-all">
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <h3 className="text-sm font-bold text-foreground">Create Project</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Define project objectives, select teammates, and configure your stack in our 8-step wizard.
                </p>
              </div>
              <Link to="/projects?create=true" className="text-xs text-primary font-bold inline-flex items-center gap-1 hover:underline">
                Create Project <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-border flex flex-col justify-between space-y-3 hover:border-purple-500/40 transition-all">
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h3 className="text-sm font-bold text-foreground">Invite Teammates</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Share your team invite code with collaborators for instant 1-click workspace onboarding.
                </p>
              </div>
              <Link to="/teams" className="text-xs text-purple-400 font-bold inline-flex items-center gap-1 hover:underline">
                Manage Teams <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-border flex flex-col justify-between space-y-3 hover:border-blue-500/40 transition-all">
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <h3 className="text-sm font-bold text-foreground">AI Sprint Planning</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Break down your project into automated milestones, assigned tasks, and intelligent schedules.
                </p>
              </div>
              <Link to="/ai" className="text-xs text-blue-400 font-bold inline-flex items-center gap-1 hover:underline">
                Explore AI Planner <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-border flex flex-col justify-between space-y-3 hover:border-emerald-500/40 transition-all">
              <div className="space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold text-xs">
                  4
                </div>
                <h3 className="text-sm font-bold text-foreground">Connect GitHub</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Link your repository to track commits, pull requests, and contributor activity in real time.
                </p>
              </div>
              <Link to="/github" className="text-xs text-emerald-400 font-bold inline-flex items-center gap-1 hover:underline">
                Connect Repo <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ─── Existing User Experience (When Projects exist) ─── */}
      {!loading && projectsList.length > 0 && (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="dashboard-widgets">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-8">
                {widgets.map((widget: any, index: number) => (
                  <Draggable key={widget.id} draggableId={widget.id} index={index}>
                    {(drag, snapshot) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={`transition-shadow ${snapshot.isDragging ? 'shadow-2xl scale-[1.01]' : ''} ${!widget.visible ? 'hidden' : ''}`}
                      >
                        {/* 1. Overview Stat Cards */}
                        {widget.id === 'stats' && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                              {[
                                { label: 'Active Projects', value: stats?.projects ?? 0, change: `${stats?.projects ?? 0} enrolled`, positive: true, icon: FolderOpen, color: 'text-blue-400', glow: 'glow-primary', to: '/projects' },
                                { label: 'Open Tasks', value: stats?.openTasks ?? 0, change: `${stats?.totalTasks ?? 0} total tasks`, positive: (stats?.openTasks ?? 0) === 0, icon: CheckSquare, color: 'text-amber-400', glow: 'glow-amber', to: '/tasks' },
                                { label: 'Team Members', value: stats?.teamMembers ?? 0, change: 'collaborators', positive: true, icon: Users, color: 'text-emerald-400', glow: 'glow-emerald', to: '/teams' },
                                { label: 'Overall Completion', value: `${completionRate}%`, change: `${(stats?.totalTasks ?? 0) - (stats?.openTasks ?? 0)} done`, positive: completionRate >= 50, icon: TrendingUp, color: 'text-purple-400', glow: 'glow-primary', to: '/analytics' },
                              ].map((card) => (
                                <Link
                                  key={card.label}
                                  to={card.to}
                                  className="glass-card rounded-2xl p-5 relative overflow-hidden group hover:border-primary/40 hover:bg-slate-900/50 transition-all block cursor-pointer"
                                >
                                  <div className="flex items-center justify-between mb-4">
                                    <div className={`p-2 rounded-xl bg-secondary ${card.glow}`}><card.icon className={`w-5 h-5 ${card.color}`} /></div>
                                    <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                  </div>
                                  <p className="text-3xl font-extrabold text-foreground mb-1">{card.value}</p>
                                  <p className="text-xs text-muted-foreground font-medium mb-2">{card.label}</p>
                                  <p className={`text-xs font-semibold ${card.positive ? 'text-emerald-500' : 'text-amber-500'}`}>{card.change}</p>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 2. My Projects Card Grid */}
                        {widget.id === 'myprojects' && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-4 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="glass-panel rounded-2xl p-6">
                              <div className="flex items-center justify-between mb-5">
                                <div>
                                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                                    <FolderOpen className="w-4 h-4 text-primary" /> My Projects
                                  </h2>
                                  <p className="text-xs text-muted-foreground mt-0.5">Projects you are actively working on</p>
                                </div>
                                <Link to="/projects" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                                  View all ({projectsList.length}) →
                                </Link>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {projectsList.map((p) => {
                                  const tasks = p.tasks || [];
                                  const doneCount = tasks.filter((t: any) => t.status === 'COMPLETED').length;
                                  const pct = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;
                                  const members = p.team?.members || [];

                                  return (
                                    <div
                                      key={p.id}
                                      className="glass-card rounded-2xl p-5 border border-border hover:border-primary/40 hover:bg-slate-900/40 transition-all flex flex-col justify-between space-y-4"
                                    >
                                      <div>
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <h3 className="text-base font-bold text-foreground hover:text-primary transition-colors line-clamp-1">
                                            {p.title}
                                          </h3>
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                                            p.status === 'HEALTHY' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                            p.status === 'ATTENTION' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                            'bg-red-500/10 text-red-400 border border-red-500/20'
                                          }`}>
                                            {p.status || 'HEALTHY'}
                                          </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                                          {p.description || 'No description provided.'}
                                        </p>

                                        {/* Progress Bar */}
                                        <div className="space-y-1.5 mb-3">
                                          <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Progress</span>
                                            <span className="font-bold text-foreground">{pct}%</span>
                                          </div>
                                          <div className="w-full bg-secondary/80 rounded-full h-1.5 overflow-hidden">
                                            <div
                                              className="bg-primary h-1.5 rounded-full transition-all duration-500"
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                        </div>

                                        {/* Meta row */}
                                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                                          <span className="flex items-center gap-1">
                                            <CheckSquare className="w-3.5 h-3.5" />
                                            {doneCount}/{tasks.length} tasks
                                          </span>
                                          <span className="flex items-center gap-1 font-semibold text-foreground">
                                            <Users className="w-3.5 h-3.5 text-primary" />
                                            {p.team?.name || 'Workspace'}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="pt-2 flex items-center justify-between">
                                        <div className="flex -space-x-2 overflow-hidden">
                                          {members.slice(0, 3).map((m: any, idx: number) => (
                                            <div
                                              key={idx}
                                              className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-[10px] font-bold text-foreground"
                                              title={m.user?.name || 'Member'}
                                            >
                                              {m.user?.name?.charAt(0) || 'M'}
                                            </div>
                                          ))}
                                          {members.length > 3 && (
                                            <div className="w-6 h-6 rounded-full bg-slate-800 border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                                              +{members.length - 3}
                                            </div>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                          {p.githubRepo && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                switchProject(p.id);
                                                navigate(`/projects/${p.id}?tab=git`);
                                              }}
                                              title={`GitHub Repository: ${p.githubRepo}`}
                                              className="p-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border transition-colors cursor-pointer"
                                            >
                                              <Github className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              switchProject(p.id);
                                              navigate(`/projects/${p.id}?tab=ai`);
                                            }}
                                            title="Project Intelligence"
                                            className="p-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-primary border border-border transition-colors cursor-pointer"
                                          >
                                            <Brain className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              switchProject(p.id);
                                              navigate(`/projects/${p.id}?tab=docs`);
                                            }}
                                            title="Project Documents"
                                            className="p-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-blue-400 border border-border transition-colors cursor-pointer"
                                          >
                                            <FileText className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => {
                                              switchProject(p.id);
                                              navigate(`/projects/${p.id}`);
                                            }}
                                            className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer"
                                          >
                                            Open Workspace <ArrowRight className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 3. My Assigned Tasks (Global Context) */}
                        {widget.id === 'mytasks' && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-4 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="glass-panel rounded-2xl p-6">
                              <div className="flex items-center justify-between mb-5">
                                <div>
                                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                                    <CheckSquare className="w-4 h-4 text-primary" /> My Assigned Tasks
                                  </h2>
                                  <p className="text-xs text-muted-foreground mt-0.5">Tasks assigned to you across all projects</p>
                                </div>
                                <Link to="/tasks" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                                  Task Board →
                                </Link>
                              </div>

                              {myTasksList.length === 0 ? (
                                <div className="text-center py-8 border border-dashed border-border rounded-xl">
                                  <CheckSquare className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" />
                                  <p className="text-sm font-semibold text-foreground">You are all caught up!</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">No open tasks currently assigned to you.</p>
                                </div>
                              ) : (
                                <div className="divide-y divide-border/60">
                                  {myTasksList.slice(0, 6).map((task) => (
                                    <div
                                      key={task.id}
                                      onClick={() => {
                                        if (task.projectId) {
                                          switchProject(task.projectId);
                                          navigate(`/tasks?project=${task.projectId}`);
                                        }
                                      }}
                                      className="py-3 flex items-center justify-between gap-4 hover:bg-secondary/40 px-2 rounded-xl transition-all cursor-pointer group"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                          task.priority === 'HIGH' ? 'bg-red-500' :
                                          task.priority === 'MEDIUM' ? 'bg-amber-500' : 'bg-slate-500'
                                        }`} />
                                        <div className="min-w-0">
                                          <p className="text-xs sm:text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                                            {task.title}
                                          </p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-semibold">
                                              {task.project?.title || 'Project'}
                                            </span>
                                            {task.milestone && (
                                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                <Target className="w-3 h-3 text-secondary-foreground" /> {task.milestone.title}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-3 flex-shrink-0">
                                        {task.dueDate && (
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                          </span>
                                        )}
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                          task.status === 'COMPLETED' ? 'bg-emerald-500/15 text-emerald-400' :
                                          task.status === 'IN_PROGRESS' ? 'bg-blue-500/15 text-blue-400' :
                                          task.status === 'REVIEW' ? 'bg-purple-500/15 text-purple-400' :
                                          'bg-secondary text-muted-foreground'
                                        }`}>
                                          {task.status}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 4. Deadlines & Milestones */}
                        {widget.id === 'deadlines' && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-4 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                              {/* Deadlines list */}
                              <div className="glass-panel rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-amber-400" /> Upcoming Deadlines
                                  </h2>
                                </div>
                                {stats?.upcomingDeadlines && stats.upcomingDeadlines.length > 0 ? (
                                  <div className="space-y-3">
                                    {stats.upcomingDeadlines.map((item, i) => {
                                      const daysUntil = Math.ceil((item.due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                      const urgent = daysUntil <= 2;
                                      return (
                                        <div
                                          key={i}
                                          onClick={() => {
                                            if (item.projectId) {
                                              switchProject(item.projectId);
                                              navigate(`/tasks?project=${item.projectId}`);
                                            }
                                          }}
                                          className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 transition-colors cursor-pointer"
                                        >
                                          <div className="min-w-0 pr-3">
                                            <p className="text-xs font-bold text-foreground truncate">{item.task}</p>
                                            <p className="text-[11px] text-muted-foreground truncate">{item.project}</p>
                                          </div>
                                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg whitespace-nowrap ${
                                            urgent ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-secondary text-muted-foreground'
                                          }`}>
                                            {daysUntil <= 0 ? 'Overdue' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="text-center py-6 text-muted-foreground text-xs">
                                    No upcoming urgent deadlines.
                                  </div>
                                )}
                              </div>

                              {/* Project Health */}
                              <div className="glass-panel rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                                    <Flame className="w-4 h-4 text-orange-500" /> Project Health Overview
                                  </h2>
                                  <Link to="/ai-pm" className="text-xs text-muted-foreground hover:text-foreground">
                                    AI Health →
                                  </Link>
                                </div>
                                {stats?.projectHealthScores && stats.projectHealthScores.length > 0 ? (
                                  <div className="space-y-3">
                                    {stats.projectHealthScores.map((item, i) => (
                                      <div key={i} className="p-2.5 rounded-xl hover:bg-secondary/40 transition-all">
                                        <div className="flex items-center justify-between mb-1 text-xs">
                                          <span className="font-semibold text-foreground truncate max-w-[70%]">{item.title}</span>
                                          <span className={`font-bold ${
                                            (item.score ?? 100) >= 75 ? 'text-emerald-400' :
                                            (item.score ?? 100) >= 50 ? 'text-amber-400' : 'text-red-400'
                                          }`}>
                                            {item.score !== null ? `${item.score}%` : 'Evaluating'}
                                          </span>
                                        </div>
                                        <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                                          <div
                                            className={`h-1.5 rounded-full transition-all duration-700 ${
                                              (item.score ?? 100) >= 75 ? 'bg-emerald-500' :
                                              (item.score ?? 100) >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                            }`}
                                            style={{ width: `${item.score ?? 100}%` }}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-center py-6 text-muted-foreground text-xs">
                                    Health metrics active once projects have commits and task updates.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 5. Recent Activity */}
                        {widget.id === 'activity' && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-4 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="glass-panel rounded-2xl p-6">
                              <div className="flex items-center justify-between mb-4">
                                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                                  <Activity className="w-4 h-4 text-primary" /> Workspace Activity Feed
                                </h2>
                              </div>
                              {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                                <div className="space-y-2.5">
                                  {stats.recentActivity.map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-secondary/40 transition-colors">
                                      <div className="p-2 rounded-lg bg-secondary text-primary flex-shrink-0">
                                        <Activity className="w-3.5 h-3.5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs text-foreground truncate">
                                          <span className="font-bold">{item.user}</span>{' '}{item.action}{' '}
                                          {item.target && <span className="text-primary font-semibold">"{item.target}"</span>}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">{item.time}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-6 text-muted-foreground text-xs">
                                  No recent logs recorded.
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 6. Quick Actions */}
                        {widget.id === 'quickactions' && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-4 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="glass-panel rounded-2xl p-6">
                              <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-yellow-500" /> Quick Actions
                              </h2>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                  { label: 'AI Project Manager', icon: Sparkles, to: '/ai-pm', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                                  { label: 'Task Board', icon: CheckSquare, to: '/tasks', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                                  { label: 'GitHub Repositories', icon: FolderOpen, to: '/github', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                                  { label: 'Analytics & Velocity', icon: TrendingUp, to: '/analytics', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                                ].map((action) => (
                                  <Link
                                    key={action.label}
                                    to={action.to}
                                    className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border ${action.bg} hover:scale-[1.02] transition-all text-center`}
                                  >
                                    <action.icon className={`w-5 h-5 ${action.color}`} />
                                    <span className="text-xs font-bold text-foreground">{action.label}</span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}
