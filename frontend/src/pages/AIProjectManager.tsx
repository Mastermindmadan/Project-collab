import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  BrainCircuit, Sparkles, FolderOpen, AlertTriangle, CheckCircle2,
  Clock, Users, CheckSquare, Loader2,
  ChevronRight, ShieldCheck, Zap, AlertCircle,
  ArrowRight, Github, Target
} from 'lucide-react';
import api from '../utils/api';
import { toast } from 'sonner';
import { useProjectStore } from '../store/project.store';

interface ProjectOption {
  id: string;
  title: string;
  description: string;
  healthScore: number;
  status: 'HEALTHY' | 'ATTENTION' | 'RISK';
  teamName: string;
  githubRepo?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  tasksCount: number;
  milestonesCount: number;
}

interface ProjectDetails {
  id: string;
  title: string;
  description: string;
  healthScore: number;
  status: 'HEALTHY' | 'ATTENTION' | 'RISK';
  githubRepo?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  techStack?: string[];
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate?: string | null;
    assignee?: { id: string; name: string } | null;
  }>;
  milestones: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string;
  }>;
  gitAnalytics?: {
    commitsCount: number;
    lastCommitTime?: string;
  } | null;
  team?: {
    id: string;
    name: string;
    members: Array<{
      role: string;
      user: { id: string; name: string; email: string; avatarUrl?: string };
    }>;
  };
}

interface AIInsight {
  type: 'delay' | 'low_activity' | 'progress' | 'risk';
  title: string;
  message: string;
}

interface AIRecommendation {
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

interface AIAnalysisResult {
  summary: string;
  healthScore: number;
  healthStatus: 'HEALTHY' | 'ATTENTION' | 'RISK';
  insights: AIInsight[];
  recommendations: AIRecommendation[];
  metrics: {
    tasksTotal: number;
    tasksCompleted: number;
    tasksOverdue: number;
    tasksPending: number;
    milestonesTotal: number;
    milestonesCompleted: number;
    milestonesOverdue: number;
    commitsCount: number;
    activeMembersCount: number;
    teamName: string;
    ownerName: string;
    githubRepo: string | null;
  };
}

export default function AIProjectManager() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Analysis states
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // ── 1. Load accessible projects on mount ──────────────────────────────────────
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoadingProjects(true);
        const res = await api.get('/teams/my-teams');
        const teams = res.data.teams || [];

        const projs: ProjectOption[] = [];
        teams.forEach((t: any) => {
          (t.projects || []).forEach((p: any) => {
            projs.push({
              id: p.id,
              title: p.title,
              description: p.description,
              healthScore: p.healthScore ?? 100,
              status: p.status || 'HEALTHY',
              teamName: t.name,
              githubRepo: p.githubRepo,
              startDate: p.startDate,
              endDate: p.endDate,
              tasksCount: p.tasks?.length || 0,
              milestonesCount: p.milestones?.length || 0,
            });
          });
        });

        setProjects(projs);

