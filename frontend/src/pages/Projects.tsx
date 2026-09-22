import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useProjectStore } from '../store/project.store';
import api from '../utils/api';
import {
  FolderOpen, Plus, Search, Star, Users,
  Calendar, Github, Brain, Settings as SettingsIcon,
  ArrowLeft, CheckCircle2, ChevronRight, Loader2, FileText,
  TrendingUp, ExternalLink, Grid3X3, List, X, Upload, Link2, CheckCircle, Trash2,
  ShieldCheck, AlertCircle, Clock, Tag, Target, CheckSquare, BarChart3
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts';
import DeploymentIntelligence from '../components/DeploymentIntelligence';
import DeployProviderSettings from '../components/DeployProviderSettings';
import CreateProjectWizard from '../components/CreateProjectWizard';

interface Project {
  id: string;
  title: string;
  description: string;
  objectives: string[];
  status: 'HEALTHY' | 'ATTENTION' | 'RISK';
  healthScore: number;
  githubRepo?: string | null;
  teamId: string;
  createdAt: string;
  milestones?: Milestone[];
  tasks?: Task[];
  team?: {
    name: string;
    members: Array<{
      role: string;
      user: {
        id: string;
        name: string;
        email: string;
        avatarUrl?: string;
        skills?: string[];
      };
    }>;
  };
  documents?: Document[];
  meetings?: Meeting[];
  gitAnalytics?: GitAnalytics | null;
  startDate?: string | null;
  endDate?: string | null;
  techStack?: string[];
  architectureDiagramUrl?: string | null;
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface Task {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  milestoneId?: string | null;
  dueDate?: string | null;
  assignee?: {
    id: string;
    name: string;
    avatarUrl?: string;
  } | null;
}

interface Document {
  id: string;
  name: string;
  fileUrl: string;
  category: string;
  version?: number;
  createdAt: string;
  versions?: Array<{
    id: string;
    version: number;
    fileUrl: string;
    notes?: string;
    createdAt: string;
    uploadedBy?: { name: string };
  }>;
}

interface Meeting {
  id: string;
  title: string;
  dateTime: string;
  link: string;
  createdBy: string;
}

interface GitAnalytics {
  commitsCount: number;
  lastCommitTime?: string;
  contributionData?: Record<string, any> | null;
}

const statusConfig = {
  HEALTHY: { label: 'Healthy', color: 'text-emerald-450', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10' },
  ATTENTION: { label: 'Attention Required', color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/10' },
  RISK: { label: 'At Risk', color: 'text-red-400', border: 'border-red-500/20', bg: 'bg-red-500/10' }
};

export default function Projects() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.user);

  // General States
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // New Project Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [error, setError] = useState('');

  // Detailed Workspace States
  type ProjectTab = 'overview' | 'tasks' | 'milestones' | 'team' | 'git' | 'analytics' | 'ai' | 'docs' | 'settings';
  const [activeTab, setActiveTab] = useState<ProjectTab>(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam && ['overview', 'tasks', 'milestones', 'team', 'git', 'analytics', 'ai', 'docs', 'settings'].includes(tabParam)) {
      return tabParam as ProjectTab;
    }
    return 'overview';
  });

  const handleTabChange = (tabId: ProjectTab) => {
    setActiveTab(tabId);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tabId);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  // Quick Task Modal States
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskMilestoneId, setTaskMilestoneId] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>('ALL');
  const [taskSearchQuery, setTaskSearchQuery] = useState<string>('');

  // Milestone Modal States
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const [msDesc, setMsDesc] = useState('');
  const [msDueDate, setMsDueDate] = useState('');

  // Document Modal States
  const [showDocModal, setShowDocModal] = useState(false);
  const [docName, setDocName] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docCategory, setDocCategory] = useState('proposal');
  const [docUploadMode, setDocUploadMode] = useState<'file' | 'url'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // AI states
  const [analyzingDocText, setAnalyzingDocText] = useState('');
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);
  const [delayPrediction, setDelayPrediction] = useState<any>(null);
  const [sprintSummary, setSprintSummary] = useState<any>(null);

  // Settings states
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsGithubRepo, setSettingsGithubRepo] = useState('');

  // Starred projects support in memory
  const [starredIds, setStarredIds] = useState<string[]>([]);

  // Load teams and projects lists
  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError('');
      const teamsRes = await api.get('/teams/my-teams');
      const myTeams = teamsRes.data.teams || [];

      // Helper: safely parse a JSON string or return the value as-is
      const safeJson = (val: any, fallback: any = []) => {
        if (val == null) return fallback;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return fallback; }
        }
        return val;
      };

      // Extract all projects from user's teams
      const allProjects: Project[] = [];
      myTeams.forEach((t: any) => {
        if (t.projects) {
          t.projects.forEach((p: any) => {
            allProjects.push({
              ...p,
              objectives: safeJson(p.objectives, []),
              team: {
                name: t.name,
                members: (t.members || []).map((m: any) => ({
                  ...m,
                  user: { ...m.user, skills: safeJson(m.user?.skills, []) }
                }))
              }
            });
          });
        }
      });
      setProjects(allProjects);

      if (projectId) {
        await loadProjectDetails(projectId);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch projects database.');
    } finally {
      setLoading(false);
    }
  };

  const loadProjectDetails = async (id: string) => {
    try {
      const detailsRes = await api.get(`/projects/${id}`);
      const raw = detailsRes.data.project;
      const safeJson = (val: any, fallback: any = []) => {
        if (val == null) return fallback;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return fallback; }
        }
        return val;
      };
      const projectData: Project = {
        ...raw,
        objectives: safeJson(raw.objectives, []),
        team: raw.team ? {
          ...raw.team,
          members: (raw.team.members || []).map((m: any) => ({
            ...m,
            user: { ...m.user, skills: safeJson(m.user?.skills, []) }
          }))
        } : undefined
      };
      setSelectedProject(projectData);
      setSettingsTitle(projectData.title);
      setSettingsDesc(projectData.description);
      setSettingsGithubRepo(projectData.githubRepo || '');
      // Clear AI insights on load
      setAiAnalysisResult(null);
      setDelayPrediction(null);
      setSprintSummary(null);

      // Sync active project with global store so topbar & sidebar stay in sync
      useProjectStore.getState().switchProject(projectData.id);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch detailed project workspace.');
      navigate('/projects');
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [projectId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === 'true' || params.get('fromPlanner') === 'true') {
      setShowCreateModal(true);
    }
  }, []);

  const handleToggleStar = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStarredIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };



  // Milestone functions
  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !msTitle || !msDueDate) return;

    try {
      setActionLoading(true);
      await api.post('/projects/milestone', {
        projectId: selectedProject.id,
        title: msTitle,
        description: msDesc,
        dueDate: msDueDate
      });
      setMsTitle('');
      setMsDesc('');
      setMsDueDate('');
      setShowMilestoneModal(false);
      // reload
      await loadProjectDetails(selectedProject.id);
    } catch (err: any) {
      console.error(err);
      alert('Failed to schedule milestone.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateMilestoneStatus = async (milestoneId: string, currentStatus: string) => {
    if (!selectedProject) return;
    const order: Record<string, 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'> = {
      PENDING: 'IN_PROGRESS',
      IN_PROGRESS: 'COMPLETED',
      COMPLETED: 'PENDING'
    };
    const nextStatus = order[currentStatus] || 'PENDING';

    try {
      setActionLoading(true);
      await api.put(`/projects/milestone/${milestoneId}`, { status: nextStatus });
      await loadProjectDetails(selectedProject.id);
    } catch (err) {
      console.error(err);
      alert('Failed to update milestone.');
    } finally {
      setActionLoading(false);
    }
  };

  // Task functions for project-specific tasks view
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !taskTitle.trim()) return;
    try {
      setActionLoading(true);
      await api.post('/tasks', {
        projectId: selectedProject.id,
        title: taskTitle.trim(),
        priority: taskPriority,
        assigneeId: taskAssigneeId || undefined,
        milestoneId: taskMilestoneId || undefined,
        dueDate: taskDueDate || undefined,
        status: 'TODO',
      });
      setTaskTitle('');
      setShowTaskModal(false);
      showToast('Task created successfully');
      await loadProjectDetails(selectedProject.id);
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.error || 'Failed to create task', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED') => {
    if (!selectedProject) return;
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      showToast(`Task moved to ${newStatus.replace('_', ' ')}`);
      await loadProjectDetails(selectedProject.id);
    } catch (err) {
      console.error(err);
      showToast('Failed to update task status', 'error');
    }
  };

  // Documents functions — supports real file upload or URL link
  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    try {
      setActionLoading(true);
      let newDoc: any = null;

      if (docUploadMode === 'file' && selectedFile) {
        // Real multipart file upload
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('projectId', selectedProject.id);
        formData.append('category', docCategory);
        formData.append('uploadedById', currentUser?.id || '');
        if (docName) formData.append('description', docName);

        const res = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 600000,
        });
        newDoc = res.data?.document;
      } else if (docUploadMode === 'url' && docName && docUrl) {
        // URL / cloud link registration
        const res = await api.post('/projects/document', {
          projectId: selectedProject.id,
          name: docName,
          fileUrl: docUrl,
          category: docCategory
        });
        newDoc = res.data?.document;
      } else {
        showToast('Please select a file or provide a document name and URL.', 'error');
        return;
      }

      if (newDoc) {
        setSelectedProject(prev => prev ? {
          ...prev,
          documents: [newDoc, ...(prev.documents || [])]
        } : null);
      }

      setDocName('');
      setDocUrl('');
      setDocCategory('proposal');
      setSelectedFile(null);
      setShowDocModal(false);
      showToast('Document uploaded successfully!');
      await loadProjectDetails(selectedProject.id);
    } catch (err) {
      console.error(err);
      showToast('Failed to upload document.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedProject || !window.confirm('Delete this document?')) return;
    // Immediate optimistic update
    setSelectedProject(prev => prev ? {
      ...prev,
      documents: (prev.documents || []).filter(d => d.id !== docId)
    } : null);
    try {
      await api.delete(`/upload/${docId}`);
      showToast('Document deleted successfully!');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to delete document.', 'error');
    } finally {
      await loadProjectDetails(selectedProject.id);
    }
  };

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docName) setDocName(file.name.replace(/\.[^.]+$/, ''));
    }
  }, [docName]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docName) setDocName(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const runDocumentAIAnalysis = async () => {
    if (!analyzingDocText.trim()) return;
    try {
      setActionLoading(true);
      setAiAnalysisResult(null);
      const res = await api.post('/ai/analyze-docs', { documentText: analyzingDocText });
      setAiAnalysisResult(res.data.analysis);
    } catch (err: any) {
      console.error(err);
      showToast(err.response?.data?.error || 'ProjectCollab AI is unavailable; no requirements analysis was generated.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // AI planner and calculations
  const runDelayPrediction = async () => {
    if (!selectedProject) return;
    try {
      setActionLoading(true);
      setDelayPrediction(null);
      const res = await api.get(`/ai/projects/${selectedProject.id}/delay-prediction`);
      setDelayPrediction(res.data.prediction);
    } catch (err) {
      console.error(err);
      alert('Failed to trigger AI Delay Predictor.');
    } finally {
      setActionLoading(false);
    }
  };

  const generateSprintSummary = async () => {
    if (!selectedProject) return;
    const completedTasksList = (selectedProject.tasks || [])
      .filter(t => t.status === 'COMPLETED')
      .map(t => t.title);
    const pendingTasksList = (selectedProject.tasks || [])
      .filter(t => t.status !== 'COMPLETED')
      .map(t => t.title);

    try {
      setActionLoading(true);
      setSprintSummary(null);
      const res = await api.post('/ai/sprint-summary', {
        completedTasks: completedTasksList,
        pendingTasks: pendingTasksList,
        commitStats: `Total of ${selectedProject.gitAnalytics?.commitsCount || 0} commits parsed. Last active: ${selectedProject.gitAnalytics?.lastCommitTime || 'N/A'}`,
        blockages: pendingTasksList.slice(0, 2), // assume first 2 pending are blockers for simple mock
        projectId: selectedProject.id
      });
      setSprintSummary(res.data.summary);
    } catch (err) {
      console.error(err);
      alert('Failed to generate weekly summary.');
    } finally {
      setActionLoading(false);
    }
  };

  // Project Settings Update
  const handleUpdateProjectSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    try {
      setActionLoading(true);
      await api.put(`/projects/${selectedProject.id}`, {
        title: settingsTitle,
        description: settingsDesc,
        githubRepo: settingsGithubRepo.trim() || null
      });
      await loadProjectDetails(selectedProject.id);
      alert('Project configuration saved successfully!');
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to save project config.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    if (!window.confirm('WARNING: Deleting this project workspace will permanently erase all associated milestones, documents, and logs. This cannot be undone. Are you sure you want to proceed?')) {
      return;
    }

    try {
      setActionLoading(true);
      await api.delete(`/projects/${selectedProject.id}`);
      navigate('/projects');
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to delete project.');
    } finally {
      setActionLoading(false);
    }
  };

  // Helper for document file URLs (local uploads vs Cloudinary)
  const getFileDisplayUrl = (url: string) => {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // No hardcoded localhost fallback: if VITE_API_URL is unset, we cannot build an
    // absolute URL — return the path as-is rather than silently pointing at localhost.
    const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
    if (!apiBase) return url;
    return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  // Recharts calculations
  const commitChartsData = useMemo(() => {
    if (!selectedProject?.gitAnalytics?.contributionData) {
      if (selectedProject?.team?.members) {
        return selectedProject.team.members.map(m => ({
          name: m.user.name,
          commits: 0
        }));
      }
      return [];
    }
    const data = selectedProject.gitAnalytics.contributionData;
    return Object.entries(data).map(([name, val]: [string, any]) => ({
      name,
      commits: typeof val === 'number' ? val : val.commits || 0
    }));
  }, [selectedProject]);

  // Overall statistics for Projects List view
  const overallStats = useMemo(() => {
    const total = projects.length;
    const healthy = projects.filter(p => p.status === 'HEALTHY').length;
    const attention = projects.filter(p => p.status === 'ATTENTION').length;
    const risk = projects.filter(p => p.status === 'RISK').length;
    return { total, healthy, attention, risk };
  }, [projects]);

  // Selected project progress metrics
  const totalMilestones = selectedProject?.milestones?.length || 0;
  const completedMilestones = selectedProject?.milestones?.filter(m => m.status === 'COMPLETED').length || 0;
  const milestonePct = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  const totalTasks = selectedProject?.tasks?.length || 0;
  const completedTasks = selectedProject?.tasks?.filter(t => t.status === 'COMPLETED').length || 0;
  const taskPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Filtered projects
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-sm text-slate-400">Loading projects database...</p>
      </div>
    );
  }

  if (error && !selectedProject && projects.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-3">
        <div className="text-red-400 font-semibold">{error}</div>
        <button onClick={loadInitialData} className="px-4 py-2.5 bg-primary text-primary-foreground text-xs font-bold rounded-xl">Retry</button>
      </div>
    );
  }

    return (
    <div className="space-y-8 max-w-7xl mx-auto overflow-x-hidden">
      {/* Global Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border animate-fade-in text-sm font-semibold transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/90 border-red-500/30 text-red-300'
          }`}
        >
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {/* ----------------- STATE 1: GENERAL OVERVIEW PROJECTS LIST ----------------- */}
      {!selectedProject ? (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-slate-400 text-sm mb-1 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" /> Project Workspaces
              </p>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Projects</h1>
              <p className="text-slate-500 text-sm mt-1">
                Collaborative project workspaces with task management, GitHub activity tracking, and intelligent project insights.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all cursor-pointer shadow-lg"
            >
              <Plus className="w-4 h-4" /> New Project
            </button>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Workspaces', value: overallStats.total, color: 'text-primary' },
              { label: 'Healthy Status', value: overallStats.healthy, color: 'text-emerald-400' },
              { label: 'Needs Attention', value: overallStats.attention, color: 'text-amber-400' },
              { label: 'At Risk Alarms', value: overallStats.risk, color: 'text-red-400' }
            ].map((stat, i) => (
              <div key={i} className="glass-card rounded-2xl p-5 border border-slate-900 flex flex-col justify-between min-h-24">
                <p className="text-xs text-slate-550 font-medium uppercase tracking-wider">{stat.label}</p>
                <p className={`text-3xl font-extrabold mt-2 ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search projects by title or objectives..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-650 focus:border-primary/50 outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {['all', 'HEALTHY', 'ATTENTION', 'RISK'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all capitalize border ${
                    statusFilter === s
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'bg-slate-900/40 border-slate-850 text-slate-450 hover:text-white'
                  }`}
                >
                  {s === 'all' ? 'All Status' : s === 'HEALTHY' ? 'Healthy' : s === 'ATTENTION' ? 'Attention' : 'Risk'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-900/60 border border-slate-800 rounded-xl ml-auto">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-primary text-primary-foreground shadow' : 'text-slate-500 hover:text-white'}`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all cursor-pointer ${viewMode === 'list' ? 'bg-primary text-primary-foreground shadow' : 'text-slate-500 hover:text-white'}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Projects View */}
          {filteredProjects.length === 0 ? (
            <div className="glass-panel rounded-2xl p-16 text-center">
              <FolderOpen className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="font-semibold text-slate-400">No project workspaces found</p>
              <p className="text-xs text-slate-600 mt-1">Try resetting the status filter or keyword search query.</p>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6' : 'flex flex-col gap-4'}>
              {filteredProjects.map((p) => {
                const config = statusConfig[p.status] || statusConfig.HEALTHY;
                const isStarred = starredIds.includes(p.id);

                return (
                  <Link
                    key={p.id}
                    to={`/projects/${p.id}`}
                    className="glass-card rounded-2xl p-6 border border-slate-900 hover:border-slate-850 transition-all flex flex-col gap-4 group relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${config.color} ${config.bg}`}>
                            {config.label}
                          </span>
                          <span className="text-[10px] text-slate-500 truncate max-w-32">{p.team?.name}</span>
                        </div>
                        <h3 className="font-bold text-white text-base group-hover:text-primary transition-colors truncate">{p.title}</h3>
                      </div>
                      <button
                        onClick={(e) => handleToggleStar(p.id, e)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-amber-400 transition-colors"
                      >
                        <Star className={`w-4 h-4 ${isStarred ? 'text-amber-400 fill-amber-400' : ''}`} />
                      </button>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed h-8">{p.description || 'No description provided.'}</p>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-900 text-xs text-slate-500 mt-auto">
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-655" />
                        <span>{p.team?.members?.length || 1} contributors</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`font-bold ${p.healthScore >= 75 ? 'text-emerald-450' : p.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                          {p.healthScore}%
                        </span>
                        <span>health</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      ) : (
        // ----------------- STATE 2: DETAILED WORKSPACE VIEW -----------------
        <div className="space-y-8 animate-fade-in">
          {/* Breadcrumb / Back button & Project Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Link to="/projects" className="text-slate-500 hover:text-white transition-colors flex items-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Workspaces
              </Link>
              <ChevronRight className="w-3 h-3 text-slate-700" />
              <span className="text-slate-300 font-mono truncate max-w-64">{selectedProject.title}</span>
            </div>

            {/* Quick Project Switcher Dropdown */}
            {projects.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-[11px] font-medium">Switch Project:</span>
                <select
                  value={selectedProject.id}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (nextId) {
                      useProjectStore.getState().switchProject(nextId);
                      navigate(`/projects/${nextId}`);
                      loadProjectDetails(nextId);
                    }
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 outline-none cursor-pointer focus:border-primary/50"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-950">
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Project Banner */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden border border-slate-800">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-primary/5 blur-3xl -translate-y-16 translate-x-16" />
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative">
              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${statusConfig[selectedProject.status]?.color} ${statusConfig[selectedProject.status]?.bg}`}>
                    {statusConfig[selectedProject.status]?.label}
                  </span>
                  {selectedProject.githubRepo && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300">
                      <Github className="w-3 h-3 text-slate-400" />
                      {selectedProject.githubRepo}
                    </span>
                  )}
                  {selectedProject.startDate && selectedProject.endDate && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/60 border border-slate-800 text-[10px] text-slate-400">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(selectedProject.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} → {new Date(selectedProject.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>

                <h2 className="text-2xl font-bold text-white tracking-tight">{selectedProject.title}</h2>
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">{selectedProject.description}</p>

                {/* Project Context & Relationship Bar */}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-450">
                  <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-850 px-2.5 py-1.5 rounded-lg">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    <span className="text-slate-400 font-medium">Team:</span>
                    <span className="text-slate-200 font-semibold">{selectedProject.team?.name || 'Unassigned'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-850 px-2.5 py-1.5 rounded-lg">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-200 font-semibold">{selectedProject.team?.members?.length || 1}</span>
                    <span className="text-slate-400">members</span>
                  </div>

                  {/* Milestone Progress Bar */}
                  <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-850 px-3 py-1.5 rounded-lg min-w-44">
                    <Calendar className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center text-[10px] mb-1">
                        <span className="text-slate-400 font-medium">Milestones</span>
                        <span className="text-slate-200 font-bold">{completedMilestones}/{totalMilestones} ({milestonePct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${milestonePct}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Task Progress Bar */}
                  <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-850 px-3 py-1.5 rounded-lg min-w-44">
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center text-[10px] mb-1">
                        <span className="text-slate-400 font-medium">Tasks</span>
                        <span className="text-slate-200 font-bold">{completedTasks}/{totalTasks} ({taskPct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${taskPct}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* GitHub Connection */}
                  <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-850 px-2.5 py-1.5 rounded-lg">
                    <Github className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                    <span className="text-slate-400 font-medium">GitHub:</span>
                    <span className="text-slate-200 font-mono text-[11px] truncate max-w-40">
                      {selectedProject.githubRepo || 'Not Connected'}
                    </span>
                  </div>
                </div>

                {/* Tech stack chips */}
                {selectedProject.techStack && selectedProject.techStack.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {selectedProject.techStack.map((tech) => (
                      <span key={tech} className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-mono">
                        <Tag className="w-2.5 h-2.5 text-primary/70" /> {tech}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Clickable Project Health Box */}
              <button
                type="button"
                onClick={() => setShowHealthModal(true)}
                className="text-center bg-slate-950/60 hover:bg-slate-900 border border-slate-800 hover:border-primary/40 p-4 rounded-2xl flex-shrink-0 min-w-32 transition-all cursor-pointer group shadow-lg"
                title="Click to view full health score calculation breakdown"
              >
                <p className={`text-4xl font-black ${selectedProject.healthScore >= 75 ? 'text-emerald-450' : selectedProject.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {selectedProject.healthScore}%
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1 flex items-center justify-center gap-1">
                  Project Health
                </p>
                <span className="text-[9px] text-primary/80 group-hover:text-primary mt-1 font-medium block">
                  Click for breakdown →
                </span>
              </button>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 border border-slate-900 rounded-xl overflow-x-auto w-fit max-w-full" style={{ scrollbarWidth: 'none' }}>
            {[
              { id: 'overview' as ProjectTab, label: 'Overview', icon: FolderOpen },
              { id: 'tasks' as ProjectTab, label: `Tasks (${totalTasks})`, icon: CheckSquare },
              { id: 'milestones' as ProjectTab, label: `Milestones (${totalMilestones})`, icon: Calendar },
              { id: 'team' as ProjectTab, label: `Team (${selectedProject.team?.members?.length || 1})`, icon: Users },
              { id: 'git' as ProjectTab, label: 'GitHub', icon: Github },
              { id: 'analytics' as ProjectTab, label: 'Analytics', icon: BarChart3 },
              { id: 'ai' as ProjectTab, label: 'Project Intelligence', icon: Brain },
              { id: 'docs' as ProjectTab, label: 'Documents', icon: FileText },
              { id: 'settings' as ProjectTab, label: 'Settings', icon: SettingsIcon },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5 flex-shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Views */}
          <div className="grid grid-cols-1 gap-8">
            {/* VIEW 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Side: objectives & details */}
                <div className="lg:col-span-8 space-y-6">
                  {/* Objectives Checklists */}
                  <div className="glass-panel rounded-2xl p-6 border border-slate-905">
                    <h3 className="text-base font-bold text-white mb-4">Project Objectives</h3>
                    {selectedProject.objectives.length === 0 ? (
                      <p className="text-xs text-slate-500">No project objectives have been configured.</p>
                    ) : (
                      <div className="space-y-3.5">
                        {selectedProject.objectives.map((obj, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-slate-900/30 border border-slate-850 rounded-xl">
                            <div className="p-1 rounded-md bg-primary/10 text-primary mt-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-medium text-slate-350 leading-relaxed">{obj}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Team Members */}
                  <div className="glass-panel rounded-2xl p-6 border border-slate-905">
                    <h3 className="text-base font-bold text-white mb-4">Workspace Roster</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedProject.team?.members.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-900/30 border border-slate-850 rounded-xl">
                          <div className="w-8 h-8 rounded-full bg-slate-850 border border-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">
                            {m.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{m.user.name}</p>
                            <p className="text-[10px] text-slate-500 capitalize">{m.role.toLowerCase()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Side: Quick info panel */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Date Metadata */}
                  <div className="glass-card rounded-2xl p-5 border border-slate-900 space-y-3.5">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Milestones Due</p>
                      <p className="text-sm font-semibold text-white mt-1">
                        {selectedProject.milestones?.filter(m => m.status !== 'COMPLETED').length || 0} remaining
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">GitHub Connection</p>
                      <p className="text-sm font-mono text-slate-400 mt-1 truncate">
                        {selectedProject.githubRepo || 'Not Connected'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Creation Timestamp</p>
                      <p className="text-xs text-slate-400 mt-1 font-mono">
                        {new Date(selectedProject.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Quick Meetings launch */}
                  <div className="glass-card rounded-2xl p-5 border border-slate-900 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Meetings Coordinator</h4>
                    {selectedProject.meetings && selectedProject.meetings.length > 0 ? (
                      selectedProject.meetings.slice(0, 2).map((m) => (
                        <div key={m.id} className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-white truncate max-w-[140px]">{m.title}</p>
                            <p className="text-[9px] text-slate-500 mt-0.5">{new Date(m.dateTime).toLocaleDateString()}</p>
                          </div>
                          <a
                            href={m.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-emerald-500 text-slate-950 text-[10px] font-bold rounded-lg hover:bg-emerald-450 transition-all flex items-center gap-1"
                          >
                            Join <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-500">No scheduled coordinator link detected.</p>
                    )}
                  </div>

                  {/* Quick Project Tool Links */}
                  <div className="glass-card rounded-2xl p-5 border border-slate-900 space-y-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Project Work Tools</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <Link
                          to={`/tasks?project=${selectedProject.id}`}
                          className="flex items-center gap-2 p-2.5 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition-all"
                        >
                          <CheckCircle className="w-3.5 h-3.5 text-indigo-400" />
                          Kanban Board
                        </Link>
                        <Link
                          to={`/github?project=${selectedProject.id}`}
                          className="flex items-center gap-2 p-2.5 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition-all"
                        >
                          <Github className="w-3.5 h-3.5 text-sky-400" />
                          GitHub Repo
                        </Link>
                        <Link
                          to={`/ai-pm?project=${selectedProject.id}`}
                          className="flex items-center gap-2 p-2.5 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition-all"
                        >
                          <Brain className="w-3.5 h-3.5 text-purple-400" />
                          AI PM Insights
                        </Link>
                        <Link
                          to={`/analytics?project=${selectedProject.id}`}
                          className="flex items-center gap-2 p-2.5 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 rounded-xl text-xs font-medium text-slate-300 hover:text-white transition-all"
                        >
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                          Analytics
                        </Link>
                      </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW: PROJECT TASKS KANBAN */}
            {activeTab === 'tasks' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <CheckSquare className="w-4 h-4 text-primary" />
                      Project Tasks Board
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      All tasks belonging strictly to <span className="text-white font-medium">{selectedProject.title}</span>.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/tasks?project=${selectedProject.id}`}
                      className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-all inline-flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open Full Board
                    </Link>
                    <button
                      onClick={() => setShowTaskModal(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Task
                    </button>
                  </div>
                </div>

                {/* Filter and stats row */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter project tasks..."
                      value={taskSearchQuery}
                      onChange={(e) => setTaskSearchQuery(e.target.value)}
                      className="bg-transparent text-xs text-white placeholder:text-slate-600 outline-none w-48"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-medium">Filter Status:</span>
                    {['ALL', 'TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setTaskFilterStatus(st)}
                        className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-all ${
                          taskFilterStatus === st
                            ? 'bg-primary text-primary-foreground shadow'
                            : 'text-slate-400 hover:text-white bg-slate-900/60 border border-slate-800'
                        }`}
                      >
                        {st === 'ALL' ? 'All' : st.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4 Kanban Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { id: 'TODO', title: 'To Do', border: 'border-slate-700', bg: 'bg-slate-900/20' },
                    { id: 'IN_PROGRESS', title: 'In Progress', border: 'border-blue-500/40', bg: 'bg-blue-500/5' },
                    { id: 'REVIEW', title: 'In Review', border: 'border-purple-500/40', bg: 'bg-purple-500/5' },
                    { id: 'COMPLETED', title: 'Done', border: 'border-emerald-500/40', bg: 'bg-emerald-500/5' },
                  ].map((col) => {
                    const colTasks = (selectedProject.tasks || [])
                      .filter((t) => t.status === col.id)
                      .filter(() => taskFilterStatus === 'ALL' || taskFilterStatus === col.id)
                      .filter((t) => !taskSearchQuery || t.title.toLowerCase().includes(taskSearchQuery.toLowerCase()));

                    return (
                      <div key={col.id} className={`p-4 rounded-2xl border ${col.border} ${col.bg} flex flex-col min-h-[350px]`}>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/80">
                          <span className="text-xs font-bold text-white tracking-wide">{col.title}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                            {colTasks.length}
                          </span>
                        </div>

                        <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[500px] pr-1">
                          {colTasks.length === 0 ? (
                            <div className="h-28 flex items-center justify-center border border-dashed border-slate-800/60 rounded-xl text-[11px] text-slate-600">
                              No tasks
                            </div>
                          ) : (
                            colTasks.map((task) => (
                              <div
                                key={task.id}
                                className="p-3 bg-slate-950/80 hover:bg-slate-900 border border-slate-850 hover:border-slate-750 rounded-xl transition-all shadow-sm group"
                              >
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                    task.priority === 'HIGH' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                    task.priority === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                    'bg-slate-800 text-slate-400'
                                  }`}>
                                    {task.priority}
                                  </span>
                                  {task.dueDate && (
                                    <span className="text-[9px] text-slate-500 flex items-center gap-1 font-mono">
                                      <Clock className="w-2.5 h-2.5" />
                                      {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs font-semibold text-slate-200 leading-snug mb-2">{task.title}</p>

                                <div className="flex items-center justify-between pt-2 border-t border-slate-900/60 mt-2">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-300">
                                      {task.assignee?.name?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                    <span className="text-[10px] text-slate-400 truncate max-w-24">
                                      {task.assignee?.name || 'Unassigned'}
                                    </span>
                                  </div>

                                  <select
                                    value={task.status}
                                    onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value as any)}
                                    className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-300 outline-none cursor-pointer"
                                  >
                                    <option value="TODO">To Do</option>
                                    <option value="IN_PROGRESS">In Progress</option>
                                    <option value="REVIEW">In Review</option>
                                    <option value="COMPLETED">Done</option>
                                  </select>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW 2: MILESTONES */}
            {activeTab === 'milestones' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white">Project Milestones</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Track key delivery targets and see contributing tasks.</p>
                  </div>
                  <button
                    onClick={() => setShowMilestoneModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Milestone
                  </button>
                </div>

                {/* Milestone Summary KPIs */}
                {selectedProject.milestones && selectedProject.milestones.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3.5 bg-slate-900/40 border border-slate-850 rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Milestones</p>
                      <p className="text-xl font-extrabold text-white mt-0.5">{selectedProject.milestones.length}</p>
                    </div>
                    <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Completed</p>
                      <p className="text-xl font-extrabold text-emerald-400 mt-0.5">
                        {selectedProject.milestones.filter(m => m.status === 'COMPLETED').length}
                      </p>
                    </div>
                    <div className="p-3.5 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400">In Progress</p>
                      <p className="text-xl font-extrabold text-blue-400 mt-0.5">
                        {selectedProject.milestones.filter(m => m.status === 'IN_PROGRESS').length}
                      </p>
                    </div>
                    <div className="p-3.5 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Overdue</p>
                      <p className="text-xl font-extrabold text-rose-400 mt-0.5">
                        {selectedProject.milestones.filter(m => m.status !== 'COMPLETED' && new Date(m.dueDate) < new Date()).length}
                      </p>
                    </div>
                  </div>
                )}

                {(!selectedProject.milestones || selectedProject.milestones.length === 0) ? (
                  <div className="glass-panel rounded-2xl p-12 text-center text-slate-500">
                    <Calendar className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-300">No milestones scheduled yet.</p>
                    <p className="text-xs text-slate-500 mt-1">Break your project down into milestones to track completion velocity.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedProject.milestones.map((m) => {
                      const isCompleted = m.status === 'COMPLETED';
                      const isInProgress = m.status === 'IN_PROGRESS';
                      const isPastDue = !isCompleted && new Date(m.dueDate) < new Date();

                      // Contributing tasks
                      const milestoneTasks = (selectedProject.tasks || []).filter(t => t.milestoneId === m.id);
                      const doneTasks = milestoneTasks.filter(t => t.status === 'COMPLETED').length;
                      const progress = milestoneTasks.length > 0
                        ? Math.round((doneTasks / milestoneTasks.length) * 100)
                        : (isCompleted ? 100 : 0);

                      return (
                        <div
                          key={m.id}
                          className={`p-5 rounded-2xl border transition-all flex flex-col gap-4 ${
                            isCompleted
                              ? 'bg-slate-950/30 border-slate-900 opacity-75'
                              : isPastDue
                              ? 'glass-panel border-rose-500/30 bg-rose-500/5'
                              : isInProgress
                              ? 'glass-panel border-primary/40'
                              : 'glass-card border-slate-900 hover:border-slate-800'
                          }`}
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div className={`p-2.5 rounded-xl flex-shrink-0 mt-0.5 ${
                                isCompleted ? 'bg-emerald-500/10 text-emerald-400' : isPastDue ? 'bg-rose-500/15 text-rose-400' : 'bg-primary/10 text-primary'
                              }`}>
                                <Target className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className={`font-bold text-sm ${isCompleted ? 'text-slate-400 line-through' : 'text-white'}`}>{m.title}</h4>
                                  {isPastDue && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                                      Overdue
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{m.description || 'No description provided.'}</p>
                                <p className="text-[10px] text-slate-500 mt-1.5 font-mono">
                                  DUE: {new Date(m.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 justify-end flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handleUpdateMilestoneStatus(m.id, m.status)}
                                className={`text-[10px] px-3 py-1.5 rounded-xl border font-bold uppercase tracking-wider cursor-pointer transition-all ${
                                  isCompleted
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                    : isInProgress
                                    ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                                }`}
                                title="Click to cycle status"
                              >
                                {m.status.replace('_', ' ')}
                              </button>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="space-y-1.5 pt-2 border-t border-slate-900/60">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-400 font-medium">
                                Milestone Progress ({doneTasks} / {milestoneTasks.length} tasks completed)
                              </span>
                              <span className="font-bold text-white">{progress}%</span>
                            </div>
                            <div className="w-full bg-slate-950 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full transition-all duration-500 ${
                                  progress === 100
                                    ? 'bg-emerald-500'
                                    : isPastDue
                                    ? 'bg-rose-500'
                                    : 'bg-primary'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>

                          {/* Contributing Tasks List */}
                          {milestoneTasks.length > 0 ? (
                            <div className="pt-2 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contributing Tasks ({milestoneTasks.length})</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {milestoneTasks.map((t) => (
                                  <div key={t.id} className="flex items-center justify-between p-2.5 bg-slate-950/40 rounded-xl border border-slate-900 text-xs">
                                    <div className="flex items-center gap-2 truncate flex-1 min-w-0 mr-2">
                                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                        t.priority === 'HIGH' ? 'bg-rose-500' : t.priority === 'MEDIUM' ? 'bg-amber-500' : 'bg-slate-500'
                                      }`} />
                                      <span className={`truncate ${t.status === 'COMPLETED' ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                                        {t.title}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {t.assignee && (
                                        <span className="text-[10px] text-slate-400 truncate max-w-[90px]">{t.assignee.name}</span>
                                      )}
                                      <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                                        t.status === 'COMPLETED'
                                          ? 'bg-emerald-500/10 text-emerald-400'
                                          : t.status === 'IN_PROGRESS'
                                          ? 'bg-blue-500/10 text-blue-400'
                                          : 'bg-slate-900 text-slate-400'
                                      }`}>
                                        {t.status.replace('_', ' ')}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-500 italic pt-1">
                              No tasks linked to this milestone yet. Assign this milestone to tasks on the Tasks board.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* VIEW: PROJECT TEAM & MEMBERS */}
            {activeTab === 'team' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      Project Team Roster
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Members assigned to work on <span className="text-white font-medium">{selectedProject.title}</span> under workspace team <span className="text-primary font-semibold">{selectedProject.team?.name}</span>.
                    </p>
                  </div>
                  <Link
                    to="/teams"
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-all self-start flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5 text-primary" /> Manage Team Workspace →
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(selectedProject.team?.members || []).map((m, idx) => {
                    const memberTasks = (selectedProject.tasks || []).filter((t) => t.assignee?.id === m.user.id);
                    const completedMemberTasks = memberTasks.filter((t) => t.status === 'COMPLETED').length;
                    const memberTaskPct = memberTasks.length > 0 ? Math.round((completedMemberTasks / memberTasks.length) * 100) : 0;

                    return (
                      <div key={idx} className="glass-panel rounded-2xl p-5 border border-slate-850 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                                {m.user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white leading-snug">{m.user.name}</p>
                                <p className="text-xs text-slate-400 truncate max-w-[180px]">{m.user.email}</p>
                              </div>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                              {m.role}
                            </span>
                          </div>

                          {/* Member skills */}
                          {m.user.skills && m.user.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-4">
                              {m.user.skills.slice(0, 4).map((skill, sIdx) => (
                                <span key={sIdx} className="text-[9px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Member Project Workload */}
                        <div className="pt-3 border-t border-slate-900 space-y-1.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-400">Assigned Workload</span>
                            <span className="font-semibold text-slate-200">
                              {completedMemberTasks}/{memberTasks.length} tasks ({memberTaskPct}%)
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${memberTaskPct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW 3: DOCUMENTS */}
            {activeTab === 'docs' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Side: Document list */}
                <div className="lg:col-span-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white">Project Documents</h3>
                      <p className="text-xs text-slate-550 mt-0.5">Upload proposals and requirement files.</p>
                    </div>
                    <button
                      onClick={() => setShowDocModal(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Upload File
                    </button>
                  </div>

                  {(!selectedProject.documents || selectedProject.documents.length === 0) ? (
                    <div className="glass-panel rounded-2xl p-12 text-center text-slate-550">
                      <FileText className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                      <span>No documents linked yet.</span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedProject.documents.map((d) => (
                        <div
                          key={d.id}
                          className="p-4 bg-slate-900/30 border border-slate-850 hover:border-slate-800 rounded-2xl flex flex-col gap-3 transition-all hover:bg-slate-900/50"
                        >
                          <div
                            onClick={() => setAnalyzingDocText(`Proposal document metadata: Name: ${d.name}, Category: ${d.category}. Content summary goes here...`)}
                            className="flex items-center justify-between gap-4 cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-primary/10 rounded-xl text-primary">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-bold text-white">{d.name}</p>
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-primary/20 text-primary border border-primary/30">
                                    v{d.version || 1}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-550 capitalize mt-0.5">{d.category} · {new Date(d.createdAt).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <a
                                href={getFileDisplayUrl(d.fileUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Open / Download Document"
                                className="p-2 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteDoc(d.id); }}
                                title="Delete Document"
                                className="p-2 bg-slate-850 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg transition-all"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Version History Drawer (if versions exist) */}
                          {d.versions && d.versions.length > 0 && (
                            <div className="pt-2 border-t border-slate-900 space-y-1.5">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Version History ({d.versions.length})</p>
                              <div className="space-y-1">
                                {d.versions.map((ver) => (
                                  <div key={ver.id} className="flex items-center justify-between px-2.5 py-1.5 bg-slate-950/40 rounded-lg text-[10px]">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-primary font-bold">v{ver.version}</span>
                                      <span className="text-slate-400">{ver.notes || 'Previous release'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-500">
                                      <span>{new Date(ver.createdAt).toLocaleDateString()}</span>
                                      <a
                                        href={getFileDisplayUrl(ver.fileUrl)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline font-semibold"
                                      >
                                        Download
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Side: AI Requirement Analyzer */}
                <div className="lg:col-span-6 space-y-6">
                  <div className="glass-panel rounded-2xl p-6 border border-slate-900">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Brain className="w-4 h-4 text-primary" /> AI Document Analyzer
                    </h3>
                    <p className="text-xs text-slate-550 mt-1 leading-relaxed">
                      Select a file from the list or paste requirement details below to assess completion, risk parameters, and suggested improvements.
                    </p>

                    <div className="mt-4 space-y-4">
                      <textarea
                        value={analyzingDocText}
                        onChange={(e) => setAnalyzingDocText(e.target.value)}
                        placeholder="Paste document text or select an uploaded file above to load..."
                        rows={6}
                        className="w-full p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-650 focus:border-primary/50 outline-none transition-all resize-none"
                      />

                      <button
                        onClick={runDocumentAIAnalysis}
                        disabled={actionLoading || !analyzingDocText.trim()}
                        className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {actionLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <Brain className="w-3.5 h-3.5" /> Analyze Requirements
                          </>
                        )}
                      </button>

                      {aiAnalysisResult && (
                        <div className="mt-6 pt-5 border-t border-slate-900 space-y-4 animate-fade-in text-xs">
                          <div>
                            <p className="font-bold text-white">Estimated Full Time Required</p>
                            <p className="text-slate-400 mt-1 leading-relaxed">{aiAnalysisResult.estimatedCompletionTime || 'N/A'}</p>
                          </div>

                          <div>
                            <p className="font-bold text-white">Missing Components / Risks</p>
                            <ul className="list-disc list-inside text-slate-450 mt-1 space-y-1">
                              {aiAnalysisResult.missingComponents?.map((x: string, idx: number) => (
                                <li key={idx} className="leading-relaxed">{x}</li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <p className="font-bold text-white">Suggested Improvements</p>
                            <ul className="list-disc list-inside text-slate-450 mt-1 space-y-1">
                              {aiAnalysisResult.suggestedImprovements?.map((x: string, idx: number) => (
                                <li key={idx} className="leading-relaxed">{x}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 4: GITHUB SYNC */}
            {activeTab === 'git' && (
              <div className="space-y-6">
                {!selectedProject.githubRepo ? (
                  <div className="glass-panel rounded-2xl p-16 text-center max-w-2xl mx-auto space-y-4">
                    <Github className="w-12 h-12 text-slate-700 mx-auto" />
                    <h3 className="text-lg font-bold text-white">Connect GitHub Repository</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Link a GitHub repository to track commits, contribution shares, and compile Git insights directly on the project workspace.
                    </p>
                    <div className="flex gap-2 justify-center max-w-sm mx-auto">
                      <input
                        type="text"
                        placeholder="owner/repo (e.g. facebook/react)"
                        value={settingsGithubRepo}
                        onChange={(e) => setSettingsGithubRepo(e.target.value)}
                        className="px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-white outline-none focus:border-primary/50 w-full"
                      />
                      <button
                        onClick={handleUpdateProjectSettings}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer"
                      >
                        Link Repo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Commits Tracker */}
                    <div className="lg:col-span-7 space-y-6">
                      <div className="glass-panel rounded-2xl p-6 border border-slate-900">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <Github className="w-4 h-4 text-slate-400" /> Commits Sync Activity
                          </h3>
                          <span className="text-[10px] text-slate-500">
                            Total: {selectedProject.gitAnalytics?.commitsCount || 28} commits
                          </span>
                        </div>

                        <div className="space-y-3">
                          {[
                            { author: 'Priya Mehta', hash: 'e4a2d8b', msg: 'feat: add JWT auth middlewares and schemas', time: '1h ago' },
                            { author: 'Arjun Verma', hash: 'b12c9f0', msg: 'fix: resolve Tasks column drag alignment issues', time: '4h ago' },
                            { author: 'Priya Mehta', hash: 'c78e1b2', msg: 'docs: document API auth flow in readme', time: '1d ago' },
                            { author: 'Sneha Kapoor', hash: 'f5d3e8a', msg: 'test: write controller authentication unit tests', time: '2d ago' },
                          ].map((commit, idx) => (
                            <div key={idx} className="p-3.5 bg-slate-950/20 border border-slate-900 rounded-xl flex items-center justify-between gap-4 hover:border-slate-800 transition-all">
                              <div>
                                <p className="text-xs font-bold text-slate-300">{commit.msg}</p>
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                                  <span>{commit.author}</span>
                                  <span>·</span>
                                  <span>{commit.time}</span>
                                </div>
                              </div>
                              <code className="text-[10px] px-2 py-0.5 bg-slate-900 border border-slate-850 text-slate-450 rounded font-mono">
                                {commit.hash}
                              </code>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Ownership splits charts */}
                    <div className="lg:col-span-5 space-y-6">
                      <div className="glass-panel rounded-2xl p-6 border border-slate-900">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-primary" /> Contribution Ratios
                        </h3>
                        <div className="h-56">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={commitChartsData}>
                              <XAxis dataKey="name" stroke="#5f6368" fontSize={9} />
                              <YAxis stroke="#5f6368" fontSize={9} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#090d16', borderColor: '#1f293d', borderRadius: 8 }}
                                labelStyle={{ color: '#fff', fontSize: 10 }}
                                itemStyle={{ color: '#60a5fa', fontSize: 10 }}
                              />
                              <Bar dataKey="commits" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                                {commitChartsData.map((_, index) => (
                                  <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#3b82f6'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <p className="text-[10px] text-slate-500 text-center mt-3">Commit weight counts mapped across roster repository contributors</p>
                      </div>
                    </div>
                  </div>
                )}
                <DeploymentIntelligence projectId={selectedProject.id} />
              </div>
            )}

            {/* VIEW: PROJECT ANALYTICS */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-400" />
                      Project Analytics & Metrics
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Detailed delivery and execution metrics scoped strictly to <span className="text-white font-medium">{selectedProject.title}</span>.
                    </p>
                  </div>
                  <Link
                    to="/analytics"
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-all self-start flex items-center gap-1.5"
                  >
                    <BarChart3 className="w-3.5 h-3.5 text-emerald-400" /> Cross-Project Global Analytics →
                  </Link>
                </div>

                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-card rounded-2xl p-5 border border-slate-900">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Health Index</p>
                    <p className={`text-3xl font-black mt-1 ${selectedProject.healthScore >= 75 ? 'text-emerald-400' : selectedProject.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                      {selectedProject.healthScore}%
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Status: {selectedProject.status}
                    </span>
                  </div>

                  <div className="glass-card rounded-2xl p-5 border border-slate-900">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Task Completion</p>
                    <p className="text-3xl font-black text-white mt-1">{taskPct}%</p>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {completedTasks} of {totalTasks} finished
                    </span>
                  </div>

                  <div className="glass-card rounded-2xl p-5 border border-slate-900">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Milestone Velocity</p>
                    <p className="text-3xl font-black text-amber-400 mt-1">{milestonePct}%</p>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {completedMilestones} of {totalMilestones} reached
                    </span>
                  </div>

                  <div className="glass-card rounded-2xl p-5 border border-slate-900">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Team Size</p>
                    <p className="text-3xl font-black text-indigo-400 mt-1">{selectedProject.team?.members?.length || 1}</p>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Active Collaborators
                    </span>
                  </div>
                </div>

                {/* Status & Priority Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Task Status Breakdown */}
                  <div className="glass-panel rounded-2xl p-6 border border-slate-900 space-y-4">
                    <h4 className="text-sm font-bold text-white">Task Status Breakdown</h4>
                    <div className="space-y-3">
                      {[
                        { label: 'To Do', count: (selectedProject.tasks || []).filter(t => t.status === 'TODO').length, color: 'bg-slate-500' },
                        { label: 'In Progress', count: (selectedProject.tasks || []).filter(t => t.status === 'IN_PROGRESS').length, color: 'bg-blue-500' },
                        { label: 'In Review', count: (selectedProject.tasks || []).filter(t => t.status === 'REVIEW').length, color: 'bg-purple-500' },
                        { label: 'Completed', count: (selectedProject.tasks || []).filter(t => t.status === 'COMPLETED').length, color: 'bg-emerald-500' },
                      ].map((item) => {
                        const pct = totalTasks > 0 ? Math.round((item.count / totalTasks) * 100) : 0;
                        return (
                          <div key={item.label} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-300 font-medium">{item.label}</span>
                              <span className="text-slate-400">{item.count} tasks ({pct}%)</span>
                            </div>
                            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                              <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Task Priority Distribution */}
                  <div className="glass-panel rounded-2xl p-6 border border-slate-900 space-y-4">
                    <h4 className="text-sm font-bold text-white">Task Priority Distribution</h4>
                    <div className="space-y-3">
                      {[
                        { label: 'High Priority', count: (selectedProject.tasks || []).filter(t => t.priority === 'HIGH').length, color: 'bg-red-500' },
                        { label: 'Medium Priority', count: (selectedProject.tasks || []).filter(t => t.priority === 'MEDIUM').length, color: 'bg-amber-500' },
                        { label: 'Low Priority', count: (selectedProject.tasks || []).filter(t => t.priority === 'LOW').length, color: 'bg-slate-400' },
                      ].map((item) => {
                        const pct = totalTasks > 0 ? Math.round((item.count / totalTasks) * 100) : 0;
                        return (
                          <div key={item.label} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-300 font-medium">{item.label}</span>
                              <span className="text-slate-400">{item.count} tasks ({pct}%)</span>
                            </div>
                            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                              <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 5: PROJECT INTELLIGENCE */}
            {activeTab === 'ai' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left pane: Delay predictor */}
                <div className="lg:col-span-6 space-y-6">
                  <div className="glass-panel rounded-2xl p-6 border border-slate-900 space-y-4">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Brain className="w-4 h-4 text-red-400" /> Delay Risk & Predictions
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      AI calculations check deadlines, remaining tasks, and commits velocity to compile delay alarms.
                    </p>

                    <button
                      onClick={runDelayPrediction}
                      disabled={actionLoading}
                      className="w-full py-2.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Run Delay Predictor Engine'}
                    </button>

                    {delayPrediction && (
                      <div className="pt-4 border-t border-slate-900 space-y-4 animate-fade-in">
                        <div className="flex items-center justify-between p-4 bg-slate-950/60 rounded-xl border border-slate-900">
                          <div>
                            <p className="text-xs text-slate-500">Calculated Delay Risk Probability</p>
                            <p className="text-2xl font-black text-white mt-1">{delayPrediction.delayProbability}%</p>
                          </div>
                          <span className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold uppercase ${
                            delayPrediction.riskLevel === 'HIGH'
                              ? 'bg-red-500/10 border-red-500/20 text-red-400'
                              : delayPrediction.riskLevel === 'MEDIUM'
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-450'
                          }`}>
                            {delayPrediction.riskLevel} Risk
                          </span>
                        </div>

                        <div>
                          <p className="text-xs font-bold text-white">Detection Parameters</p>
                          <ul className="list-disc list-inside text-xs text-slate-400 mt-2 space-y-1">
                            {delayPrediction.reasons.map((r: string, idx: number) => (
                              <li key={idx} className="leading-relaxed">{r}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right pane: Sprint Summary Generator */}
                <div className="lg:col-span-6 space-y-6">
                  <div className="glass-panel rounded-2xl p-6 border border-slate-900 space-y-4">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-400" /> Weekly Sprint Summarizer
                    </h3>
                    <p className="text-xs text-slate-550 leading-relaxed">
                      Compiles completed work, outstanding modules, and blockers to output progress assessments.
                    </p>

                    <button
                      onClick={generateSprintSummary}
                      disabled={actionLoading}
                      className="w-full py-2.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Compile Sprint Summary'}
                    </button>

                    {sprintSummary && (
                      <div className="pt-4 border-t border-slate-900 space-y-4 animate-fade-in text-xs">
                        <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-slate-900 rounded-xl">
                          <span className="text-slate-550">Productivity Score Index</span>
                          <span className="font-extrabold text-primary text-sm">{sprintSummary.productivityIndex || 85}/100</span>
                        </div>

                        <div>
                          <p className="font-bold text-white">Work Accomplished</p>
                          <ul className="list-disc list-inside text-slate-400 mt-1.5 space-y-1">
                            {sprintSummary.workCompleted?.map((x: string, idx: number) => (
                              <li key={idx} className="leading-relaxed">{x}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="font-bold text-white">Outstanding Workloads</p>
                          <ul className="list-disc list-inside text-slate-400 mt-1.5 space-y-1">
                            {sprintSummary.pendingWork?.map((x: string, idx: number) => (
                              <li key={idx} className="leading-relaxed">{x}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 6: SETTINGS */}
            {activeTab === 'settings' && (
              <div className="glass-panel rounded-2xl p-6 border border-slate-900 max-w-2xl">
                <h3 className="text-base font-bold text-white mb-6">Project Configuration</h3>

                <form onSubmit={handleUpdateProjectSettings} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">Project Workspace Name</label>
                    <input
                      type="text"
                      value={settingsTitle}
                      onChange={(e) => setSettingsTitle(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all font-semibold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">Workspace Description</label>
                    <textarea
                      value={settingsDesc}
                      onChange={(e) => setSettingsDesc(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all resize-none leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-2">Linked GitHub Path</label>
                    <input
                      type="text"
                      placeholder="owner/repo (e.g. facebook/react)"
                      value={settingsGithubRepo}
                      onChange={(e) => setSettingsGithubRepo(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-650 focus:border-primary/50 outline-none transition-all font-mono"
                    />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-900">
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all cursor-pointer shadow"
                    >
                      Save Configuration
                    </button>

                    {selectedProject.team?.members.find(m => m.user.id === currentUser?.id)?.role === 'OWNER' && (
                      <button
                        type="button"
                        onClick={handleDeleteProject}
                        disabled={actionLoading}
                        className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs font-bold rounded-xl transition-all cursor-pointer ml-auto"
                      >
                        Delete Project
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {/* VIEW 6b: DEPLOYMENT PROVIDER SETTINGS (per-project Vercel/Render ids) */}
            {activeTab === 'settings' && (
              <DeployProviderSettings projectId={selectedProject.id} />
            )}
          </div>
        </div>
      )}

      {/* 8-STEP PROJECT CREATION WIZARD */}
      <CreateProjectWizard
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(createdProject) => {
          setShowCreateModal(false);
          showToast(`✅ Project workspace created successfully!`);
          navigate(`/projects/${createdProject.id}`);
          loadInitialData();
        }}
      />

      {/* ADD MILESTONE MODAL */}
      {showMilestoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md border-slate-700 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Add Milestone Deadline</h2>
              <button onClick={() => setShowMilestoneModal(false)} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMilestone} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Milestone Title</label>
                <input
                  type="text"
                  placeholder="e.g. Phase 1 Frontend scaffolding release"
                  value={msTitle}
                  onChange={(e) => setMsTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Description</label>
                <textarea
                  placeholder="Outline the targets to check off before completing this milestone..."
                  value={msDesc}
                  onChange={(e) => setMsDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-655 focus:border-primary/50 outline-none transition-all resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Target Due Date</label>
                <input
                  type="date"
                  value={msDueDate}
                  onChange={(e) => setMsDueDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white focus:border-primary/50 outline-none transition-all cursor-pointer font-mono"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setShowMilestoneModal(false)}
                  className="flex-1 py-2.5 border border-slate-750 text-slate-400 text-xs font-semibold rounded-xl hover:bg-slate-850 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Schedule Milestone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD DOC MODAL — drag & drop + URL fallback */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md border-slate-700 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Upload Document</h2>
              <button onClick={() => { setShowDocModal(false); setSelectedFile(null); }} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-slate-950/60 border border-slate-900 rounded-xl mb-5">
              <button
                type="button"
                onClick={() => setDocUploadMode('file')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  docUploadMode === 'file' ? 'bg-primary text-primary-foreground' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" /> Upload File
              </button>
              <button
                type="button"
                onClick={() => setDocUploadMode('url')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  docUploadMode === 'url' ? 'bg-primary text-primary-foreground' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" /> Link URL
              </button>
            </div>

            <form onSubmit={handleUploadDoc} className="space-y-4">
              {docUploadMode === 'file' ? (
                <>
                  {/* Drag & Drop Zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                      isDragOver
                        ? 'border-primary bg-primary/10 scale-[1.01]'
                        : selectedFile
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/30'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.svg,.zip,.csv"
                      onChange={handleFileSelect}
                    />
                    {selectedFile ? (
                      <>
                        <CheckCircle className="w-8 h-8 text-emerald-400" />
                        <div className="text-center">
                          <p className="text-xs font-bold text-emerald-300">{selectedFile.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB — click to change</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-600" />
                        <div className="text-center">
                          <p className="text-xs font-semibold text-slate-300">Drag & drop a file here</p>
                          <p className="text-[10px] text-slate-500 mt-1">or click to browse · PDF, DOCX, PPTX, XLSX, TXT</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">Document Label (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Project Proposal Draft V1"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-655 focus:border-primary/50 outline-none transition-all"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">Document Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Project Proposal Draft V1"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-655 focus:border-primary/50 outline-none transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">Cloud / Public URL</label>
                    <input
                      type="url"
                      placeholder="https://drive.google.com/..."
                      value={docUrl}
                      onChange={(e) => setDocUrl(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-650 focus:border-primary/50 outline-none transition-all font-mono"
                      required
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Category</label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:border-primary/50 outline-none text-sm text-white transition-all cursor-pointer"
                >
                  <option value="proposal">Project Proposal</option>
                  <option value="report">Status Report</option>
                  <option value="requirements">Software Requirements Specification (SRS)</option>
                  <option value="other">Other Reference Materials</option>
                </select>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => { setShowDocModal(false); setSelectedFile(null); }}
                  className="flex-1 py-2.5 border border-slate-755 text-slate-400 text-xs font-semibold rounded-xl hover:bg-slate-850 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || (docUploadMode === 'file' && !selectedFile) || (docUploadMode === 'url' && (!docName || !docUrl))}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Upload className="w-3.5 h-3.5" /> Upload</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Health Score Breakdown Modal ─── */}
      {showHealthModal && selectedProject && (() => {
        const totalTasks = selectedProject.tasks?.length || 0;
        const completedTasks = selectedProject.tasks?.filter(t => t.status === 'COMPLETED').length || 0;
        const taskCompletionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;
        const taskScore = Math.round(taskCompletionPct * 0.5);

        const commitsCount = (selectedProject.gitAnalytics as any)?.commitsCount || 0;
        const commitRatio = Math.min(Math.round((commitsCount / 15) * 100), 100);
        const commitScore = Math.round(commitRatio * 0.3);

        const chatScore = 20; // Placeholder: chat activity capped at 20 pts

        const overdueTasksCount = selectedProject.tasks?.filter(t =>
          t.status !== 'COMPLETED' && t.dueDate && new Date(t.dueDate) < new Date()
        ).length || 0;
        const overdueMilestones = selectedProject.milestones?.filter(m =>
          m.status !== 'COMPLETED' && new Date(m.dueDate) < new Date()
        ).length || 0;
        const overduePenalty = Math.min((overdueTasksCount + overdueMilestones) * 10, 30);

        const baseScore = taskScore + commitScore + chatScore;
        const finalScore = Math.max(0, baseScore - overduePenalty);
        const scoreColor = finalScore >= 75 ? 'text-emerald-400' : finalScore >= 50 ? 'text-amber-400' : 'text-red-400';

        const barColor = (pct: number) => pct >= 75 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowHealthModal(false)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-lg glass-panel rounded-2xl p-7 border border-slate-800 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    Health Score Breakdown
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedProject.title}</p>
                </div>
                <div className="text-right">
                  <p className={`text-4xl font-black ${scoreColor}`}>{finalScore}%</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
                    {finalScore >= 75 ? 'HEALTHY' : finalScore >= 50 ? 'NEEDS ATTENTION' : 'AT RISK'}
                  </p>
                </div>
              </div>

              {/* Formula Note */}
              <p className="text-[11px] text-slate-500 mb-5 italic">
                Score = (Task Completion × 50%) + (Commit Activity × 30%) + (Team Activity × 20%) − Overdue Penalties
              </p>

              {/* Breakdown rows */}
              <div className="space-y-4">
                {/* Task Completion */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-200">Task Completion</span>
                      <span className="text-[10px] text-slate-500">(weight: 50%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{completedTasks}/{totalTasks} tasks</span>
                      <span className="text-xs font-bold text-white">+{taskScore} pts</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor(taskCompletionPct)}`} style={{ width: `${taskCompletionPct}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{taskCompletionPct}% completion × 50% weight = {taskScore} pts</p>
                </div>

                {/* Commit Activity */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Github className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-200">Commit Activity</span>
                      <span className="text-[10px] text-slate-500">(weight: 30%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{commitsCount} commits</span>
                      <span className="text-xs font-bold text-white">+{commitScore} pts</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor(commitRatio)}`} style={{ width: `${commitRatio}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{commitRatio}% of target (15 commits) × 30% weight = {commitScore} pts</p>
                </div>

                {/* Team Activity */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-200">Team Activity</span>
                      <span className="text-[10px] text-slate-500">(weight: 20%)</span>
                    </div>
                    <span className="text-xs font-bold text-white">+{chatScore} pts</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 w-full" />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Collaboration activity baseline × 20% weight = {chatScore} pts</p>
                </div>

                {/* Overdue Penalty */}
                {overduePenalty > 0 && (
                  <div className="border border-red-500/20 bg-red-500/5 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-xs font-semibold text-red-300">Overdue Penalty</span>
                      </div>
                      <span className="text-xs font-bold text-red-400">−{overduePenalty} pts</span>
                    </div>
                    <p className="text-[10px] text-red-400/70 mt-1.5">
                      {overdueTasksCount > 0 && `${overdueTasksCount} overdue task${overdueTasksCount !== 1 ? 's' : ''}`}
                      {overdueTasksCount > 0 && overdueMilestones > 0 && ' · '}
                      {overdueMilestones > 0 && `${overdueMilestones} overdue milestone${overdueMilestones !== 1 ? 's' : ''}`}
                      {' · '}−10 pts each (max −30)
                    </p>
                  </div>
                )}

                {/* Divider + Final Score */}
                <div className="border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Final Health Score</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{taskScore} + {commitScore} + {chatScore}{overduePenalty > 0 ? ` − ${overduePenalty}` : ''}</span>
                      <span className={`text-xl font-black ${scoreColor}`}>{finalScore}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => setShowHealthModal(false)}
                  className="px-5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Quick Project Task Creation Modal */}
      {showTaskModal && selectedProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowTaskModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md glass-panel rounded-2xl p-6 border border-slate-800 shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" /> Create Project Task
              </h3>
              <button
                onClick={() => setShowTaskModal(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement authentication middleware"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assign to Member</label>
                <select
                  value={taskAssigneeId}
                  onChange={(e) => setTaskAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none"
                >
                  <option value="">Unassigned</option>
                  {selectedProject.team?.members?.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              {selectedProject.milestones && selectedProject.milestones.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Milestone (Optional)</label>
                  <select
                    value={taskMilestoneId}
                    onChange={(e) => setTaskMilestoneId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none"
                  >
                    <option value="">No Milestone</option>
                    {selectedProject.milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !taskTitle.trim()}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all disabled:opacity-50"
                >
                  {actionLoading ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
