import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  BrainCircuit, Sparkles, FolderOpen, AlertTriangle, CheckCircle2,
  Clock, Users, CheckSquare, Loader2,
  ShieldCheck, Zap, AlertCircle,
  ArrowRight, Github, Target,
  BarChart3, UserCheck, FileText
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
    assignee?: { id: string; name: string; email?: string; avatarUrl?: string } | null;
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
      userId: string;
      user: { id: string; name: string; email: string; avatarUrl?: string; skills?: string | string[] };
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

interface DelayPrediction {
  delayProbability: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
}

interface SprintSummary {
  workCompleted: string[];
  pendingWork: string[];
  delayRisks: string[];
  productivityIndex: number;
}

type TabKey = 'health' | 'team' | 'sprint' | 'planner';

export default function AIProjectManager() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabKey>('health');

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Analysis states
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AIAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Delay prediction state
  const [delayPrediction, setDelayPrediction] = useState<DelayPrediction | null>(null);
  const [loadingPrediction, setLoadingPrediction] = useState(false);

  // Sprint Summary state
  const [sprintSummary, setSprintSummary] = useState<SprintSummary | null>(null);
  const [loadingSprint, setLoadingSprint] = useState(false);
  const [sprintError, setSprintError] = useState<string | null>(null);

  // AI Planner generation state
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [plannerError, setPlannerError] = useState<string | null>(null);

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
        const paramTab = searchParams.get('tab') as TabKey;
        if (paramTab && ['health', 'team', 'sprint', 'planner'].includes(paramTab)) {
          setActiveTab(paramTab);
        }

        const activeStorePid = useProjectStore.getState().activeProjectId;
        if (paramProjectId && projs.some((p) => p.id === paramProjectId)) {
          setSelectedProjectId(paramProjectId);
        } else if (activeStorePid && projs.some((p) => p.id === activeStorePid)) {
          setSelectedProjectId(activeStorePid);
          setSearchParams((prev) => {
            prev.set('project', activeStorePid);
            return prev;
          }, { replace: true });
        } else if (projs.length > 0) {
          setSelectedProjectId(projs[0].id);
          setSearchParams((prev) => {
            prev.set('project', projs[0].id);
            return prev;
          }, { replace: true });
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
      setSprintError(null);
      setPlannerError(null);

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

      // Check cached sprint summary
      const cachedSprint = localStorage.getItem(`aipm_sprint_${projectId}`);
      if (cachedSprint) {
        try {
          setSprintSummary(JSON.parse(cachedSprint));
        } catch {
          setSprintSummary(null);
        }
      } else {
        setSprintSummary(null);
      }

      // Fetch delay prediction
      fetchDelayPrediction(projectId);
    } catch (err) {
      console.error('Failed to load project details:', err);
      setProjectDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const fetchDelayPrediction = async (projectId: string) => {
    try {
      setLoadingPrediction(true);
      const res = await api.get(`/ai/projects/${projectId}/delay-prediction`);
      if (res.data?.prediction) {
        setDelayPrediction(res.data.prediction);
      }
    } catch (err) {
      console.warn('Delay prediction fetch error (non-fatal):', err);
    } finally {
      setLoadingPrediction(false);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetails(selectedProjectId);
    }
  }, [selectedProjectId, loadProjectDetails]);

  // Handle switching project from dropdown
  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    useProjectStore.getState().switchProject(projectId);
    setSearchParams((prev) => {
      prev.set('project', projectId);
      return prev;
    });
  };

  // Switch tab
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      prev.set('tab', tab);
      return prev;
    });
  };

  // ── 3. Run AI Project Health Analysis ─────────────────────────────────────────
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
      fetchDelayPrediction(selectedProjectId);
    } catch (err: any) {
      console.error('Failed to analyze project:', err);
      setAnalysisError(err.response?.data?.message || err.response?.data?.error || 'Failed to complete project analysis. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  // ── 4. Generate AI Sprint Summary ───────────────────────────────────────────
  const handleGenerateSprintSummary = async () => {
    if (!projectDetails) return;
    setLoadingSprint(true);
    setSprintError(null);

    try {
      const completed = projectDetails.tasks.filter((t) => t.status === 'COMPLETED').map((t) => t.title);
      const pending = projectDetails.tasks.filter((t) => t.status !== 'COMPLETED').map((t) => t.title);
      const overdue = projectDetails.tasks
        .filter((t) => t.status !== 'COMPLETED' && t.dueDate && new Date(t.dueDate) < new Date())
        .map((t) => `Overdue: "${t.title}"`);
      const overdueMilestones = projectDetails.milestones
        .filter((m) => m.status !== 'COMPLETED' && new Date(m.dueDate) < new Date())
        .map((m) => `Milestone Blocked: "${m.title}"`);

      const blockages = [...overdue, ...overdueMilestones];
      const commitsCount = projectDetails.gitAnalytics?.commitsCount || 0;
      const commitStats = commitsCount > 0
        ? `${commitsCount} code commits logged in ${projectDetails.githubRepo || 'repository'}`
        : 'No code commits recorded yet';

      const res = await api.post('/ai/sprint-summary', {
        completedTasks: completed,
        pendingTasks: pending,
        commitStats,
        blockages,
        projectId: projectDetails.id,
      });

      if (res.data?.summary) {
        setSprintSummary(res.data.summary);
        localStorage.setItem(`aipm_sprint_${projectDetails.id}`, JSON.stringify(res.data.summary));
        toast.success('Sprint Summary Generated', {
          description: 'Agile velocity and blockers have been updated.',
        });
      }
    } catch (err: any) {
      console.error('Sprint summary error:', err);
      setSprintError(err.response?.data?.message || err.response?.data?.error || 'Failed to generate sprint summary.');
    } finally {
      setLoadingSprint(false);
    }
  };

  // ── 5. Generate Project Roadmap with AI Planner ──────────────────────────────
  const handleGenerateProjectPlan = async () => {
    if (!projectDetails) return;
    setGeneratingPlan(true);
    setPlannerError(null);

    try {
      const res = await api.post('/ai/planner', {
        title: projectDetails.title,
        description: projectDetails.description,
        teamSize: projectDetails.team?.members.length || 4,
        deadline: projectDetails.endDate
          ? new Date(projectDetails.endDate).toLocaleDateString()
          : '12 weeks',
        projectId: projectDetails.id,
      });

      if (res.data?.plan) {
        setGeneratedPlan(res.data.plan);
        toast.success('AI Roadmap Generated', {
          description: `Generated strategic phases and milestones for ${projectDetails.title}.`,
        });
      }
    } catch (err: any) {
      console.error('Plan generation error:', err);
      setPlannerError(err.response?.data?.message || err.response?.data?.error || 'Failed to generate project roadmap.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Derived metrics from actual project details
  const totalTasks = projectDetails?.tasks?.length || 0;
  const completedTasks = projectDetails?.tasks?.filter((t) => t.status === 'COMPLETED').length || 0;
  const inProgressTasks = projectDetails?.tasks?.filter((t) => t.status === 'IN_PROGRESS').length || 0;
  const todoTasks = projectDetails?.tasks?.filter((t) => t.status === 'TODO').length || 0;
  const overdueTasks = projectDetails?.tasks?.filter(
    (t) => t.status !== 'COMPLETED' && t.dueDate && new Date(t.dueDate) < new Date()
  ).length || 0;
  const unassignedTasks = projectDetails?.tasks?.filter((t) => !t.assignee).length || 0;

  const totalMilestones = projectDetails?.milestones?.length || 0;
  const completedMilestones = projectDetails?.milestones?.filter((m) => m.status === 'COMPLETED').length || 0;

  const teamMembers = projectDetails?.team?.members || [];
  const activeMembersCount = teamMembers.length;

  // Fallback health status
  const currentHealth = analysisResult ? analysisResult.healthScore : (projectDetails?.healthScore ?? 100);
  const currentStatus = analysisResult
    ? analysisResult.healthStatus
    : currentHealth >= 75
    ? 'HEALTHY'
    : currentHealth >= 50
    ? 'ATTENTION'
    : 'RISK';

  // Calculate per-member workload
  const memberWorkloads = teamMembers.map((m) => {
    const memberTasks = projectDetails?.tasks.filter((t) => t.assignee?.id === m.user.id) || [];
    const memberCompleted = memberTasks.filter((t) => t.status === 'COMPLETED').length;
    const memberInProgress = memberTasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const memberOverdue = memberTasks.filter(
      (t) => t.status !== 'COMPLETED' && t.dueDate && new Date(t.dueDate) < new Date()
    ).length;
    const openTasks = memberTasks.length - memberCompleted;

    let workloadStatus: 'Available' | 'Optimal' | 'Heavy' | 'Overloaded' = 'Optimal';
    if (openTasks === 0) workloadStatus = 'Available';
    else if (openTasks >= 6) workloadStatus = 'Overloaded';
    else if (openTasks >= 4) workloadStatus = 'Heavy';

    let parsedSkills: string[] = [];
    if (Array.isArray(m.user.skills)) parsedSkills = m.user.skills;
    else if (typeof m.user.skills === 'string') {
      try { parsedSkills = JSON.parse(m.user.skills); } catch { parsedSkills = m.user.skills ? [m.user.skills] : []; }
    }

    return {
      user: m.user,
      role: m.role,
      totalAssigned: memberTasks.length,
      completed: memberCompleted,
      inProgress: memberInProgress,
      overdue: memberOverdue,
      openTasks,
      workloadStatus,
      skills: parsedSkills,
    };
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ═══════════════ HEADER & GLOBAL CONTROLS ═══════════════ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass-panel p-5 sm:p-6 rounded-3xl border border-slate-800 bg-slate-950/70 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary glow-primary flex-shrink-0">
            <BrainCircuit className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-white tracking-tight">AI Project Manager</h1>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-bold uppercase tracking-wider">
                Full Intelligence Hub
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Live automated health checks, team workload balance, sprint velocity tracking, and strategic AI roadmap planning.
            </p>
          </div>
        </div>

        {/* Project Selector & AI Planner Quick Link */}
        <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
          <div className="relative min-w-[200px] sm:min-w-[240px]">
            <FolderOpen className="w-4 h-4 text-primary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedProjectId}
              onChange={(e) => handleSelectProject(e.target.value)}
              disabled={loadingProjects || projects.length === 0}
              className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-white focus:border-primary/50 outline-none cursor-pointer appearance-none transition-all shadow-md"
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

          <Link
            to="/ai"
            className="px-3.5 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            title="Open Dedicated AI Planner Workspace"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Open AI Planner →</span>
          </Link>
        </div>
      </div>

      {/* Loading state */}
      {loadingProjects || loadingDetails ? (
        <div className="glass-panel rounded-3xl p-16 text-center flex flex-col items-center justify-center gap-3 border border-slate-850">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-xs font-semibold text-slate-400">Loading project diagnostics, team telemetry, and tasks...</p>
        </div>
      ) : projects.length === 0 ? (
        /* Empty State */
        <div className="glass-panel rounded-3xl p-12 text-center border border-slate-850 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No Project Workspaces Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              AI Project Manager needs an active project to track health scores, team check-ins, sprint velocity, and schedule risks.
            </p>
          </div>
          <Link
            to="/projects"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-lg"
          >
            Create Your First Project →
          </Link>
        </div>
      ) : projectDetails ? (
        <div className="space-y-6 animate-fade-in">
          {/* ═══════════════ TOP PROJECT SUMMARY BANNER ═══════════════ */}
          <div className="glass-panel rounded-3xl p-5 sm:p-6 border border-slate-800 bg-slate-950/60 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="space-y-1.5">
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

                  {loadingPrediction ? (
                    <span className="text-[10px] px-2.5 py-0.5 rounded-md font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" /> Predicting Delay Risk...
                    </span>
                  ) : delayPrediction ? (
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                        delayPrediction.riskLevel === 'HIGH'
                          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                          : delayPrediction.riskLevel === 'MEDIUM'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {delayPrediction.riskLevel} Delay Risk ({delayPrediction.delayProbability}%)
                    </span>
                  ) : null}

                  {projectDetails.githubRepo && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300">
                      <Github className="w-3 h-3 text-slate-400" />
                      {projectDetails.githubRepo}
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-white tracking-tight">{projectDetails.title}</h2>
                <p className="text-xs text-slate-400 line-clamp-2 max-w-3xl">{projectDetails.description}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/projects/${projectDetails.id}`}
                  className="px-3 py-2 rounded-xl border border-slate-750 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-all flex items-center gap-1.5"
                >
                  Workspace <ArrowRight className="w-3.5 h-3.5" />
                </Link>

                <button
                  onClick={handleRunAnalysis}
                  disabled={analyzing}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg cursor-pointer"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      {analysisResult ? 'Re-run Analysis' : 'Run AI Health Check'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
              <div className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800/80">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Health Score</span>
                <p className={`text-xl font-black mt-0.5 ${currentHealth >= 75 ? 'text-emerald-400' : currentHealth >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {currentHealth}%
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800/80">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Tasks Completed</span>
                <p className="text-xl font-black text-white mt-0.5">
                  {completedTasks} <span className="text-xs text-slate-500 font-normal">/ {totalTasks}</span>
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800/80">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Milestones</span>
                <p className="text-xl font-black text-white mt-0.5">
                  {completedMilestones} <span className="text-xs text-slate-500 font-normal">/ {totalMilestones}</span>
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800/80">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Overdue Tasks</span>
                <p className={`text-xl font-black mt-0.5 ${overdueTasks > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                  {overdueTasks}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800/80 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Team Members</span>
                <p className="text-xl font-black text-white mt-0.5">
                  {activeMembersCount} <span className="text-xs text-slate-500 font-normal">active</span>
                </p>
              </div>
            </div>
          </div>

          {/* ═══════════════ FOUR MAIN TABS ═══════════════ */}
          <div className="flex items-center gap-1.5 border-b border-slate-800 pb-px overflow-x-auto">
            <button
              onClick={() => handleTabChange('health')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'health'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>1. Health & Delay Check</span>
            </button>

            <button
              onClick={() => handleTabChange('team')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'team'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>2. Team Workload Check</span>
              {unassignedTasks > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded text-[10px]">
                  {unassignedTasks} unassigned
                </span>
              )}
            </button>

            <button
              onClick={() => handleTabChange('sprint')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'sprint'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>3. Sprint & Blockers</span>
              {overdueTasks > 0 && (
                <span className="px-1.5 py-0.2 bg-red-500/20 text-red-300 rounded text-[10px]">
                  {overdueTasks} blocked
                </span>
              )}
            </button>

            <button
              onClick={() => handleTabChange('planner')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'planner'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>4. AI Planner Hub</span>
            </button>
          </div>

          {/* ═══════════════ TAB 1: HEALTH & DELAY CHECK ═══════════════ */}
          {activeTab === 'health' && (
            <div className="space-y-6">
              {/* Delay Prediction Card */}
              {delayPrediction && (
                <div className="glass-panel p-5 rounded-3xl border border-slate-800 bg-slate-950/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold text-white">AI Delay & Delivery Probability Engine</h3>
                    </div>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                        delayPrediction.riskLevel === 'HIGH'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                          : delayPrediction.riskLevel === 'MEDIUM'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {delayPrediction.riskLevel} RISK ({delayPrediction.delayProbability}% Probability of Delay)
                    </span>
                  </div>

                  <div className="space-y-2">
                    {delayPrediction.reasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis Error */}
              {analysisError && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span>{analysisError}</span>
                  </div>
                  <button onClick={handleRunAnalysis} className="px-3 py-1.5 bg-red-500/20 text-red-200 text-xs font-bold rounded-lg">
                    Retry
                  </button>
                </div>
              )}

              {/* Executive Summary */}
              {analysisResult ? (
                <div className="space-y-6">
                  <div className="glass-panel p-5 rounded-3xl border border-primary/25 bg-gradient-to-r from-primary/10 via-slate-900/50 to-transparent">
                    <div className="flex items-center gap-2 text-xs font-bold text-primary mb-1.5">
                      <Sparkles className="w-4 h-4" /> AI Operational Health Summary
                    </div>
                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                      {analysisResult.summary}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Insights Column */}
                    <div className="lg:col-span-2 space-y-3">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400" /> Detected Health & Risk Insights
                      </h3>
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

                    {/* Actionable Recommendations Column */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary" /> Engineering Action Items
                      </h3>
                      <div className="space-y-2.5">
                        {analysisResult.recommendations.map((rec, idx) => (
                          <div key={idx} className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
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
                          </div>
                        ))}

                        <div className="pt-2">
                          <Link
                            to={`/tasks?project=${selectedProjectId}`}
                            className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                          >
                            <CheckSquare className="w-3.5 h-3.5" /> Open Tasks Board →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Run Analysis Prompt */
                <div className="glass-panel p-8 rounded-3xl border border-slate-850 text-center space-y-3 bg-slate-950/40">
                  <Sparkles className="w-8 h-8 text-primary mx-auto" />
                  <h3 className="text-sm font-bold text-white">Full Health Diagnostics Ready</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Evaluate milestones, tasks, velocity, and schedule risks with the AI Project Manager engine.
                  </p>
                  <button
                    onClick={handleRunAnalysis}
                    disabled={analyzing}
                    className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-lg cursor-pointer"
                  >
                    Run Health Check on "{projectDetails.title}"
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ TAB 2: TEAM CHECK & WORKLOAD ═══════════════ */}
          {activeTab === 'team' && (
            <div className="space-y-6">
              {/* Unassigned Tasks Banner */}
              {unassignedTasks > 0 && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div>
                      <strong className="text-amber-300">{unassignedTasks} Unassigned Tasks Detected:</strong>
                      <span className="text-slate-300 ml-1">Assign these tasks to team members to ensure balanced delivery velocity.</span>
                    </div>
                  </div>
                  <Link
                    to={`/tasks?project=${selectedProjectId}`}
                    className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg font-bold flex-shrink-0"
                  >
                    Assign in Tasks Board →
                  </Link>
                </div>
              )}

              {/* Members Workload Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" /> Team Workload Distribution
                    </h3>
                    <p className="text-[11px] text-slate-400">Real-time task distribution and overload alerts per member.</p>
                  </div>
                  <span className="text-xs text-slate-400 font-semibold">
                    {teamMembers.length} active developers
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {memberWorkloads.map((m, idx) => (
                    <div
                      key={idx}
                      className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-950/60 space-y-3.5 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        {/* Member Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            {m.user.avatarUrl ? (
                              <img src={m.user.avatarUrl} alt={m.user.name} className="w-9 h-9 rounded-xl object-cover border border-slate-700" />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-primary text-xs">
                                {m.user.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-white">{m.user.name}</p>
                              <span className="text-[10px] text-slate-500 block truncate max-w-[140px]">{m.user.email}</span>
                            </div>
                          </div>

                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase ${
                              m.workloadStatus === 'Overloaded'
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : m.workloadStatus === 'Heavy'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : m.workloadStatus === 'Optimal'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {m.workloadStatus} ({m.openTasks} open)
                          </span>
                        </div>

                        {/* Task metrics breakdown */}
                        <div className="grid grid-cols-3 gap-2 py-1 text-center bg-slate-900/60 rounded-xl p-2 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-500 block">Total</span>
                            <strong className="text-white font-bold">{m.totalAssigned}</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Done</span>
                            <strong className="text-emerald-400 font-bold">{m.completed}</strong>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block">Overdue</span>
                            <strong className={`font-bold ${m.overdue > 0 ? 'text-red-400' : 'text-slate-400'}`}>{m.overdue}</strong>
                          </div>
                        </div>

                        {/* Skills */}
                        {m.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {m.skills.slice(0, 4).map((s, si) => (
                              <span key={si} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-850 text-slate-300 border border-slate-750">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <Link
                        to={`/tasks?project=${selectedProjectId}`}
                        className="text-[10px] text-primary hover:underline font-bold inline-flex items-center gap-1 pt-1"
                      >
                        Inspect member tasks <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════ TAB 3: SPRINT & BLOCKERS ═══════════════ */}
          {activeTab === 'sprint' && (
            <div className="space-y-6">
              {/* Sprint Progress Gauge */}
              <div className="glass-panel p-5 rounded-3xl border border-slate-800 bg-slate-950/60 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" /> Active Sprint Health & Velocity
                    </h3>
                    <p className="text-[11px] text-slate-400">Current progress toward milestone and task completion.</p>
                  </div>

                  <button
                    onClick={handleGenerateSprintSummary}
                    disabled={loadingSprint}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {loadingSprint ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Generating Summary...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Generate AI Sprint Summary
                      </>
                    )}
                  </button>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Sprint Completion</span>
                    <span className="font-bold text-white">
                      {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}% ({completedTasks}/{totalTasks} tasks)
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${totalTasks > 0 ? Math.min(Math.round((completedTasks / totalTasks) * 100), 100) : 0}%` }}
                    />
                  </div>
                </div>

                {/* Status tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <span className="text-[10px] text-emerald-400 uppercase font-bold">Completed</span>
                    <p className="text-xl font-black text-white mt-0.5">{completedTasks}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <span className="text-[10px] text-blue-400 uppercase font-bold">In Progress</span>
                    <p className="text-xl font-black text-white mt-0.5">{inProgressTasks}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-800/50 border border-slate-700/50 text-center">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Todo</span>
                    <p className="text-xl font-black text-white mt-0.5">{todoTasks}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-center">
                    <span className="text-[10px] text-red-400 uppercase font-bold">Overdue / Blocked</span>
                    <p className="text-xl font-black text-red-300 mt-0.5">{overdueTasks}</p>
                  </div>
                </div>
              </div>

              {/* Sprint Error */}
              {sprintError && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-3">
                  <span>{sprintError}</span>
                  <button onClick={handleGenerateSprintSummary} className="px-3 py-1.5 bg-red-500/20 text-red-200 text-xs font-bold rounded-lg">
                    Retry
                  </button>
                </div>
              )}

              {/* Generated AI Sprint Summary Report */}
              {sprintSummary && (
                <div className="glass-panel p-6 rounded-3xl border border-primary/30 bg-slate-950/70 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-bold text-white">AI Sprint Performance Report</h3>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold">
                      Productivity Index: {sprintSummary.productivityIndex}%
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                      <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sprint Accomplishments
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {sprintSummary.workCompleted.map((w, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-emerald-400 mt-1">•</span>
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-2">
                      <h4 className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> In-Flight & Pending Work
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {sprintSummary.pendingWork.map((p, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-blue-400 mt-1">•</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/20 space-y-2 md:col-span-2">
                      <h4 className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" /> Active Blockers & Schedule Risks
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-300">
                        {sprintSummary.delayRisks.map((d, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-red-400 mt-1">•</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ TAB 4: AI PLANNER HUB ═══════════════ */}
          {activeTab === 'planner' && (
            <div className="space-y-6">
              {/* Direct action banner */}
              <div className="glass-panel p-6 rounded-3xl border border-purple-500/30 bg-gradient-to-r from-purple-500/10 via-slate-900/60 to-transparent space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-purple-400" /> AI Project Planner & Roadmap Suite
                    </h3>
                    <p className="text-xs text-slate-300 mt-1">
                      Generate strategic development phases, milestones, technical architecture, and skill distribution for "{projectDetails.title}".
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handleGenerateProjectPlan}
                      disabled={generatingPlan}
                      className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {generatingPlan ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating Roadmap...
                        </>
                      ) : (
                        <>
                          <BrainCircuit className="w-4 h-4" />
                          Generate Roadmap with AI
                        </>
                      )}
                    </button>
                    <Link
                      to="/ai"
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-700"
                    >
                      Open Full Planner Page →
                    </Link>
                  </div>
                </div>
              </div>

              {plannerError && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                  {plannerError}
                </div>
              )}

              {/* Generated Plan Output */}
              {generatedPlan ? (
                <div className="glass-panel p-6 rounded-3xl border border-slate-800 bg-slate-950/70 space-y-6">
                  <div>
                    <h4 className="text-lg font-bold text-white">{generatedPlan.title}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Estimated Duration: {generatedPlan.totalTime}</p>
                  </div>

                  {/* Phases */}
                  <div className="space-y-3">
                    <h5 className="text-xs font-bold text-purple-400 uppercase tracking-wider">Strategic Development Phases</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {generatedPlan.phases?.map((p: any, i: number) => (
                        <div key={i} className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{p.phase}</span>
                            <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded font-mono">
                              {p.duration}
                            </span>
                          </div>
                          <ul className="space-y-1 text-xs text-slate-300">
                            {p.tasks?.map((t: string, ti: number) => (
                              <li key={ti} className="flex items-start gap-1.5">
                                <span className="text-primary mt-0.5">•</span>
                                <span>{t}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Milestones & Tech */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                      <h5 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Suggested Milestones</h5>
                      <div className="space-y-2">
                        {generatedPlan.milestones?.map((m: any, i: number) => (
                          <div key={i} className="text-xs">
                            <p className="font-bold text-white">{m.title}</p>
                            <p className="text-slate-400 text-[11px]">{m.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                      <h5 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Recommended Tech Stack</h5>
                      <div className="flex flex-wrap gap-1.5">
                        {generatedPlan.techSuggestions?.map((tech: string, i: number) => (
                          <span key={i} className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Feature Cards Linking to AI Planner Tools */
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-5 rounded-3xl glass-panel border border-slate-800 bg-slate-950/60 space-y-3">
                    <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 w-fit">
                      <BrainCircuit className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-white">Full Roadmap Generator</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Decompose project objectives into actionable phases, milestones, and deliverable specs.
                    </p>
                    <button
                      onClick={handleGenerateProjectPlan}
                      className="text-xs text-purple-400 hover:underline font-bold flex items-center gap-1 pt-1 cursor-pointer"
                    >
                      Generate Roadmap Now →
                    </button>
                  </div>

                  <div className="p-5 rounded-3xl glass-panel border border-slate-800 bg-slate-950/60 space-y-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 w-fit">
                      <FileText className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-white">Requirement Analyzer</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Extract functional requirements, user stories, and acceptance criteria from project docs.
                    </p>
                    <Link
                      to="/ai"
                      className="text-xs text-blue-400 hover:underline font-bold flex items-center gap-1 pt-1"
                    >
                      Open in AI Planner →
                    </Link>
                  </div>

                  <div className="p-5 rounded-3xl glass-panel border border-slate-800 bg-slate-950/60 space-y-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 w-fit">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <h4 className="text-sm font-bold text-white">Risk Detection Engine</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Analyze multi-dimensional project risk across technical, timeline, security, and team vectors.
                    </p>
                    <Link
                      to="/ai"
                      className="text-xs text-amber-400 hover:underline font-bold flex items-center gap-1 pt-1"
                    >
                      Run Risk Analysis →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
