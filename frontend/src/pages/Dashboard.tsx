import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import {
  LayoutDashboard, FolderOpen, Users, CheckSquare, Clock, TrendingUp,
  Zap, ArrowUpRight, AlertTriangle, Plus, Activity,
  Calendar, Flame, Loader2, GripVertical, EyeOff, Eye, Settings2
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import api from '../utils/api';
import Skeleton from '../components/Skeleton';
const DEFAULT_WIDGETS = [
  { id: 'stats', label: 'Overview Stats', visible: true },
  { id: 'activity', label: 'Recent Activity', visible: true },
  { id: 'deadlines', label: 'Upcoming Deadlines', visible: true },
  { id: 'health', label: 'Project Health', visible: true },
  { id: 'quickactions', label: 'Quick Actions', visible: true },
  { id: 'aibanner', label: 'AI Insight', visible: true },
];

function loadWidgets() {
  try { return JSON.parse(localStorage.getItem('dash_widgets') || 'null') || DEFAULT_WIDGETS; }
  catch { return DEFAULT_WIDGETS; }
}
function saveWidgets(w: typeof DEFAULT_WIDGETS) {
  localStorage.setItem('dash_widgets', JSON.stringify(w));
}

interface DashStats {
  projects: number;
  openTasks: number;
  totalTasks: number;
  teamMembers: number;
  recentActivity: any[];
  upcomingDeadlines: any[];
  projectHealthScores: { title: string; score: number | null }[];
  notifications: number;
}

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const [greeting, setGreeting] = useState('Good morning');
  const [stats, setStats] = useState<DashStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<typeof DEFAULT_WIDGETS>(loadWidgets);
  const [showWidgetMenu, setShowWidgetMenu] = useState(false);

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

  const isVisible = (id: string) => widgets.find((w: any) => w.id === id)?.visible !== false;

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 12 && h < 17) setGreeting('Good afternoon');
    else if (h >= 17) setGreeting('Good evening');
  }, []);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const teamsRes = await api.get('/teams/my-teams');
        const teams = teamsRes.data.teams || [];

        let totalProjects = 0;
        let openTasks = 0;
        let totalTasks = 0;
        const memberSet = new Set<string>();
        const allDeadlines: any[] = [];
        const allActivity: any[] = [];
        const projectScores: { title: string; score: number | null }[] = [];

        const projectEntries = teams.flatMap((team: any) => {
          (team.members || []).forEach((member: any) => memberSet.add(member.userId || member.user?.id));
          return (team.projects || []).map((project: any) => ({ team, project }));
        });
        totalProjects = projectEntries.length;

        // Project details and activity logs are independent, so load them concurrently.
        const [projectResults, activityResults] = await Promise.all([
          Promise.allSettled(projectEntries.map(({ project }: any) => api.get(`/projects/${project.id}/summary`))),
          Promise.allSettled(
            projectEntries.slice(0, 5).map(({ project }: any) => api.get(`/misc/projects/${project.id}/activities`))
          )
        ]);

        projectResults.forEach((result) => {
          if (result.status !== 'fulfilled') return;
          const p = result.value.data.project;
          const tasks = p.tasks || [];
          totalTasks += tasks.length;
          const notDone = tasks.filter((task: any) => task.status !== 'COMPLETED');
          openTasks += notDone.length;

          notDone
            .filter((task: any) => task.dueDate)
            .forEach((task: any) => {
              allDeadlines.push({ task: task.title, project: p.title, due: new Date(task.dueDate) });
            });

          projectScores.push({
            title: p.title,
            score: typeof p.healthScore === 'number' ? p.healthScore : null
          });
        });

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
            allActivity.push({
              user: log.user?.name || 'Someone',
              action: log.action.replace(/_/g, ' ').toLowerCase(),
              target: log.metadata?.title || '',
              time: new Date(log.createdAt).toLocaleDateString(),
            });
          });

        // Sort deadlines ascending
        allDeadlines.sort((a, b) => a.due - b.due);

        setStats({
          projects: totalProjects,
          openTasks,
          totalTasks,
          teamMembers: memberSet.size,
          recentActivity: allActivity,
          upcomingDeadlines: allDeadlines.slice(0, 4),
          projectHealthScores: projectScores.slice(0, 4),
          notifications: 0,
        });
      } catch (err) {
        console.error('Dashboard load error:', err);
        // Set default empty state on error
        setStats({
          projects: 0,
          openTasks: 0,
          totalTasks: 0,
          teamMembers: 0,
          recentActivity: [],
          upcomingDeadlines: [],
          projectHealthScores: [],
          notifications: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const completionRate = stats && stats.totalTasks > 0
    ? Math.round(((stats.totalTasks - stats.openTasks) / stats.totalTasks) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        )}
        <div>
          <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5">
            <LayoutDashboard className="w-3.5 h-3.5" /> Main Dashboard
          </p>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
            {greeting}, {user?.name?.split(' ')[0] ?? 'Student'} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Here's what's happening across your projects today.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button onClick={() => setShowWidgetMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 glass-card text-sm font-semibold text-foreground rounded-xl hover:bg-secondary transition-all border border-border">
              <Settings2 className="w-4 h-4" /> Widgets
            </button>
            {showWidgetMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 glass-panel rounded-xl border border-border p-2 z-20 shadow-xl">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-2 py-1 mb-1">Toggle Widgets</p>
                {widgets.map((w: any) => (
                  <button key={w.id} onClick={() => toggleWidget(w.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors text-left">
                    {w.visible ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className={`text-xs font-semibold ${w.visible ? 'text-foreground' : 'text-muted-foreground'}`}>{w.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link to="/projects"
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-sm font-medium rounded-xl transition-all">
            <FolderOpen className="w-4 h-4" /> Projects
          </Link>
          <Link to="/projects"
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all">
            <Plus className="w-4 h-4" /> New
          </Link>
        </div>
      </div>

      {/* Widgets */}
      {loading ? (
        <div className="glass-panel rounded-2xl p-12 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading workspace overview...</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="dashboard-widgets">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-6">
                {widgets.map((widget: any, index: number) => (
                  <Draggable key={widget.id} draggableId={widget.id} index={index}>
                    {(drag, snapshot) => (
                      <div ref={drag.innerRef} {...drag.draggableProps}
                        className={`transition-shadow ${snapshot.isDragging ? 'shadow-2xl scale-[1.01]' : ''} ${!widget.visible ? 'hidden' : ''}`}>
                        {/* Stat Cards Widget */}
                        {widget.id === 'stats' && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                              {[
                                { label: 'Active Projects', value: stats?.projects ?? 0, change: `${stats?.projects ?? 0} total`, positive: true, icon: FolderOpen, color: 'text-blue-400', glow: 'glow-primary', to: '/projects' },
                                { label: 'Open Tasks', value: stats?.openTasks ?? 0, change: `${stats?.totalTasks ?? 0} total`, positive: (stats?.openTasks ?? 0) === 0, icon: CheckSquare, color: 'text-amber-400', glow: 'glow-amber', to: '/tasks' },
                                { label: 'Team Members', value: stats?.teamMembers ?? 0, change: 'across teams', positive: true, icon: Users, color: 'text-emerald-400', glow: 'glow-emerald', to: '/teams' },
                                { label: 'Completion Rate', value: `${completionRate}%`, change: `${stats?.totalTasks ?? 0} total tasks`, positive: completionRate >= 50, icon: TrendingUp, color: 'text-purple-400', glow: 'glow-primary', to: '/analytics' },
                              ].map((card) => (
                                <Link key={card.label} to={card.to} className="glass-card rounded-2xl p-5 relative overflow-hidden group hover:border-primary/40 hover:bg-slate-900/50 transition-all cursor-pointer block">
                                  <div className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 bg-white -translate-y-6 translate-x-6 group-hover:opacity-10 transition-opacity" />
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

                        {/* Activity Widget */}
                        {widget.id === 'activity' && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-4 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="glass-panel rounded-2xl p-6">
                              <div className="flex items-center justify-between mb-5">
                                <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Recent Activity</h2>
                                <Link to="/analytics" className="text-xs text-muted-foreground hover:text-foreground transition-colors">View all →</Link>
                              </div>
                              {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                                <div className="space-y-3">
                                  {stats.recentActivity.map((item, i) => (
                                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl hover:bg-secondary transition-colors">
                                      <div className="p-2 rounded-lg bg-secondary mt-0.5 flex-shrink-0"><Activity className="w-3.5 h-3.5 text-primary" /></div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-foreground"><span className="font-semibold">{item.user}</span>{' '}{item.action}{' '}
                                          {item.target && <span className="text-primary font-semibold">"{item.target}"</span>}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{item.time}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-10 text-center">
                                  <Activity className="w-10 h-10 text-muted-foreground mb-3" />
                                  <p className="text-muted-foreground text-sm">No recent activity yet.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Deadlines + Health side-by-side */}
                        {(widget.id === 'deadlines' || widget.id === 'health') && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-4 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                              {widget.id === 'deadlines' && isVisible('deadlines') && (
                                <div className="glass-panel rounded-2xl p-6">
                                  <h2 className="text-base font-bold text-foreground flex items-center gap-2 mb-5"><Clock className="w-4 h-4 text-amber-500" /> Upcoming Deadlines</h2>
                                  {stats?.upcomingDeadlines && stats.upcomingDeadlines.length > 0 ? (
                                    <div className="space-y-3">
                                      {stats.upcomingDeadlines.map((item, i) => {
                                        const daysUntil = Math.ceil((item.due - Date.now()) / (1000 * 60 * 60 * 24));
                                        const urgent = daysUntil <= 1;
                                        return (
                                          <Link key={i} to="/tasks" className="flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors block">
                                            <div className={`w-1.5 min-h-[36px] rounded-full flex-shrink-0 ${urgent ? 'bg-red-500' : 'bg-border'}`} />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-semibold text-foreground truncate">{item.task}</p>
                                              <p className="text-xs text-muted-foreground truncate">{item.project}</p>
                                            </div>
                                            <span className={`text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap ${urgent ? 'bg-red-500/15 text-red-500' : 'bg-secondary text-muted-foreground'}`}>
                                              {daysUntil <= 0 ? 'Overdue' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`}
                                            </span>
                                          </Link>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="text-center py-6"><CheckSquare className="w-8 h-8 text-emerald-500/50 mx-auto mb-2" /><p className="text-muted-foreground text-xs">No upcoming deadlines — great job!</p></div>
                                  )}
                                </div>
                              )}
                              {widget.id === 'health' && isVisible('health') && (
                                <div className="glass-panel rounded-2xl p-6">
                                  <div className="flex items-center justify-between mb-5">
                                    <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Flame className="w-4 h-4 text-orange-500" /> Project Health</h2>
                                    <Link to="/analytics" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Details →</Link>
                                  </div>
                                  {stats?.projectHealthScores && stats.projectHealthScores.length > 0 ? (
                                    <div className="space-y-4">
                                      {stats.projectHealthScores.map((item, i) => (
                                        <Link key={i} to="/analytics" className="block hover:bg-slate-900/30 p-2 rounded-xl transition-all">
                                          <div className="flex items-center justify-between mb-1.5">
                                            <p className="text-xs text-foreground font-semibold truncate max-w-[65%]">{item.title}</p>
                                            {item.score === null ? (
                                              <span className="text-xs font-bold text-muted-foreground">Not enough data</span>
                                            ) : (
                                              <span className={`text-xs font-bold ${item.score >= 75 ? 'text-emerald-500' : item.score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{item.score}%</span>
                                            )}
                                          </div>
                                          {item.score !== null && (
                                            <div className="w-full bg-secondary rounded-full h-1.5">
                                              <div className={`h-1.5 rounded-full transition-all duration-700 ${item.score >= 75 ? 'bg-emerald-500' : item.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${item.score}%` }} />
                                            </div>
                                          )}
                                        </Link>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-center py-4"><p className="text-muted-foreground text-xs">Create projects to see health scores</p></div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Quick Actions Widget */}
                        {widget.id === 'quickactions' && widget.visible && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-4 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="glass-panel rounded-2xl p-6">
                              <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /> Quick Actions</h2>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                  { label: 'AI Project Planner', icon: Zap, to: '/ai', color: 'text-purple-500', bg: 'bg-purple-500/10 border-purple-500/20 hover:border-purple-500/40' },
                                  { label: 'Create New Task', icon: CheckSquare, to: '/tasks', color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40' },
                                  { label: 'Calendar', icon: Calendar, to: '/calendar', color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40' },
                                  { label: 'View Analytics', icon: TrendingUp, to: '/analytics', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40' },
                                ].map((action) => (
                                  <Link key={action.label} to={action.to}
                                    className={`flex flex-col items-center gap-2.5 p-4 rounded-xl border ${action.bg} transition-all group`}>
                                    <action.icon className={`w-6 h-6 ${action.color} group-hover:scale-110 transition-transform`} />
                                    <span className="text-xs font-semibold text-foreground text-center leading-snug">{action.label}</span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* AI Banner Widget */}
                        {widget.id === 'aibanner' && widget.visible && (stats?.openTasks ?? 0) > 0 && (
                          <div className="group/widget relative">
                            <div className="absolute -left-6 top-4 opacity-0 group-hover/widget:opacity-100 transition-opacity cursor-grab" {...drag.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="glass-panel rounded-2xl p-5 border-primary/20 relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-purple-500/5 pointer-events-none" />
                              <div className="flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex-shrink-0"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
                                <div>
                                  <p className="text-sm font-bold text-foreground mb-0.5">⚡ AI Planner Available</p>
                                  <p className="text-xs text-muted-foreground">You have {stats?.openTasks} open tasks. Use AI Sprint Planner to generate a roadmap.</p>
                                </div>
                                <Link to="/ai" className="ml-auto flex-shrink-0 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all whitespace-nowrap">Run AI Planner</Link>
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
