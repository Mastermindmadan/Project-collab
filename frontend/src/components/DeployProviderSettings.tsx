import { useState, useEffect } from 'react';
import { Cloud, Loader2, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import api from '../utils/api';

interface DeployProviderSettingsProps {
  projectId: string;
}

/**
 * Per-project Deployment Intelligence configuration: the Vercel project id and
 * Render service id this project's deployments live under. Saved through
 * PATCH /api/projects/:projectId/deploy-settings (any team member may update
 * these — the account-level API tokens stay in the backend env).
 */
export default function DeployProviderSettings({ projectId }: DeployProviderSettingsProps) {
  const [vercelProjectId, setVercelProjectId] = useState('');
  const [renderServiceId, setRenderServiceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the currently stored ids whenever the project changes.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setSaved(false);
      try {
        const res = await api.get(`/projects/${projectId}/summary`);
        if (cancelled) return;
        setVercelProjectId(res.data?.project?.vercelProjectId || '');
        setRenderServiceId(res.data?.project?.renderServiceId || '');
      } catch {
        if (!cancelled) setError('Could not load the current deployment settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch(`/projects/${projectId}/deploy-settings`, {
        vercelProjectId: vercelProjectId.trim() || null,
        renderServiceId: renderServiceId.trim() || null,
      });
      setSaved(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save deployment settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Cloud className="w-4 h-4 text-primary" /> Deployment Provider Settings
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Per-project Vercel/Render targets for this project's Deployment Intelligence panel. Any team member can edit these.
          </p>
        </div>
        {saved && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-3 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5">
              Vercel Project ID <span className="text-slate-600 font-normal">(prj_…, Vercel → Settings → General)</span>
            </label>
            <input
              type="text"
              placeholder="prj_xxxxxxxxxxxx"
              value={vercelProjectId}
              onChange={(e) => { setVercelProjectId(e.target.value); setSaved(false); }}
              className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5">
              Render Service ID <span className="text-slate-600 font-normal">(srv-…, Render → Settings)</span>
            </label>
            <input
              type="text"
              placeholder="srv-xxxxxxxxxxxx"
              value={renderServiceId}
              onChange={(e) => { setRenderServiceId(e.target.value); setSaved(false); }}
              className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all font-mono"
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
        </p>
      )}

      {!loading && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Settings
          </button>
          <p className="text-[10px] text-slate-600">
            Leaving a field empty disables that provider for this project. API tokens stay server-side.
          </p>
        </div>
      )}
    </div>
  );
}