        // Preselect from URL param, activeProjectId from store, or first project
        const paramProjectId = searchParams.get('project');
        const activeStorePid = useProjectStore.getState().activeProjectId;
        if (paramProjectId && projs.some((p) => p.id === paramProjectId)) {
          setSelectedProjectId(paramProjectId);
        } else if (activeStorePid && projs.some((p) => p.id === activeStorePid)) {
          setSelectedProjectId(activeStorePid);
          setSearchParams({ project: activeStorePid }, { replace: true });
        } else if (projs.length > 0) {
          setSelectedProjectId(projs[0].id);
          setSearchParams({ project: projs[0].id }, { replace: true });
        }
      } catch (err) {
        console.error('Failed to load projects for AI Project Manager:', err);
      } finally {
        setLoadingProjects(false);
      }
    };

    fetchProjects();
  }, []);

  // ── 2. Load detailed project data when selectedProjectId changes ─────────────
  const loadProjectDetails = useCallback(async (projectId: string) => {
    if (!projectId) return;
    try {
      setLoadingDetails(true);
      setAnalysisError(null);
      const res = await api.get(`/projects/${projectId}`);
      const proj: ProjectDetails = res.data.project;
      setProjectDetails(proj);

      // Check if we have cached analysis for this project
      const cached = localStorage.getItem(`aipm_analysis_${projectId}`);
      if (cached) {
        try {
          setAnalysisResult(JSON.parse(cached));
        } catch {
          setAnalysisResult(null);
        }
      } else {
        setAnalysisResult(null);
      }
    } catch (err) {
      console.error('Failed to load project details:', err);
      setProjectDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetails(selectedProjectId);
    }
  }, [selectedProjectId, loadProjectDetails]);

  // Handle switching project from dropdown
  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    useProjectStore.getState().switchProject(projectId);
    setSearchParams({ project: projectId });
  };

  // ── 3. Run AI Project Analysis ───────────────────────────────────────────────
  const handleRunAnalysis = async () => {
    if (!selectedProjectId) return;
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await api.post(`/ai/projects/${selectedProjectId}/analyze`);
      const analysis: AIAnalysisResult = res.data.analysis;

      setAnalysisResult(analysis);
      localStorage.setItem(`aipm_analysis_${selectedProjectId}`, JSON.stringify(analysis));
      toast.success('Project Analysis Complete', {
        description: `Project health evaluated at ${analysis.healthScore}%.`,
      });
    } catch (err: any) {
      console.error('Failed to analyze project:', err);
      setAnalysisError(err.response?.data?.message || err.response?.data?.error || 'Failed to complete project analysis. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Derived metrics from actual project details
  const totalTasks = projectDetails?.tasks?.length || 0;
  const completedTasks = projectDetails?.tasks?.filter((t) => t.status === 'COMPLETED').length || 0;
  const overdueTasks = projectDetails?.tasks?.filter(
    (t) => t.status !== 'COMPLETED' && t.dueDate && new Date(t.dueDate) < new Date()
  ).length || 0;
  const totalMilestones = projectDetails?.milestones?.length || 0;
  const completedMilestones = projectDetails?.milestones?.filter((m) => m.status === 'COMPLETED').length || 0;
  const commitsCount = projectDetails?.gitAnalytics?.commitsCount || 0;
  const activeMembersCount = projectDetails?.team?.members?.length || 0;
  const ownerMember = projectDetails?.team?.members?.find((m) => m.role === 'OWNER');
  const ownerName = ownerMember?.user?.name || 'Project Owner';

  // Fallback health status
  const currentHealth = analysisResult ? analysisResult.healthScore : (projectDetails?.healthScore ?? 100);
  const currentStatus = analysisResult
    ? analysisResult.healthStatus
    : currentHealth >= 75
    ? 'HEALTHY'
    : currentHealth >= 50
    ? 'ATTENTION'
    : 'RISK';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Project Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-6 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary glow-primary flex-shrink-0">
            <BrainCircuit className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">AI Project Manager</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-semibold uppercase tracking-wider">
                Monitoring Engine
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Select an existing project to analyze real milestones, tasks, deadlines, codebase commits, and schedule risks.
            </p>
          </div>
        </div>

        {/* Project Selector Dropdown */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">
            Project:
          </label>
          <div className="relative min-w-[240px]">
            <FolderOpen className="w-4 h-4 text-primary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedProjectId}
              onChange={(e) => handleSelectProject(e.target.value)}
              disabled={loadingProjects || projects.length === 0}
              className="w-full pl-9 pr-8 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-white focus:border-primary/50 outline-none cursor-pointer appearance-none transition-all shadow-md"
            >
              {projects.length === 0 ? (
                <option value="">No projects found</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-950">
                    {p.title} ({p.teamName})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loadingProjects || loadingDetails ? (
        <div className="glass-panel rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-3 border border-slate-850">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs font-medium text-slate-400">Loading project data and activity records...</p>
        </div>
      ) : projects.length === 0 ? (
        /* Empty State: No Projects Created */
        <div className="glass-panel rounded-2xl p-12 text-center border border-slate-850 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No Project Workspaces Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              AI Project Manager monitors existing software projects. Create your first project workspace to start tracking tasks, milestones, and intelligent insights.
            </p>
          </div>
          <Link
            to="/projects"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-lg"
          >
            Go to Projects Workspace →
          </Link>
        </div>
      ) : projectDetails ? (
        <div className="space-y-6 animate-fade-in">
          {/* ═══════════════ PROJECT SNAPSHOT HEADER ═══════════════ */}
          <div className="glass-panel rounded-2xl p-6 border border-slate-850 relative overflow-hidden bg-slate-950/60">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-850/80 pb-5">
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                      currentStatus === 'HEALTHY'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : currentStatus === 'ATTENTION'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}
                  >
                    {currentStatus} Status
                  </span>

                  {projectDetails.githubRepo && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300">
                      <Github className="w-3 h-3 text-slate-400" />
                      {projectDetails.githubRepo}
                    </span>
                  )}

                  {projectDetails.startDate && projectDetails.endDate && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/60 border border-slate-800 text-[10px] text-slate-400">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(projectDetails.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} → {new Date(projectDetails.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-white tracking-tight">{projectDetails.title}</h2>
                <p className="text-xs text-slate-400 max-w-3xl line-clamp-2">{projectDetails.description}</p>

                {/* Owner & Team line */}
                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-400">
                  <span>Owner: <strong className="text-white">{ownerName}</strong></span>
                  <span>Team: <strong className="text-white">{projectDetails.team?.name || 'Development Team'}</strong> ({activeMembersCount} members)</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  to={`/projects/${projectDetails.id}`}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-750 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  Project Workspace <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <button
                  onClick={handleRunAnalysis}
                  disabled={analyzing}
                  className="px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing with AI Engine...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {analysisResult ? 'Re-analyze Project' : 'Analyze Project'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* ═══════════════ REAL METRICS ROW ═══════════════ */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-5">
              {/* Project Health */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Project Health</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="mt-2">
                  <span
                    className={`text-2xl font-black ${
                      currentHealth >= 75 ? 'text-emerald-400' : currentHealth >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}
                  >
                    {currentHealth}%
                  </span>
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">{currentStatus}</span>
                </div>
              </div>

              {/* Tasks Progress */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Tasks Progress</span>
                  <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-black text-white">
                    {completedTasks} <span className="text-xs text-slate-500 font-normal">/ {totalTasks}</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {totalTasks > 0 ? `${Math.round((completedTasks / totalTasks) * 100)}% done` : 'No tasks'}
                    {overdueTasks > 0 && <span className="text-red-400 font-semibold ml-1">({overdueTasks} overdue)</span>}
                  </span>
                </div>
              </div>

              {/* Milestones */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Milestones</span>
                  <Target className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-black text-white">
                    {completedMilestones} <span className="text-xs text-slate-500 font-normal">/ {totalMilestones}</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {totalMilestones > 0 ? `${Math.round((completedMilestones / totalMilestones) * 100)}% done` : 'None defined'}
                  </span>
                </div>
              </div>

              {/* GitHub Commits */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>GitHub Commits</span>
                  <Github className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-black text-white">{commitsCount}</span>
                  <span className="text-[10px] text-slate-500 block truncate font-mono">
                    {projectDetails.githubRepo || 'No repo'}
                  </span>
                </div>
              </div>

              {/* Team Members */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Team Activity</span>
                  <Users className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-black text-white">{activeMembersCount}</span>
                  <span className="text-[10px] text-slate-500 block">assigned members</span>
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Error Message */}
          {analysisError && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{analysisError}</span>
              </div>
              <button
                onClick={handleRunAnalysis}
                className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-bold rounded-lg transition-colors"
              >
                Retry Analysis
              </button>
            </div>
          )}

          {/* ═══════════════ AI ANALYSIS & INSIGHTS ═══════════════ */}
          {analysisResult ? (
            <div className="space-y-6">
              {/* Executive Summary */}
              <div className="glass-panel p-5 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-slate-900/50 to-transparent">
                <div className="flex items-center gap-2 text-xs font-bold text-primary mb-1">
                  <Sparkles className="w-4 h-4" /> AI Operational Summary
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                  {analysisResult.summary}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* AI Insights Column (2 cols) */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" /> AI Project Insights
                    </h3>
                    <span className="text-[11px] text-slate-500">Derived from live database records</span>
                  </div>

                  <div className="space-y-3">
                    {analysisResult.insights.map((insight, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border transition-all ${
                          insight.type === 'delay'
                            ? 'bg-red-500/5 border-red-500/20 text-red-200'
                            : insight.type === 'low_activity'
                            ? 'bg-amber-500/5 border-amber-500/20 text-amber-200'
                            : insight.type === 'risk'
                            ? 'bg-rose-500/5 border-rose-500/20 text-rose-200'
                            : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex-shrink-0">
                            {insight.type === 'delay' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                            {insight.type === 'low_activity' && <Clock className="w-4 h-4 text-amber-400" />}
                            {insight.type === 'risk' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                            {insight.type === 'progress' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white mb-0.5">{insight.title}</p>
                            <p className="text-xs text-slate-300 leading-relaxed">{insight.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recommended Actions Column (1 col) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" /> Recommended Actions
                    </h3>
                  </div>

                  <div className="space-y-2.5">
                    {analysisResult.recommendations.map((rec, idx) => {
                      const textLower = `${rec.action} ${rec.reason}`.toLowerCase();
                      const isTaskRelated = textLower.includes('task') || textLower.includes('delay') || textLower.includes('overdue') || textLower.includes('assign');
                      const isMilestoneRelated = textLower.includes('milestone');
                      const isGitRelated = textLower.includes('commit') || textLower.includes('repo') || textLower.includes('git') || textLower.includes('code');

                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white flex-1">{rec.action}</span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase ${
                                rec.priority === 'HIGH'
                                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                  : rec.priority === 'MEDIUM'
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {rec.priority}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-normal">{rec.reason}</p>
                          <div className="pt-1 flex items-center gap-2">
                            {isTaskRelated && (
                              <Link
                                to={`/tasks?project=${selectedProjectId}`}
                                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-bold"
                              >
                                Take Action in Tasks Board <ArrowRight className="w-3 h-3" />
                              </Link>
                            )}
                            {isMilestoneRelated && (
                              <Link
                                to={`/projects/${selectedProjectId}`}
                                className="inline-flex items-center gap-1 text-[10px] text-purple-400 hover:underline font-bold"
                              >
                                View Milestones <ArrowRight className="w-3 h-3" />
                              </Link>
                            )}
                            {isGitRelated && (
                              <Link
                                to={`/github?project=${selectedProjectId}`}
                                className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline font-bold"
                              >
                                Check GitHub Repository <ArrowRight className="w-3 h-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Deep Navigation Links */}
                  <div className="p-4 rounded-2xl glass-panel border border-slate-800 space-y-2 pt-3">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Direct Action Links
                    </span>
                    <Link
                      to={`/tasks?project=${selectedProjectId}`}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 hover:bg-slate-850 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <CheckSquare className="w-3.5 h-3.5 text-primary" /> Review Tasks Board
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    </Link>
                    <Link
                      to={`/projects/${selectedProjectId}`}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 hover:bg-slate-850 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Target className="w-3.5 h-3.5 text-primary" /> Inspect Milestones
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    </Link>
                    <Link
                      to={`/github?project=${selectedProjectId}`}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 hover:bg-slate-850 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Github className="w-3.5 h-3.5 text-primary" /> Codebase & Commits
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Prompt to Run Analysis */
            <div className="glass-panel p-8 rounded-2xl border border-slate-850 text-center space-y-4 bg-slate-950/40">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Generate Project Intelligence Insights</h3>
                <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                  Run AI Project Manager to evaluate delay probabilities, detect inactive tasks, track milestone velocity, and provide recommended engineering actions for <strong className="text-slate-200">"{projectDetails.title}"</strong>.
                </p>
              </div>
              <button
                onClick={handleRunAnalysis}
                disabled={analyzing}
                className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all inline-flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Analyze "{projectDetails.title}"
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
