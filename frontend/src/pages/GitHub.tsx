import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  GitBranch, Github, GitCommit, Users, RefreshCw, ExternalLink,
  GitPullRequest, HelpCircle, ArrowUpRight, Sparkles, Brain,
  Star, GitFork, AlertCircle, Loader2, Plus, X,
  Link2, FolderOpen, CheckCircle2, Trash2, FileDown, Activity,
  BarChart3
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';
import ActivityFeed from '../components/ActivityFeed';

interface ConnectedRepo {
  id: string;
  fullPath: string;
  owner: string;
  repoName: string;
  connectedBy?: { name: string };
  createdAt: string;
}

interface ProjectSummary {
  id: string;
  title: string;
  repositories?: ConnectedRepo[];
}

export default function GitHubIntegration() {
  // ── Project scoping state ─────────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [connectedRepos, setConnectedRepos] = useState<ConnectedRepo[]>([]);
  const [selectedRepoPath, setSelectedRepoPath] = useState<string>('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingRepos, setLoadingRepos] = useState(false);

  // Connect repo modal
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [newRepoInput, setNewRepoInput] = useState('');
  const [connectingRepo, setConnectingRepo] = useState(false);
  const [connectError, setConnectError] = useState('');

  // ── Intelligence state ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'ai' | 'commits' | 'branches' | 'pulls' | 'contributors' | 'chart' | 'activity'>('ai');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);

  // ── Platform users for contributor matching ───────────────────────────────
  const [platformUsers, setPlatformUsers] = useState<Array<{ id: string; name: string; email: string; avatarUrl?: string; githubUsername?: string }>>([]);
  const [loadingPlatformUsers, setLoadingPlatformUsers] = useState(false);

  // ── Auth scoping (used to isolate per-account state and localStorage keys) ──
  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? '';
  const accessToken = useAuthStore((s) => s.accessToken);

  // ── Load projects on mount / account switch ──────────────────────────────
  useEffect(() => {
    // On account switch or logout, clear ALL cached GitHub Intelligence state
    // so the previous account's commits/branches/PRs/contributors/chart/activity
    // are never visible to the next account (mirrors the team chat isolation fix).
    setProjects([]);
    setSelectedProjectId('');
    setConnectedRepos([]);
    setSelectedRepoPath('');
    setPlatformUsers([]);
    setData(null);
    setError(null);
    setLastSync(null);
    setSyncResult(null);
    setShowGuide(false);
    setShowConnectModal(false);
    setNewRepoInput('');
    setConnectError('');
    setConnectingRepo(false);
    setActiveTab('ai');

    // Migrate away from the legacy account-agnostic key (if present).
    localStorage.removeItem('pcai-github-project');

    if (!accessToken) {

      setLoadingProjects(false);
      setLoadingRepos(false);
      return;
    }

    const loadProjects = async () => {
      setLoadingProjects(true);
      try {
        const res = await api.get('/teams/my-teams');
        const teams = res.data.teams || [];
        const allProjects: ProjectSummary[] = [];
        teams.forEach((t: any) => {
          (t.projects || []).forEach((p: any) => {
            allProjects.push({ id: p.id, title: p.title });
          });
        });
        setProjects(allProjects);

        // Restore last-used project from localStorage (scoped to this account)
        const lastPid = localStorage.getItem(`pcai-github-project-${currentUserId}`);
        if (lastPid && allProjects.find(p => p.id === lastPid)) {
          setSelectedProjectId(lastPid);
        } else if (allProjects.length > 0) {
          setSelectedProjectId(allProjects[0].id);
        }
      } catch (e) {
        console.error('Failed to load projects for GitHub page', e);
      } finally {
        setLoadingProjects(false);
      }
    };
    loadProjects();
  }, [accessToken, currentUserId]);

  // ── Load connected repos whenever project changes ─────────────────────────
  useEffect(() => {
    if (!selectedProjectId) return;
    const loadRepos = async () => {
      setLoadingRepos(true);
      setData(null);
      setError(null);
      try {
        const res = await api.get(`/projects/${selectedProjectId}/repositories`);
        const repos: ConnectedRepo[] = res.data.repositories || [];
        setConnectedRepos(repos);

        // Pick last-used repo for this project or fall back to first
        const lastRepo = localStorage.getItem(`pcai-github-repo-${currentUserId}-${selectedProjectId}`);
        if (lastRepo && repos.find(r => r.fullPath === lastRepo)) {
          setSelectedRepoPath(lastRepo);
        } else if (repos.length > 0) {
          setSelectedRepoPath(repos[0].fullPath);
        } else {
          setSelectedRepoPath('');
        }
      } catch (e) {
        console.error('Failed to load repos', e);
        setConnectedRepos([]);
        setSelectedRepoPath('');
      } finally {
        setLoadingRepos(false);
      }
    };
    loadRepos();
    localStorage.setItem(`pcai-github-project-${currentUserId}`, selectedProjectId);
  }, [selectedProjectId, currentUserId]);

  // ── Load team members to build githubUsername map ─────────────────────────
  const loadTeamMembers = useCallback(async () => {
    setLoadingPlatformUsers(true);
    try {
      const teamsRes = await api.get('/teams/my-teams');
      const teams = teamsRes.data.teams || [];
      const users: typeof platformUsers = [];
      const seen = new Set<string>();
      teams.forEach((t: any) => {
        (t.members || []).forEach((m: any) => {
          if (m.user && !seen.has(m.user.id)) {
            seen.add(m.user.id);
            users.push({
              id: m.user.id,
              name: m.user.name,
              email: m.user.email || '',
              avatarUrl: m.user.avatarUrl,
              githubUsername: m.user.githubUsername || undefined,
            });
          }
        });
      });
      setPlatformUsers(users);
      return users;
    } catch (e) {
      console.error('Failed to load team members for contributor matching', e);
      return [];
    } finally {
      setLoadingPlatformUsers(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    loadTeamMembers();
  }, [selectedProjectId]);

  // ── Fetch intelligence data for a given repo path ─────────────────────────
  const fetchRepoData = useCallback(async (path: string) => {
    if (!path) return;
    setIsSyncing(true);
    setError(null);
    setData(null);
    // Always re-fetch team members so githubUsername is never stale
    await loadTeamMembers();
    try {
      const res = await api.get('/github/intelligence', { params: { path, projectId: selectedProjectId } });
      setData(res.data);
      if (selectedProjectId) {
        localStorage.setItem(`pcai-github-repo-${currentUserId}-${selectedProjectId}`, path);
      }
    } catch (err: any) {
      console.error('GitHub API Fetch Error:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        return;
      }
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to fetch repository data.');
    } finally {
      setIsSyncing(false);
      setIsLoading(false);
    }
  }, [selectedProjectId, loadTeamMembers, currentUserId]);

  // Auto-fetch when selectedRepoPath changes
  useEffect(() => {
    if (selectedRepoPath) {
      setIsLoading(true);
      fetchRepoData(selectedRepoPath);
    }
  }, [selectedRepoPath]);

  // ── Sync GitHub data for selected project ─────────────────────────────────
  const handleSyncGitHub = async () => {
    if (!selectedProjectId) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.post(`/github/sync/${selectedProjectId}`);
      setSyncResult(res.data.result);
      setLastSync(new Date().toLocaleString());
      if (selectedRepoPath) {
        fetchRepoData(selectedRepoPath);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'GitHub sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  // ── Download PDF report ───────────────────────────────────────────────────
  const handleDownloadPdf = async () => {
    if (!selectedProjectId) return;
    try {
      const res = await api.get(`/github/report/${selectedProjectId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `github-report-${selectedProjectId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to download report.');
    }
  };

  // ── Connect a repo to the project ─────────────────────────────────────────
  const handleConnectRepo = async () => {
    let trimmed = newRepoInput.trim();
    // Clean full URL, trailing slashes, .git suffix
    trimmed = trimmed.replace(/^https?:\/\/github\.com\//i, '');
    trimmed = trimmed.replace(/\/$/, '');
    trimmed = trimmed.replace(/\.git$/i, '');
    const parts = trimmed.split('/').filter(Boolean);
    if (parts.length >= 2) {
      trimmed = `${parts[0]}/${parts[1]}`;
    }

    if (!trimmed || !trimmed.includes('/')) {
      setConnectError('Please enter a valid owner/repository path or GitHub URL (e.g. https://github.com/facebook/react or facebook/react)');
      return;
    }
    setConnectingRepo(true);
    setConnectError('');
    try {
      const res = await api.post(`/projects/${selectedProjectId}/repositories`, { fullPath: trimmed });
      const newRepo: ConnectedRepo = res.data.repository;
      setConnectedRepos(prev => [...prev, newRepo]);
      setSelectedRepoPath(newRepo.fullPath);
      setNewRepoInput('');
      setShowConnectModal(false);
    } catch (err: any) {
      setConnectError(err.response?.data?.error || 'Failed to connect repository.');
    } finally {
      setConnectingRepo(false);
    }
  };

  // ── Delete a connected repo ────────────────────────────────────────────────
  const handleDeleteRepo = async (repoId: string, repoPath: string) => {
    if (!confirm(`Disconnect "${repoPath}" from this project?`)) return;
    try {
      await api.delete(`/projects/${selectedProjectId}/repositories/${repoId}`);
      const updated = connectedRepos.filter(r => r.id !== repoId);
      setConnectedRepos(updated);
      if (selectedRepoPath === repoPath) {
        setSelectedRepoPath(updated[0]?.fullPath || '');
        if (!updated.length) setData(null);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to disconnect repository.');
    }
  };

  // ── Contributor matching helper ───────────────────────────────────────────
  // Match GitHub contributor login against platform user githubUsername (case-insensitive)
  const matchContributor = (githubLogin: string) => {
    if (!githubLogin) return null;
    const login = githubLogin.toLowerCase().trim();
    return (
      platformUsers.find(
        (u) =>
          (u.githubUsername || '').toLowerCase().trim() === login ||
          (u.email || '').split('@')[0].toLowerCase() === login,
      ) || null
    );
  };

  // Refresh: re-fetch team members + contributors for the selected repo
  const handleRefreshContributors = async () => {
    await loadTeamMembers();
    if (selectedRepoPath) fetchRepoData(selectedRepoPath);
  };

  const repoInfo = data?.repoInfo;
  const commits = data?.commits || [];
  const branches = data?.branches || [];
  const pullRequests = data?.pullRequests || [];
  const contributors = data?.contributors || [];
  const aiInsights = data?.aiInsights || null;
  const totalCommitsCount = data?.stats?.totalCommits ?? commits.length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Friendly missing githubUsername banner */}
      {(!currentUser || !(currentUser as any).githubUsername) && (
        <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 text-sm font-semibold">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" />
            <span>Add your GitHub username in Profile to use GitHub Intelligence.</span>
          </div>
          <Link to="/profile" className="px-3.5 py-1.5 bg-amber-500 text-black font-bold text-xs rounded-xl hover:bg-amber-400 transition-all flex items-center gap-1">
            Go to Profile →
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5 font-medium">
            <Github className="w-4 h-4 text-primary" /> GitHub Intelligence Hub
          </p>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">GitHub &amp; AI Codebase Intelligence</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Project-scoped repo analysis · Real GitHub REST API · Google Gemini AI insights · Contributor identity matching
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-2 px-3.5 py-2.5 glass-card text-foreground hover:bg-secondary text-sm rounded-xl transition-all"
          >
            <HelpCircle className="w-4 h-4 text-primary" /> {showGuide ? 'Hide Guide' : 'How it works'}
          </button>
          {selectedRepoPath && (
            <a
              href={`https://github.com/${selectedRepoPath}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-xl transition-all hover:opacity-90 shadow-md"
            >
              <ExternalLink className="w-4 h-4" /> Open on GitHub <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Guide Banner */}
      {showGuide && (
        <div className="glass-panel p-5 rounded-2xl border-primary/30 bg-primary/5 space-y-3">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" /> GitHub REST API &amp; Gemini AI Integration
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3.5 glass-card rounded-xl">
              <span className="font-bold text-primary flex items-center gap-1.5 mb-1">
                <FolderOpen className="w-4 h-4" /> Project-Scoped Repos
              </span>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Connect one or more GitHub repositories to each project. Switch projects and repos from the selector above.
              </p>
            </div>
            <div className="p-3.5 glass-card rounded-xl">
              <span className="font-bold text-purple-400 flex items-center gap-1.5 mb-1">
                <Brain className="w-4 h-4" /> Google Gemini AI Analysis
              </span>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Repository statistics fed to Gemini for health scores, bottleneck detection, and structural recommendations.
              </p>
            </div>
            <div className="p-3.5 glass-card rounded-xl">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1">
                <Users className="w-4 h-4" /> Contributor Identity Matching
              </span>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Set your GitHub username in Profile settings. Contributors are matched to platform users automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Project + Repo Selector Bar */}
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        {/* Project selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
            <FolderOpen className="w-4 h-4 text-primary" /> Project:
          </div>
          {loadingProjects ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No projects found — join or create a project first.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg border transition-all ${
                    selectedProjectId === p.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  {p.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Repo selector */}
        {selectedProjectId && (
          <div className="flex items-center gap-3 flex-wrap border-t border-border pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground flex-shrink-0">
              <Github className="w-4 h-4 text-primary" /> Repository:
            </div>
            {loadingRepos ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            ) : connectedRepos.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No repositories connected yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {connectedRepos.map(r => (
                  <div key={r.id} className={`flex items-center gap-1.5 rounded-lg border transition-all ${
                    selectedRepoPath === r.fullPath
                      ? 'bg-primary/10 border-primary/40'
                      : 'border-border'
                  }`}>
                    <button
                      onClick={() => setSelectedRepoPath(r.fullPath)}
                      className={`px-3 py-1.5 text-sm font-mono font-semibold transition-all ${
                        selectedRepoPath === r.fullPath ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {r.fullPath}
                    </button>
                    <button
                      onClick={() => handleDeleteRepo(r.id, r.fullPath)}
                      className="pr-2 text-muted-foreground hover:text-destructive transition-colors"
                      title="Disconnect this repo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => { setShowConnectModal(true); setConnectError(''); setNewRepoInput(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-dashed border-primary/40 text-primary hover:bg-primary/10 transition-all"
            >
              <Plus className="w-4 h-4" /> Connect repo
            </button>

             {selectedRepoPath && (
               <button
                 onClick={() => fetchRepoData(selectedRepoPath)}
                 disabled={isSyncing}
                 className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-bold text-sm rounded-xl transition-all hover:opacity-90 shadow-sm disabled:opacity-50"
               >
                 <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                 {isSyncing ? 'Fetching...' : 'Sync & Run AI'}
               </button>
             )}

             {selectedProjectId && (
               <button
                 onClick={handleSyncGitHub}
                 disabled={isSyncing}
                 className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all hover:opacity-90 shadow-sm disabled:opacity-50"
               >
                 <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                 {isSyncing ? 'Syncing...' : 'Sync Now'}
               </button>
             )}

             {lastSync && (
               <span className="text-xs text-muted-foreground flex items-center gap-1">
                 <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                 Last synced: {lastSync}
               </span>
             )}

             {syncResult && (
               <span className="text-xs text-muted-foreground">
                 {syncResult.commitsInserted} commits, {syncResult.tasksVerified} tasks verified
               </span>
             )}

             {selectedProjectId && selectedRepoPath && (
               <button
                 onClick={handleDownloadPdf}
                 className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white font-bold text-sm rounded-xl transition-all hover:opacity-90 shadow-sm"
               >
                 <FileDown className="w-4 h-4" /> PDF Report
               </button>
             )}
          </div>
        )}
      </div>

      {/* Connect Repo Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowConnectModal(false)}>
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" /> Connect GitHub Repository
              </h3>
              <button onClick={() => setShowConnectModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the repository path in <code className="text-primary font-mono">owner/repository</code> format.
              Any project member can connect repositories.
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={newRepoInput}
                onChange={e => setNewRepoInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleConnectRepo(); }}
                placeholder="e.g. facebook/react or vercel/next.js"
                className="glass-input font-mono text-sm w-full"
                autoFocus
              />
              {connectError && (
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {connectError}
                </p>
              )}
              <div className="flex gap-3 justify-end pt-1">
                <button
                  onClick={() => setShowConnectModal(false)}
                  className="px-4 py-2 border border-border text-muted-foreground text-sm rounded-xl hover:bg-secondary transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnectRepo}
                  disabled={connectingRepo || !newRepoInput.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {connectingRepo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {connectingRepo ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state — no repo connected */}
      {!selectedRepoPath && !loadingRepos && selectedProjectId && (
        <div className="glass-panel rounded-2xl p-16 text-center space-y-4 max-w-2xl mx-auto">
          <Github className="w-12 h-12 text-muted-foreground mx-auto opacity-40" />
          <h2 className="text-lg font-bold text-foreground">No repositories connected</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Connect a GitHub repository to this project to start tracking commits, PRs, branch activity, and AI-generated code insights.
          </p>
          <button
            onClick={() => { setShowConnectModal(true); setConnectError(''); setNewRepoInput(''); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-bold text-sm rounded-xl hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" /> Connect a Repository
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="font-bold underline">Dismiss</button>
        </div>
      )}

      {/* Main intelligence content (only when a repo is selected) */}
      {selectedRepoPath && data && <>
        {/* Repo info badges */}
        <div className="flex flex-wrap gap-4 items-center bg-secondary/30 border border-border p-4 rounded-2xl text-xs">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <Github className="w-4 h-4 text-primary" /> {repoInfo?.fullName || selectedRepoPath}
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Star className="w-3.5 h-3.5 text-amber-400" /> {repoInfo?.stars?.toLocaleString() || 0} Stars
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <GitFork className="w-3.5 h-3.5 text-blue-400" /> {repoInfo?.forks?.toLocaleString() || 0} Forks
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> {repoInfo?.openIssues || 0} Open Issues
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground ml-auto">
            Language: <span className="font-bold text-primary ml-1">{repoInfo?.language ?? 'Unknown'}</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Recent Commits', value: totalCommitsCount, icon: GitCommit, color: 'text-blue-500' },
            { label: 'Tracked Branches', value: branches.length, icon: GitBranch, color: 'text-emerald-500' },
            { label: 'Pull Requests', value: pullRequests.length, icon: GitPullRequest, color: 'text-purple-500' },
            { label: 'Contributors', value: contributors.length, icon: Users, color: 'text-amber-500' },
          ].map((card) => (
            <div key={card.label} className="glass-card rounded-2xl p-5 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <span className="text-xs text-muted-foreground font-semibold">{card.label}</span>
              </div>
              <p className={`text-3xl font-extrabold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1.5 glass-panel rounded-xl w-fit flex-wrap">
          {[
            { id: 'ai', label: 'Gemini AI Intelligence', icon: Sparkles },
            { id: 'commits', label: 'Recent Commits', icon: GitCommit },
            { id: 'branches', label: 'Branches', icon: GitBranch },
            { id: 'pulls', label: 'Pull Requests', icon: GitPullRequest },
            { id: 'contributors', label: 'Contributors', icon: Users },
            { id: 'chart', label: 'Contribution Chart', icon: BarChart3 },
            { id: 'activity', label: 'Activity Feed', icon: Activity },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading spinner (re-sync) */}
        {isSyncing && (
          <div className="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-bold text-foreground">Fetching Repository Metrics &amp; Gemini AI Insights...</p>
          </div>
        )}

        {/* Tab 1: Gemini AI */}
        {!isSyncing && activeTab === 'ai' && aiInsights && (
          <div className="glass-panel rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" /> Gemini Codebase AI Insights
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Generated for {selectedRepoPath}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Health Score</p>
                <p className={`text-2xl font-extrabold ${
                  (aiInsights.healthScore || 0) >= 75 ? 'text-emerald-400' :
                  (aiInsights.healthScore || 0) >= 50 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {aiInsights.healthScore ?? 'N/A'}<span className="text-sm font-semibold text-muted-foreground">/100</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(aiInsights.velocitySummary || aiInsights.summary) && (
                <div className="glass-card rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> Velocity &amp; Architecture Summary
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {aiInsights.velocitySummary || aiInsights.summary}
                  </p>
                </div>
              )}

              {aiInsights.contributorDistributionSummary && (
                <div className="glass-card rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                    <Users className="w-4 h-4" /> Contributor Dynamics
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {aiInsights.contributorDistributionSummary}
                  </p>
                </div>
              )}

              {((aiInsights.codebaseStrengths && aiInsights.codebaseStrengths.length > 0) || (aiInsights.strengths && aiInsights.strengths.length > 0)) && (
                <div className="glass-card rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Codebase Strengths
                  </h3>
                  <ul className="space-y-1.5">
                    {(aiInsights.codebaseStrengths || aiInsights.strengths || []).map((s: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-emerald-400 mt-0.5">✓</span> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {((aiInsights.potentialBottlenecks && aiInsights.potentialBottlenecks.length > 0) || (aiInsights.risks && aiInsights.risks.length > 0)) && (
                <div className="glass-card rounded-xl p-5 space-y-2">
                  <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Identified Bottlenecks &amp; Risks
                  </h3>
                  <ul className="space-y-1.5">
                    {(aiInsights.potentialBottlenecks || aiInsights.risks || []).map((r: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-rose-400 mt-0.5">•</span> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {((aiInsights.actionableRecommendations && aiInsights.actionableRecommendations.length > 0) || (aiInsights.recommendations && aiInsights.recommendations.length > 0)) && (
                <div className="glass-card rounded-xl p-5 space-y-2 md:col-span-2">
                  <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Actionable Engineering Recommendations
                  </h3>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(aiInsights.actionableRecommendations || aiInsights.recommendations || []).map((rec: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                        <span className="text-primary font-bold">→</span> {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Commits */}
        {!isSyncing && activeTab === 'commits' && (
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <GitCommit className="w-5 h-5 text-blue-500" /> Recent Commits ({commits.length})
            </h2>
            <div className="space-y-3">
              {commits.map((c: any, i: number) => (
                <div key={i} className="flex items-start gap-4 p-4 glass-card rounded-xl">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500 flex-shrink-0">
                    <GitCommit className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{c.message}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{c.author}</span>
                      <span>·</span>
                      <span>{c.date}</span>
                      {c.sha && <code className="px-1.5 py-0.5 bg-secondary rounded font-mono">{c.sha.slice(0, 7)}</code>}
                    </div>
                  </div>
                </div>
              ))}
              {commits.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No commits found.</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Branches */}
        {!isSyncing && activeTab === 'branches' && (
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-emerald-500" /> Branches ({branches.length})
            </h2>
            <div className="space-y-3">
              {branches.map((b: any, i: number) => (
                <div key={i} className="flex items-center gap-4 p-4 glass-card rounded-xl">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{b.name}</p>
                    {b.lastCommit && (
                      <p className="text-xs text-muted-foreground mt-0.5">Last commit: {b.lastCommit}</p>
                    )}
                  </div>
                  {b.isDefault && (
                    <span className="px-2.5 py-1 text-xs font-bold bg-primary/10 border border-primary/30 text-primary rounded-lg">default</span>
                  )}
                </div>
              ))}
              {branches.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No branches found.</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Pull Requests */}
        {!isSyncing && activeTab === 'pulls' && (
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <GitPullRequest className="w-5 h-5 text-purple-500" /> Pull Requests ({pullRequests.length})
            </h2>
            <div className="space-y-3">
              {pullRequests.map((pr: any) => (
                <div key={pr.id} className="flex items-center gap-4 p-4 glass-card rounded-xl">
                  <div className={`p-2 rounded-lg ${pr.status === 'OPEN' ? 'bg-purple-500/10 text-purple-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    <GitPullRequest className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{pr.title} <span className="text-muted-foreground font-normal">{pr.id}</span></p>
                    <p className="text-xs text-muted-foreground">Opened by {pr.author} · {pr.date}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <span className="text-muted-foreground">{pr.reviewsUnavailable ? 'Reviews unavailable' : `${pr.reviews} review(s)`}</span>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                      pr.status === 'OPEN' ? 'bg-purple-500/10 border border-purple-500/30 text-purple-500' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-500'
                    }`}>
                      {pr.status}
                    </span>
                  </div>
                </div>
              ))}
              {pullRequests.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No pull requests found.</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 5: Contributors — with platform user matching */}
        {!isSyncing && activeTab === 'contributors' && (
          <div className="glass-panel rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" /> Team Contributor Distribution ({contributors.length})
              </h2>
              <div className="flex items-center gap-3">
                {platformUsers.some(u => u.githubUsername) && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Identity matching active
                  </span>
                )}
                <button
                  onClick={handleRefreshContributors}
                  disabled={loadingPlatformUsers || isSyncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPlatformUsers ? 'animate-spin' : ''}`} />
                  Refresh contributors
                </button>
              </div>
            </div>

            {!loadingPlatformUsers && !platformUsers.some(u => u.githubUsername) && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  No team members have set their GitHub username yet. Go to <strong>Settings → Profile → GitHub Username</strong> to enable contributor identity matching.
                </span>
              </div>
            )}

            <div className="space-y-3">
              {contributors.map((c: any) => {
                const matched = matchContributor(c.name || c.username || c.login);
                return (
                  <div key={c.name} className="flex items-center gap-4 p-4 glass-card rounded-xl">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden shadow-sm">
                      {matched?.avatarUrl ? (
                        <img src={matched.avatarUrl} alt={matched.name} className="w-full h-full object-cover" />
                      ) : c.avatarUrl ? (
                        <img src={c.avatarUrl} alt={c.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full ${c.color || 'bg-blue-500'} flex items-center justify-center text-sm font-bold text-white`}>
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Name + GitHub handle */}
                    <div className="flex-1">
                      {matched ? (
                        <div>
                          <p className="text-sm font-bold text-foreground">{matched.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <Github className="w-3 h-3" />
                            <span className="font-mono">{c.name}</span>
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold text-[10px]">matched</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-bold text-foreground font-mono">{c.name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Github className="w-3 h-3" /> GitHub contributor
                            <span className="px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground font-semibold text-[10px]">unlinked</span>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Commit count */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-amber-500">{c.commits}</p>
                      <p className="text-xs text-muted-foreground">commits</p>
                    </div>
                  </div>
                );
              })}
              {contributors.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No contributor data available.</p>
              )}
            </div>
          </div>
        )}

        {/* Tab 6: Contribution Chart */}
        {!isSyncing && activeTab === 'chart' && (
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" /> Contribution Breakdown
            </h2>
            {contributors.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={contributors.map((c: any) => ({ name: c.name || c.login || c.username, commits: c.commits }))}>
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Bar dataKey="commits" radius={[4, 4, 0, 0]}>
                    {contributors.map((_c: any, index: number) => (
                      <Cell key={index} fill={['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'][index % 6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No contributor data available for chart.</p>
            )}
          </div>
        )}

        {/* Tab 7: Activity Feed */}
        {!isSyncing && activeTab === 'activity' && selectedProjectId && (
          <div className="glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Live Activity Feed
            </h2>
            <ActivityFeed key={`${currentUserId}:${selectedProjectId}`} projectId={selectedProjectId} limit={30} />
          </div>
        )}
      </>}

      {/* Full-page loading (initial fetch) */}
      {isLoading && !data && (
        <div className="glass-panel p-16 rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm font-bold text-foreground">Fetching Repository Metrics &amp; Gemini AI Insights...</p>
          <p className="text-xs text-muted-foreground">{selectedRepoPath}</p>
        </div>
      )}
    </div>
  );
}
