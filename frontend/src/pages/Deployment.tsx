import { useState, useEffect } from 'react';
import { Rocket, Loader2, FolderOpen, Server, ExternalLink, Settings2 } from 'lucide-react';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';
import DeploymentIntelligence from '../components/DeploymentIntelligence';
import DeployProviderSettings from '../components/DeployProviderSettings';

interface ProjectSummary {
  id: string;
  title: string;
}

export default function Deployment() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Auth scoping (isolates cached project selection per account)
  const currentUserId = useAuthStore((s) => s.user?.id ?? '');
  const accessToken = useAuthStore((s) => s.accessToken);

  // ── Load projects on mount / account switch ──────────────────────────────
  useEffect(() => {
    // On account switch or logout, clear all cached Deployment Intelligence
    // state so the previous account's deploy data is never visible to the
    // next account (mirrors the GitHub page isolation fix).
    setProjects([]);
    setSelectedProjectId('');
    setError(null);

    if (!accessToken) {
      setLoadingProjects(false);
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
        const lastPid = localStorage.getItem(`pcai-deploy-project-${currentUserId}`);
        if (lastPid && allProjects.find(p => p.id === lastPid)) {
          setSelectedProjectId(lastPid);
        } else if (allProjects.length > 0) {
          setSelectedProjectId(allProjects[0].id);
        }
      } catch (e) {
        console.error('Failed to load projects for Deployment page', e);
        setError('Failed to load your projects.');
      } finally {
        setLoadingProjects(false);
      }
    };
    loadProjects();
  }, [accessToken, currentUserId]);

  // ── Persist last-used project per account ─────────────────────────────────
  useEffect(() => {
    if (selectedProjectId && currentUserId) {
      localStorage.setItem(`pcai-deploy-project-${currentUserId}`, selectedProjectId);
    }
  }, [selectedProjectId, currentUserId]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5 font-medium">
            <Rocket className="w-4 h-4 text-primary" /> Deployment Intelligence Hub
          </p>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Vercel &amp; Render Deployments</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live deploy status · Real Vercel + Render APIs · Build durations · Runtime logs · Read-only
          </p>
        </div>
        <a
          href="https://vercel.com/dashboard"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 glass-card text-foreground hover:bg-secondary text-sm rounded-xl transition-all"
        >
          <Server className="w-4 h-4 text-primary" /> Provider Dashboards <ExternalLink className="w-3.5 h-3.5 text-primary" />
        </a>
      </div>

      {error && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 text-sm font-semibold flex items-center gap-3">
          <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />
          <span>{error}</span>
        </div>
      )}

      {/* Project Selector Bar */}
      <div className="glass-panel rounded-2xl p-5">
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
          {selectedProjectId && (
            <button
              onClick={() => setSettingsOpen((open) => !open)}
              className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                settingsOpen
                  ? 'bg-primary/10 text-primary border-primary/40'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" /> Provider Settings
            </button>
          )}
        </div>
      </div>

      {/* Per-project deploy provider settings (Vercel project id / Render service id) */}
      {selectedProjectId && settingsOpen && <DeployProviderSettings projectId={selectedProjectId} />}

      {/* Deployment Intelligence panel */}
      {selectedProjectId ? (
        <DeploymentIntelligence projectId={selectedProjectId} />
      ) : (
        !loadingProjects && (
          <div className="glass-panel rounded-2xl p-16 text-center space-y-4">
            <Rocket className="w-12 h-12 text-slate-700 mx-auto" />
            <h3 className="text-lg font-bold text-foreground">Select a Project</h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
              Pick one of your projects above to see its live Vercel deployment status, Render deploy history, and backend runtime logs.
            </p>
          </div>
        )
      )}
    </div>
  );
}