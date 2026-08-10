import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import api from '../utils/api';
import {
  FolderOpen, Plus, Search, Star, Users,
  Calendar, Github, Brain, Settings as SettingsIcon,
  ArrowLeft, CheckCircle2, ChevronRight, Loader2, FileText,
  TrendingUp, ExternalLink, Grid3X3, List, X, Upload, Link2, CheckCircle
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts';

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
      };
    }>;
  };
  documents?: Document[];
  meetings?: Meeting[];
  gitAnalytics?: GitAnalytics | null;
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
  createdAt: string;
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
  const [teams, setTeams] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // New Project Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newObjectives, setNewObjectives] = useState<string[]>([]);
  const [objectiveInput, setObjectiveInput] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [newGithubRepo, setNewGithubRepo] = useState('');
  const [error, setError] = useState('');

  // Detailed Workspace States
  const [activeTab, setActiveTab] = useState<'overview' | 'milestones' | 'docs' | 'git' | 'ai' | 'settings'>('overview');

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
      setTeams(myTeams);

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
    } catch (err) {
      console.error(err);
      setError('Failed to fetch detailed project workspace.');
      navigate('/projects');
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [projectId]);

  const handleToggleStar = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStarredIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Create Project handler
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !selectedTeamId) {
      setError('Please provide project title and team.');
      return;
    }

    try {
      setActionLoading(true);
      setError('');
      const res = await api.post('/projects/create', {
        title: newTitle,
        description: newDesc,
        objectives: newObjectives,
        teamId: selectedTeamId,
        githubRepo: newGithubRepo.trim() || null
      });

      const newProj = res.data.project;
      setShowCreateModal(false);
      // Reset inputs
      setNewTitle('');
      setNewDesc('');
      setNewObjectives([]);
      setSelectedTeamId('');
      setNewGithubRepo('');

      showToast(`✅ Project "${newTitle}" created successfully!`);
      // Redirect to new project workspace
      navigate(`/projects/${newProj.id}`);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to create project.');
      showToast('Failed to create project.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const addObjective = (e: React.FormEvent) => {
    e.preventDefault();
    if (objectiveInput.trim() && !newObjectives.includes(objectiveInput.trim())) {
      setNewObjectives([...newObjectives, objectiveInput.trim()]);
    }
    setObjectiveInput('');
  };

  const removeObjective = (obj: string) => {
    setNewObjectives(newObjectives.filter(o => o !== obj));
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

  // Documents functions — supports real file upload or URL link
  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    try {
      setActionLoading(true);

      if (docUploadMode === 'file' && selectedFile) {
        // Real multipart file upload
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('projectId', selectedProject.id);
        formData.append('category', docCategory);
        formData.append('uploadedById', currentUser?.id || '');
        if (docName) formData.append('description', docName);

        await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else if (docUploadMode === 'url' && docName && docUrl) {
        // URL / cloud link registration
        await api.post('/projects/document', {
          projectId: selectedProject.id,
          name: docName,
          fileUrl: docUrl,
          category: docCategory
        });
      } else {
        showToast('Please select a file or provide a document name and URL.', 'error');
        return;
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
      showToast(err.response?.data?.error || 'Gemini is unavailable; no requirements analysis was generated.', 'error');
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
        blockages: pendingTasksList.slice(0, 2) // assume first 2 pending are blockers for simple mock
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

  // Recharts calculations
  const commitChartsData = useMemo(() => {
    if (!selectedProject?.gitAnalytics?.contributionData) {
      return [
        { name: 'Priya M.', commits: 15 },
        { name: 'Arjun V.', commits: 8 },
        { name: 'Sneha K.', commits: 5 },
        { name: 'Kavya R.', commits: 2 },
      ];
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
    <div className="space-y-8">
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
                Collaborative academic project workspaces tracked with AI risk detectors and commits engines.
              </p>
            </div>
            <button
              onClick={() => {
                if (teams.length === 0) {
                  alert('You must create a team workspace in the "Teams" tab before initiating a project.');
                  return;
                }
                setSelectedTeamId(teams[0].id);
                setShowCreateModal(true);
              }}
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
          {/* Breadcrumb / Back button */}
          <div className="flex items-center gap-2 text-xs">
            <Link to="/projects" className="text-slate-500 hover:text-white transition-colors flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Workspaces
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-700" />
            <span className="text-slate-300 font-mono truncate max-w-64">{selectedProject.title}</span>
          </div>

          {/* Project Banner */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden border border-slate-800">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-primary/5 blur-3xl -translate-y-16 translate-x-16" />
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${statusConfig[selectedProject.status]?.color} ${statusConfig[selectedProject.status]?.bg}`}>
                    {statusConfig[selectedProject.status]?.label}
                  </span>
                  {selectedProject.githubRepo && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                      <Github className="w-3 h-3 text-white" />
                      {selectedProject.githubRepo}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight">{selectedProject.title}</h2>
                <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">{selectedProject.description}</p>
              </div>

              <div className="text-center bg-slate-950/40 border border-slate-900 p-4 rounded-xl flex-shrink-0 min-w-32">
                <p className={`text-4xl font-black ${selectedProject.healthScore >= 75 ? 'text-emerald-450' : selectedProject.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {selectedProject.healthScore}%
                </p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">Project Health</p>
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 border border-slate-900 rounded-xl overflow-x-auto w-fit max-w-full" style={{ scrollbarWidth: 'none' }}>
            {[
              { id: 'overview', label: 'Overview', icon: FolderOpen },
              { id: 'milestones', label: 'Milestones', icon: Calendar },
              { id: 'docs', label: 'Documents & AI', icon: FileText },
              { id: 'git', label: 'GitHub Sync', icon: Github },
              { id: 'ai', label: 'AI Analytics', icon: Brain },
              { id: 'settings', label: 'Settings', icon: SettingsIcon },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
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
                </div>
              </div>
            )}

            {/* VIEW 2: MILESTONES */}
            {activeTab === 'milestones' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white">Project Milestones</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Define milestones and click to toggle their progress status.</p>
                  </div>
                  <button
                    onClick={() => setShowMilestoneModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Milestone
                  </button>
                </div>

                {(!selectedProject.milestones || selectedProject.milestones.length === 0) ? (
                  <div className="glass-panel rounded-2xl p-12 text-center text-slate-500">
                    <Calendar className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                    <span>No milestones scheduled yet.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedProject.milestones.map((m) => {
                      const isCompleted = m.status === 'COMPLETED';
                      const isInProgress = m.status === 'IN_PROGRESS';

                      return (
                        <div
                          key={m.id}
                          onClick={() => handleUpdateMilestoneStatus(m.id, m.status)}
                          className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group ${
                            isCompleted
                              ? 'bg-slate-950/20 border-slate-900 opacity-60 hover:opacity-90'
                              : isInProgress
                              ? 'glass-panel border-primary/40'
                              : 'glass-card border-slate-900 hover:border-slate-800'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div className={`p-2.5 rounded-xl flex-shrink-0 mt-0.5 ${isCompleted ? 'bg-slate-900' : 'bg-primary/10'}`}>
                              <Calendar className={`w-4 h-4 ${isCompleted ? 'text-slate-500' : 'text-primary'}`} />
                            </div>
                            <div>
                              <h4 className={`font-bold text-sm ${isCompleted ? 'text-slate-500 line-through' : 'text-white'}`}>{m.title}</h4>
                              <p className="text-xs text-slate-450 mt-1 leading-relaxed">{m.description || 'No description provided.'}</p>
                              <p className="text-[10px] text-slate-600 mt-2 font-mono">DUE DATE: {new Date(m.dueDate).toLocaleDateString()}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 justify-end">
                            <span className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold uppercase tracking-wider ${
                              isCompleted
                                ? 'bg-slate-900 border-slate-800 text-slate-500'
                                : isInProgress
                                ? 'bg-primary/10 border-primary/20 text-primary'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}>
                              {m.status.replace('_', ' ')}
                            </span>
                            <span className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors hidden md:inline">
                              Click to cycle status
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                          onClick={() => setAnalyzingDocText(`Proposal document metadata: Name: ${d.name}, Category: ${d.category}. Content summary goes here...`)}
                          className="p-4 bg-slate-900/30 border border-slate-850 hover:border-slate-800 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-slate-900/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-xl text-primary">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white">{d.name}</p>
                              <p className="text-[10px] text-slate-550 capitalize mt-0.5">{d.category} · {new Date(d.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
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
                            { author: 'Arjun Verma', hash: 'b12c9f0', msg: 'fix: resolve Kanban column drag alignment issues', time: '4h ago' },
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
              </div>
            )}

            {/* VIEW 5: AI ANALYTICS */}
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
          </div>
        </div>
      )}

      {/* CREATE PROJECT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-lg border-slate-700 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Create Project Workspace</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Team Allocation</label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm text-white transition-all cursor-pointer"
                  required
                >
                  <option value="" disabled>Select Roster Team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} className="bg-slate-950">{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Project Title</label>
                <input
                  type="text"
                  placeholder="e.g. AI-Powered Course Helper"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Description</label>
                <textarea
                  placeholder="Summarize the core targets of this academic project module..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-650 focus:border-primary/50 outline-none transition-all resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">GitHub Repo Path (Optional)</label>
                <input
                  type="text"
                  placeholder="owner/repo (e.g. facebook/react)"
                  value={newGithubRepo}
                  onChange={(e) => setNewGithubRepo(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-650 focus:border-primary/50 outline-none transition-all font-mono"
                />
              </div>

              {/* Objectives lists tags */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Project Core Objectives</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Complete responsive UI components list"
                    value={objectiveInput}
                    onChange={(e) => setObjectiveInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addObjective(e)}
                    className="flex-1 px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-650 focus:border-primary/50 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={addObjective}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer border border-slate-700"
                  >
                    Add
                  </button>
                </div>

                {newObjectives.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 p-2 bg-slate-950/30 border border-slate-900 rounded-xl">
                    {newObjectives.map((obj, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-850 border border-slate-800 text-slate-250 text-xs rounded-lg">
                        {obj}
                        <button type="button" onClick={() => removeObjective(obj)} className="text-slate-400 hover:text-white font-bold">✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 border border-slate-750 text-slate-400 text-xs font-semibold rounded-xl hover:bg-slate-850 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md"
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
    </div>
  );
}
