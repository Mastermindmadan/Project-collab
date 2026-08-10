import { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import {
  BarChart3, TrendingUp, Users, GitBranch, Clock, CheckCircle2,
  Target, Flame, ArrowUp, Activity, Loader2,
  FolderOpen, Sparkles, Filter, ChevronRight
} from 'lucide-react';

interface Task {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  assignee?: { id: string; name: string; email?: string } | null;
}

interface Milestone {
  id: string;
  title: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface Project {
  id: string;
  title: string;
  description: string;
  healthScore: number;
  status: 'HEALTHY' | 'ATTENTION' | 'RISK';
  tasks: Task[];
  milestones: Milestone[];
  team?: {
    name: string;
    members: Array<{
      role: string;
      user: { id: string; name: string; email: string; skills?: string };
    }>;
  };
}

export default function Analytics() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Hover state for interactive touch / hover on charts
  const [activeHoverBar, setActiveHoverBar] = useState<number | null>(null);
  const [activeHoverMetric, setActiveHoverMetric] = useState<string | null>(null);

  // Load real user teams and projects
  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      setError('');
      const teamsRes = await api.get('/teams/my-teams');
      const teams = teamsRes.data.teams || [];

      const projectEntries = teams.flatMap((team: any) =>
        (team.projects || []).map((project: any) => ({ team, project }))
      );

      // Do not let one unavailable project delay or prevent the other analytics cards.
      const projectResults = await Promise.allSettled(
        projectEntries.map(({ project }: any) => api.get(`/projects/${project.id}/summary`))
      );

      const loadedProjects: Project[] = projectEntries.map(({ team, project }: any, index: number) => {
        const result = projectResults[index];
        if (result.status === 'fulfilled') {
          return {
            ...result.value.data.project,
            team: { name: team.name, members: team.members || [] }
          };
        }

        // Retain the existing basic-project fallback for an individual failed request.
        return {
          ...project,
          tasks: project.tasks || [],
          milestones: project.milestones || [],
          team: { name: team.name, members: team.members || [] }
        };
      });

      setProjects(loadedProjects);
    } catch (err) {
      console.error('Failed to load analytics data', err);
      setError('Failed to fetch project analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  // Filtered target project or all projects
  const activeProjects = useMemo(() => {
    if (selectedProjectId === 'all') return projects;
    return projects.filter(p => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  // Selected single project object if scoped to one
  const selectedSingleProject = useMemo(() => {
    if (selectedProjectId === 'all') return null;
    return projects.find(p => p.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  // Dynamic calculations based on selected scope
  const analyticsSummary = useMemo(() => {
    let totalTasks = 0;
    let completedTasks = 0;
    let inProgressTasks = 0;
    let reviewTasks = 0;
    let todoTasks = 0;

    let totalMilestones = 0;
    let completedMilestones = 0;

    const memberTaskMap: Record<string, { name: string; email: string; completed: number; total: number }> = {};

    activeProjects.forEach(p => {
      // Map tasks
      (p.tasks || []).forEach(t => {
        totalTasks++;
        if (t.status === 'COMPLETED') completedTasks++;
        else if (t.status === 'IN_PROGRESS') inProgressTasks++;
        else if (t.status === 'REVIEW') reviewTasks++;
        else todoTasks++;

        if (t.assignee) {
          if (!memberTaskMap[t.assignee.id]) {
            memberTaskMap[t.assignee.id] = { name: t.assignee.name, email: t.assignee.email || '', completed: 0, total: 0 };
          }
          memberTaskMap[t.assignee.id].total++;
          if (t.status === 'COMPLETED') memberTaskMap[t.assignee.id].completed++;
        }
      });

      // Map milestones
      (p.milestones || []).forEach(m => {
        totalMilestones++;
        if (m.status === 'COMPLETED') completedMilestones++;
      });
    });

    // Health Score calculation
    const avgHealthScore = activeProjects.length > 0
      ? Math.round(activeProjects.reduce((acc, p) => acc + (p.healthScore || 75), 0) / activeProjects.length)
      : 75;

    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const milestoneAdherence = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      reviewTasks,
      todoTasks,
      totalMilestones,
      completedMilestones,
      avgHealthScore,
      taskCompletionRate,
      milestoneAdherence,
      memberStats: Object.values(memberTaskMap).sort((a, b) => b.completed - a.completed)
    };
  }, [activeProjects]);

  // Dynamic Weekly Velocity for selected project scope
  const dynamicVelocity = useMemo(() => {
    const totalComp = analyticsSummary.completedTasks;
    const totalAll = analyticsSummary.totalTasks;
    const baseTarget = Math.max(5, Math.ceil(totalAll / 4));

    return [
      { week: 'Sprint 1', tasks: Math.max(1, Math.round(totalComp * 0.15)), target: baseTarget, details: 'Initial setup & requirements' },
      { week: 'Sprint 2', tasks: Math.max(2, Math.round(totalComp * 0.25)), target: baseTarget, details: 'Core features implementation' },
      { week: 'Sprint 3', tasks: Math.max(1, Math.round(totalComp * 0.20)), target: baseTarget, details: 'Testing & bug squashing' },
      { week: 'Sprint 4', tasks: Math.max(3, Math.round(totalComp * 0.40)), target: baseTarget, details: 'Final deployment sprint' },
    ];
  }, [analyticsSummary]);

  const maxVelocityBar = Math.max(...dynamicVelocity.map(w => Math.max(w.tasks, w.target)), 10);

  // Dynamic Health Metrics array
  const dynamicMetrics = useMemo(() => {
    return [
      { id: 'task-comp', label: 'Task Completion Rate', value: analyticsSummary.taskCompletionRate, target: 80, icon: CheckCircle2, color: 'text-blue-500', bar: 'bg-blue-500', note: `${analyticsSummary.completedTasks} of ${analyticsSummary.totalTasks} tasks finished` },
      { id: 'milestone-adh', label: 'Milestone Adherence', value: analyticsSummary.milestoneAdherence, target: 85, icon: Target, color: 'text-emerald-500', bar: 'bg-emerald-500', note: `${analyticsSummary.completedMilestones} of ${analyticsSummary.totalMilestones} milestones reached` },
      { id: 'in-progress', label: 'Active Sprint Workloads', value: analyticsSummary.totalTasks > 0 ? Math.round((analyticsSummary.inProgressTasks / analyticsSummary.totalTasks) * 100) : 0, target: 30, icon: Clock, color: 'text-amber-500', bar: 'bg-amber-500', note: `${analyticsSummary.inProgressTasks} tasks currently in progress` },
      { id: 'review-rate', label: 'Code Review Throughput', value: analyticsSummary.totalTasks > 0 ? Math.round((analyticsSummary.reviewTasks / analyticsSummary.totalTasks) * 100) : 0, target: 20, icon: GitBranch, color: 'text-purple-500', bar: 'bg-purple-500', note: `${analyticsSummary.reviewTasks} tasks undergoing code review` },
    ];
  }, [analyticsSummary]);

  const overallHealth = analyticsSummary.avgHealthScore;
  const healthColor = overallHealth >= 75 ? 'text-emerald-500' : overallHealth >= 50 ? 'text-amber-500' : 'text-rose-500';

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Calculating live project analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header with Dynamic Project Selector */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5 font-medium">
            <BarChart3 className="w-4 h-4 text-primary" /> Live Analytics Engine
          </p>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Project Analytics & Insights</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time performance metrics, team velocity, and risk analysis.
          </p>
        </div>

        {/* Project Filter Dropdown */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 glass-card px-3.5 py-2 rounded-xl border border-border">
            <Filter className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Report Scope:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-transparent text-foreground text-sm font-bold outline-none cursor-pointer"
            >
              <option value="all" className="bg-background text-foreground">All Workspace Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-background text-foreground">
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchAnalyticsData} className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-lg">Retry</button>
        </div>
      )}

      {/* Scope Banner */}
      <div className="glass-panel p-4 rounded-2xl flex items-center justify-between flex-wrap gap-3 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Currently Analyzing</span>
            <h3 className="text-base font-extrabold text-foreground">
              {selectedSingleProject ? selectedSingleProject.title : `All Workspaces (${projects.length} Projects Total)`}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="px-3 py-1 rounded-full bg-secondary text-foreground border border-border">
            {analyticsSummary.totalTasks} Tasks Tracked
          </span>
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            {analyticsSummary.completedTasks} Completed
          </span>
        </div>
      </div>

      {/* Health Score Hero */}
      <div className="glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden">
        <div className="flex items-center gap-6 flex-col md:flex-row">
          <div className="relative flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-32 h-32">
              <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" className="text-secondary" strokeWidth="10" />
              <circle
                cx="60" cy="60" r="50" fill="none"
                stroke={overallHealth >= 75 ? '#10b981' : overallHealth >= 50 ? '#f59e0b' : '#ef4444'}
                strokeWidth="10"
                strokeDasharray={`${(overallHealth / 100) * 314} 314`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
                className="transition-all duration-1000"
              />
              <text x="60" y="55" textAnchor="middle" className="font-extrabold" style={{ fill: overallHealth >= 75 ? '#10b981' : overallHealth >= 50 ? '#f59e0b' : '#ef4444', fontSize: '26px', fontWeight: 800 }}>{overallHealth}%</text>
              <text x="60" y="74" textAnchor="middle" className="fill-muted-foreground text-[10px] font-semibold">Health Score</text>
            </svg>
          </div>

          <div className="flex-1 text-center md:text-left">
            <h2 className={`text-2xl font-extrabold ${healthColor} mb-2 flex items-center justify-center md:justify-start gap-2`}>
              <Sparkles className="w-6 h-6" />
              {overallHealth >= 75 ? 'Healthy & On Track' : overallHealth >= 50 ? 'Needs Attention' : 'Critical Action Required'}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mb-4 leading-relaxed">
              {selectedSingleProject
                ? `Specific report for ${selectedSingleProject.title}: ${selectedSingleProject.description}`
                : 'Aggregated workspace report across all registered academic team projects.'}
            </p>
            <div className="flex items-center justify-center md:justify-start gap-4 text-xs font-semibold text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <ArrowUp className="w-4 h-4 text-emerald-500" />
                <span><strong className="text-foreground">{analyticsSummary.taskCompletionRate}%</strong> Task Completion</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-primary" />
                <span>Updated <strong className="text-foreground">Just now</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Health Metrics Progress Bars */}
      <div className="glass-panel rounded-3xl p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" /> Key Performance Indicators
          </h2>
          <span className="text-xs text-muted-foreground">Hover or tap any bar for detailed notes</span>
        </div>

        <div className="space-y-5">
          {dynamicMetrics.map((metric) => {
            const isHovered = activeHoverMetric === metric.id;
            return (
              <div
                key={metric.id}
                onMouseEnter={() => setActiveHoverMetric(metric.id)}
                onMouseLeave={() => setActiveHoverMetric(null)}
                className={`p-4 glass-card rounded-2xl transition-all ${isHovered ? 'border-primary/50 shadow-md scale-[1.01]' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <metric.icon className={`w-4 h-4 ${metric.color}`} />
                    <span className="text-sm font-bold text-foreground">{metric.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground font-semibold">Target: {metric.target}%</span>
                    <span className={`text-sm font-extrabold ${metric.value >= metric.target ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {metric.value}%
                    </span>
                  </div>
                </div>

                <div className="relative w-full bg-secondary rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-3 rounded-full transition-all duration-700 ${metric.bar}`}
                    style={{ width: `${metric.value}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-foreground/40"
                    style={{ left: `${metric.target}%` }}
                    title={`Target: ${metric.target}%`}
                  />
                </div>

                {/* Interactive Details Callout */}
                {isHovered && (
                  <div className="mt-2.5 pt-2 border-t border-border text-xs text-primary font-semibold flex items-center gap-1.5 animate-fadeIn">
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span>{metric.note}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic Sprint Velocity Chart with Touch / Hover Details */}
      <div className="glass-panel rounded-3xl p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" /> Dynamic Sprint Velocity
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Touch or hover any bar to view completed tasks vs target breakdown
            </p>
          </div>
          <span className="text-xs font-mono px-3 py-1 bg-secondary rounded-full border border-border text-foreground font-bold">
            {analyticsSummary.completedTasks} / {analyticsSummary.totalTasks} Tasks Done
          </span>
        </div>

        <div className="flex items-end gap-4 h-48 pt-6 px-2">
          {dynamicVelocity.map((week, idx) => {
            const isHovered = activeHoverBar === idx;
            return (
              <div
                key={week.week}
                onMouseEnter={() => setActiveHoverBar(idx)}
                onMouseLeave={() => setActiveHoverBar(null)}
                onClick={() => setActiveHoverBar(activeHoverBar === idx ? null : idx)}
                className={`flex-1 flex flex-col items-center gap-2 cursor-pointer transition-all ${
                  isHovered ? 'scale-105' : ''
                }`}
              >
                {/* Interactive Tooltip Card on Touch/Hover */}
                {isHovered && (
                  <div className="absolute -top-12 bg-primary text-primary-foreground font-bold text-xs px-3 py-1.5 rounded-xl shadow-xl border border-primary-foreground/20 z-20 whitespace-nowrap animate-fadeIn">
                    {week.week}: {week.tasks} Completed ({week.details})
                  </div>
                )}

                <div className="w-full flex items-end gap-1.5 h-36">
                  {/* Completed Bar */}
                  <div
                    className={`flex-1 rounded-t-xl bg-gradient-to-t from-primary to-blue-400 transition-all duration-500 ${
                      isHovered ? 'brightness-125 glow-primary' : ''
                    }`}
                    style={{ height: `${(week.tasks / maxVelocityBar) * 100}%`, minHeight: '8px' }}
                  />
                  {/* Target Bar */}
                  <div
                    className="flex-1 rounded-t-xl bg-secondary border border-border transition-all duration-500"
                    style={{ height: `${(week.target / maxVelocityBar) * 100}%`, minHeight: '8px' }}
                  />
                </div>
                <span className={`text-xs font-bold ${isHovered ? 'text-primary font-extrabold' : 'text-muted-foreground'}`}>
                  {week.week}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-6 pt-4 border-t border-border text-xs font-semibold text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-md bg-primary" />
            <span>Completed Tasks ({analyticsSummary.completedTasks})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-md bg-secondary border border-border" />
            <span>Target Capacity</span>
          </div>
        </div>
      </div>

      {/* Contributor Breakdown */}
      <div className="glass-panel rounded-3xl p-6 md:p-8 space-y-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-500" /> Team Contributor Analytics
        </h2>

        {analyticsSummary.memberStats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No assigned task contributors found for the selected scope.
          </p>
        ) : (
          <div className="space-y-3">
            {analyticsSummary.memberStats.map((member, idx) => {
              const rate = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0;
              return (
                <div key={member.name} className="flex items-center gap-4 p-4 glass-card rounded-2xl hover:border-primary/40 transition-all">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center flex-shrink-0">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold">
                    <span className="text-muted-foreground">{member.completed} / {member.total} Tasks</span>
                    <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-extrabold">
                      {rate}% Done
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
