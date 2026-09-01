import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Rocket, RefreshCw, Loader2, ExternalLink, GitBranch, GitCommit, Clock,
  Activity, Server, TerminalSquare, ChevronDown, ChevronUp, AlertTriangle
} from 'lucide-react';
import api from '../utils/api';

interface DeploymentIntelligenceProps {
  projectId: string;
}

type DeployStatus =
  | 'success' | 'building' | 'queued' | 'failed' | 'canceled' | 'down' | 'unknown';

// ─── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso).getTime();
  if (isNaN(d)) return 'Unknown';
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtDuration(ms: number | null): string {
  if (ms === null || isNaN(ms) || ms < 0) return 'Unavailable';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const STATUS_META: Record<DeployStatus, { label: string; cls: string }> = {
  success: { label: 'Success', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  building: { label: 'Building', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  queued: { label: 'Queued', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  failed: { label: 'Failed', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  canceled: { label: 'Canceled', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  down: { label: 'Down', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  unknown: { label: 'Unknown', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

function StatusBadge({ status }: { status: DeployStatus | null }) {
  const meta = STATUS_META[status ?? 'unknown'] || STATUS_META.unknown;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-bold uppercase ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function LiveStatusDot({ status }: { status: DeployStatus | null }) {
  if (status === 'building') return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Building" />;
  const up = status === 'success';
  return <span className={`w-2 h-2 rounded-full ${up ? 'bg-emerald-400' : 'bg-red-400'}`} />;
}

// Unavailable label helper — mirrors the GitHub Intelligence `*Unavailable`
// flags: show "(Unavailable)" instead of inventing data.
function Unavail({ flag, label = 'Unavailable' }: { flag?: boolean; label?: string }) {
  if (!flag) return null;
  return <span className="text-[10px] text-slate-500 italic">({label})</span>;
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function DeploymentIntelligence({ projectId }: DeploymentIntelligenceProps) {
  const [vercel, setVercel] = useState<any>(null);
  const [render, setRender] = useState<any>(null);
  const [logs, setLogs] = useState<any>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const toggleLogs = () => setLogsOpen((open) => !open);

  const fetchAll = useCallback(
    async (silent = false) => {
      if (!projectId) return;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        if (!silent) setLoading(true);
        setRefreshing(true);
        setError(null);
        const [v, r] = await Promise.allSettled([
          api.get(`/deploy-intelligence/vercel/${projectId}`),
          api.get(`/deploy-intelligence/render/${projectId}`),
        ]);
        setVercel(v.status === 'fulfilled' ? v.value.data : null);
        setRender(r.status === 'fulfilled' ? r.value.data : null);
        if (v.status === 'rejected' && r.status === 'rejected') {
          setError('Deployment Intelligence is unavailable right now.');
        }
        setLastUpdated(new Date());
      } catch {
        // handled by Promise.allSettled above
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId]
  );

  const fetchLogs = useCallback(
    async (offset: number) => {
      if (!projectId) return;
      setLogsLoading(true);
      try {
        const res = await api.get(`/deploy-intelligence/render/${projectId}/logs`, {
          params: { offset, limit: 100 },
        });
        const data = res.data;
        setLogs((prev: any) =>
          offset === 0 || !prev
            ? data
            : { ...data, logs: [...(prev.logs || []), ...(data.logs || [])] }
        );
      } catch (err: any) {
        setLogs((prev: any) =>
          prev
            ? prev
            : { logs: [], message: err.response?.data?.error || 'Failed to load logs.', configured: true }
        );
      } finally {
        setLogsLoading(false);
      }
    },
    [projectId]
  );

  // Initial load + auto-refresh every 30s while mounted (interval cleared on unmount).
  useEffect(() => {
    if (!projectId) return;
    fetchAll();
    const interval = setInterval(() => fetchAll(true), 30_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchAll, projectId]);

  // When the panel is expanded, (re)fetch the newest logs so the tail is fresh.
  useEffect(() => {
    if (logsOpen) fetchLogs(0);
  }, [logsOpen, fetchLogs]);

  // ─── Derived view data ─────────────────────────────────────────────
  const vercelCur = vercel?.current || null;
  const renderCur = render?.current || null;
  const vercelHistory = vercel?.deployments || [];
  const renderHistory = render?.deploys || [];
  const renderEvents = render?.events || [];
  const logLines = logs?.logs || [];

  const HistoryList = ({ entries }: { entries: any[] }) => (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">No deploy history available.</p>
      ) : (
        entries.slice(0, 8).map((d: any, i: number) => (
          <div key={`${d.id || i}-${i}`} className="flex items-center gap-2.5 p-2.5 bg-slate-950/30 border border-slate-900 rounded-lg">
            <StatusBadge status={d.status} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-300 font-semibold truncate">
                {d.commitMessage || (d.branchUnavailable ? 'branch unavailable' : (d.branch || 'main'))}
                {d.commitSha && <span className="text-slate-500 font-mono ml-1.5">{d.commitSha}</span>}
              </p>
              <p className="text-[10px] text-slate-600 flex items-center gap-2 mt-0.5">
                <span>{timeAgo(d.createdAt)}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {fmtDuration(d.durationMs)}
                </span>
                {d.branch && <span className="text-slate-700 font-mono">{d.branch}</span>}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const LogsPanel = () => {
    if (!logsOpen) return null;
    const message = logs?.message;
    const configured = logs?.configured;
    return (
      <div className="rounded-xl border border-slate-900 bg-slate-950/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <TerminalSquare className="w-4 h-4 text-cyan-400" /> Render Runtime Logs (most recent first)
          </h4>
          {logsLoading && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
        </div>
        {logsLoading && logLines.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 animate-pulse">Fetching logs…</p>
        ) : message && logLines.length === 0 ? (
          <p className="text-xs text-amber-400/90 flex items-center gap-2 py-3">
            <AlertTriangle className="w-4 h-4" /> {message}
            {configured === false && <span className="text-slate-500">— add RENDER_API_KEY / RENDER_SERVICE_ID to enable logs.</span>}
          </p>
        ) : logLines.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No log lines returned by Render.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-xl bg-slate-950/70 border border-slate-900 p-3 space-y-1 font-mono text-[11px]">
            {logLines.map((l: any, i: number) => (
              <div key={`${l.id || i}-${i}`} className="flex gap-2.5 leading-relaxed break-words">
                <span className="text-slate-600 flex-shrink-0">{l.updatedAt ? timeAgo(l.updatedAt) : '—'}</span>
                <span className={l.type === 'error' ? 'text-red-400' : 'text-slate-300'}>{l.message}</span>
              </div>
            ))}
          </div>
        )}
        {logs?.hasMore && (
          <button
            onClick={() => fetchLogs(logs.nextOffset ?? logs.limit ?? 100)}
            disabled={logsLoading}
            className="w-full py-2 text-xs font-bold text-primary border border-primary/30 rounded-xl hover:bg-primary/10 transition-all flex items-center justify-center gap-2"
          >
            {logsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Load older logs'}
          </button>
        )}
      </div>
    );
  };
return (
    <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Rocket className="w-4 h-4 text-cyan-400" /> Deployment Intelligence
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Read-only view of the live Vercel + Render deployment state.
            {lastUpdated && <span> Refreshed {timeAgo(lastUpdated.toISOString())} · auto-refreshes every 30s.</span>}
          </p>
        </div>
        <button
          onClick={() => fetchAll(false)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading && !vercel && !render ? (
        <div className="space-y-2 py-8"><Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" /></div>
      ) : error ? (
        <p className="text-xs text-amber-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* VERCEL */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LiveStatusDot status={vercelCur?.status} />
              <h4 className="text-sm font-bold text-white">Vercel</h4>
              {vercel?.configured === false && <span className="text-[10px] text-amber-400">not configured</span>}
            </div>
            {vercel?.message ? (
              <p className="text-[11px] text-amber-400/90 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {vercel.message}
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[11px]">
                  <StatusBadge status={vercelCur?.status ?? 'unknown'} />
                  <a
                    href={vercel?.liveUrl ? `https://${vercel.liveUrl}` : undefined}
                    target="_blank" rel="noreferrer"
                    className={`inline-flex items-center gap-1 text-cyan-400 hover:underline ${!vercel?.liveUrl ? 'pointer-events-none text-slate-500' : ''}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    {vercel?.liveUrl ? vercel.liveUrl : 'Live URL unavailable'}
                  </a>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <p className="text-slate-400 flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-slate-600" />
                    Branch: {vercelCur?.branch || 'n/a'} <Unavail flag={vercelCur?.branchUnavailable} />
                  </p>
                  <p className="text-slate-400 flex items-center gap-2">
                    <GitCommit className="w-3.5 h-3.5 text-slate-600" />
                    Commit: {vercelCur?.commitSha ? <code className="font-mono">{vercelCur.commitSha}</code> : 'n/a'} <Unavail flag={vercelCur?.commitShaUnavailable} />
                    {vercelCur?.commitMessage && <span className="text-slate-500 truncate">· {vercelCur.commitMessage}</span>}
                  </p>
                  <p className="text-slate-400 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-600" />
                    Last deploy: {fmtDate(vercelCur?.deployedAt ?? null)} ({timeAgo(vercelCur?.deployedAt ?? null)})
                  </p>
                  <p className="text-slate-400 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-slate-600" />
                    Project: {vercel?.projectName || 'n/a'} <Unavail flag={vercel?.projectNameUnavailable} />
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Deploy History</p>
                  <HistoryList entries={vercelHistory} />
                </div>
              </>
            )}
          </div>

                    {/* RENDER */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <LiveStatusDot status={renderCur?.status} />
              <h4 className="text-sm font-bold text-white">Render</h4>
              {render?.configured === false && <span className="text-[10px] text-amber-400">not configured</span>}
            </div>
            {render?.message ? (
              <p className="text-[11px] text-amber-400/90 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {render.message}
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[11px]">
                  <StatusBadge status={renderCur?.status ?? 'unknown'} />
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <Server className="w-3 h-3" /> {render.serviceId || 'service'}
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <p className="text-slate-400 flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-slate-600" />
                    Branch: {renderCur?.branch || 'n/a'} <Unavail flag={renderCur?.branchUnavailable} />
                  </p>
                  <p className="text-slate-400 flex items-center gap-2">
                    <GitCommit className="w-3.5 h-3.5 text-slate-600" />
                    Commit: {renderCur?.commitSha ? <code className="font-mono">{renderCur.commitSha}</code> : 'n/a'} <Unavail flag={renderCur?.commitShaUnavailable} />
                    {renderCur?.commitMessage && <span className="text-slate-500 truncate">· {renderCur.commitMessage}</span>}
                  </p>
                  <p className="text-slate-400 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-600" />
                    Last deploy: {fmtDate(renderCur?.deployedAt ?? null)} ({timeAgo(renderCur?.deployedAt ?? null)})
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Deploy History</p>
                  <HistoryList entries={renderHistory} />
                </div>
                {renderEvents.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2">Recent Events</p>
                    <div className="space-y-1.5">
                      {renderEvents.slice(0, 4).map((e: any, i: number) => (
                        <p key={`${e.id || i}-${i}`} className="text-[11px] text-slate-400">
                          <span className="text-slate-500">{e.type || 'event'}</span>
                          {e.details ? <span className="text-slate-500"> — {e.details}</span> : <Unavail flag={e.detailsUnavailable} />}
                          <span className="text-slate-600"> · {timeAgo(e.timestamp)}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Logs toggle */}
      <div className="border-t border-slate-900 pt-4">
        <button
          onClick={toggleLogs}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 hover:text-white transition-all"
        >
          <span className="flex items-center gap-2"><TerminalSquare className="w-4 h-4 text-cyan-400" /> View Logs (Render backend)</span>
          {logsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <div className="mt-4"><LogsPanel /></div>
      </div>
    </div>
  );
}