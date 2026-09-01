// ─────────────────────────────────────────────────────────────────────────────
// Deployment Intelligence service — read-only Vercel + Render API integration.
//
// Every call below hits the REAL provider APIs (api.vercel.com / api.render.com)
// server-side with the VERCEL_TOKEN / RENDER_API_KEY from env. Nothing is ever
// faked: if a field cannot be read from the provider response it is returned as
// `null` with a matching `*Unavailable: true` flag so the UI can label it
// "Unavailable" instead of inventing data.
//
// Provider API tokens are used ONLY in this module's Authorization headers and
// are never included in any returned payload.
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios';

export type DeployStatus =
  | 'success'
  | 'building'
  | 'queued'
  | 'failed'
  | 'canceled'
  | 'down'
  | 'unknown';

export interface DeployEntry {
  id: string | null;
  name: string | null;
  url: string | null;
  status: DeployStatus;
  createdAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  durationUnavailable: boolean;
  branch: string | null;
  branchUnavailable: boolean;
  commitSha: string | null;
  commitShaUnavailable: boolean;
  commitMessage: string | null;
  commitMessageUnavailable: boolean;
  source: 'vercel' | 'render';
}

export interface CurrentDeployment {
  status: DeployStatus;
  branch: string | null;
  branchUnavailable: boolean;
  commitSha: string | null;
  commitShaUnavailable: boolean;
  commitMessage: string | null;
  commitMessageUnavailable: boolean;
  deployedAt: string | null;
}

export interface VercelIntelligence {
  provider: 'vercel';
  configured: boolean;
  message: string | null;
  projectId: string | null;
  projectName: string | null;
  projectNameUnavailable: boolean;
  liveUrl: string | null;
  liveUrlUnavailable: boolean;
  current: CurrentDeployment | null;
  deployments: DeployEntry[];
  fetchedAt: string;
}

export interface RenderEvent {
  id: string | null;
  type: string | null;
  timestamp: string | null;
  details: string | null;
  detailsUnavailable: boolean;
}

export interface RenderIntelligence {
  provider: 'render';
  configured: boolean;
  message: string | null;
  serviceId: string | null;
  serviceName: string | null;
  serviceNameUnavailable: boolean;
  current: CurrentDeployment | null;
  deploys: DeployEntry[];
  events: RenderEvent[];
  fetchedAt: string;
}

export interface RenderLogEntry {
  id: string | null;
  message: string | null;
  type: string | null;
  updatedAt: string | null;
}

export interface RenderLogs {
  provider: 'render';
  configured: boolean;
  message: string | null;
  logs: RenderLogEntry[];
  limit: number;
  offset: number;
  nextOffset: number | null;
  hasMore: boolean;
  fetchedAt: string;
}

// ─── In-memory TTL cache ────────────────────────────────────────────────────
// 45s for intelligence snapshots, 30s for logs, so dashboard auto-refresh
// (every 30s) never hammers the provider APIs.
interface CacheEntry {
  expiresAt: number;
  data: unknown;
}
const cache = new Map<string, CacheEntry>();

function getCached<T>(key: string): { cached: boolean; data: T | null } {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return { cached: true, data: hit.data as T };
  return { cached: false, data: null };
}

function setCached(key: string, data: unknown, ttlMs: number): void {
  cache.set(key, { expiresAt: Date.now() + ttlMs, data });
}

const INTEL_TTL_MS = 45_000;
const LOGS_TTL_MS = 30_000;

// ─── Configuration (read lazily at call time, mirroring the mailer) ─────────
// Placeholder values ("your-...", "prj_your-...", etc. from .env.example) count
// as NOT configured — same approach GitHubService uses for placeholder tokens —
// so we never call the provider APIs with junk credentials.
function isPlaceholder(val?: string): boolean {
  if (!val) return true;
  const lower = val.toLowerCase().trim();
  return lower.includes('your');
}

function isConfiguredVercel(): boolean {
  const token = process.env.VERCEL_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  return !!token && !!projectId && !isPlaceholder(token) && !isPlaceholder(projectId);
}

function isConfiguredRender(): boolean {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const serviceId = process.env.RENDER_SERVICE_ID?.trim();
  return !!apiKey && !!serviceId && !isPlaceholder(apiKey) && !isPlaceholder(serviceId);
}

// Optional API base overrides (testing/gateway use only). When unset the real
// provider hosts are used. The /v1 suffix is appended if missing, since the
// Render REST API is namespaced under /v1 and the env override may omit it.
// Default behaviour is unchanged in production.
const VERCEL_API_BASE = () => process.env.VERCEL_API_BASE?.trim() || 'https://api.vercel.com';
const RENDER_API_BASE = () => {
  const base = (process.env.RENDER_API_BASE?.trim() || 'https://api.render.com/v1').replace(/\/+$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
};

// ─── Status normalizers ─────────────────────────────────────────────────────
function normalizeVercelStatus(state?: string | null): DeployStatus {
  const s = (state || '').toUpperCase();
  if (s === 'READY') return 'success';
  if (s === 'BUILDING' || s === 'INITIALIZING') return 'building';
  if (s === 'QUEUED') return 'queued';
  if (s === 'ERROR' || s === 'ERRORED' || s === 'BLOCKED' || s === 'CANCELED') return 'failed';
  return 'unknown';
}

function normalizeRenderStatus(status?: string | null): DeployStatus {
  const s = (status || '').toLowerCase();
  if (s === 'live') return 'success';
  if (s === 'build_in_progress' || s === 'update_in_progress' || s === 'created') return 'building';
  if (s === 'deploy_failed') return 'failed';
  if (s === 'canceled') return 'canceled';
  if (s === 'deactivated') return 'down';
  return 'unknown';
}

function shortSha(sha?: string | null, len = 7): string | null {
  if (!sha) return null;
  return sha.length > len ? sha.slice(0, len) : sha;
}

function toIso(value?: string | number | null): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  const num = Number(value);
  // Handle Vercel/Render Unix timestamps that arrive as stringified numbers.
  if (!Number.isNaN(num) && String(num) === value) {
    return new Date(num < 1e12 ? num * 1000 : num).toISOString();
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function diffMs(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return null;
  return b - a;
}

// ─── Service ────────────────────────────────────────────────────────────────
export class DeployIntelligenceService {
  /**
   * Vercel deployment intelligence:
   *   - GET /v6/deployments?projectId=...   → deploy history (status/commit/branch/ts/duration)
   *   - GET /v9/projects/:id                → project name + current live URL/domain
   * Real data only. Provider failures surface as `configured:true` + a `message`,
   * never as fabricated records.
   */
  static async getVercelIntelligence(): Promise<VercelIntelligence> {
    const hit = getCached<VercelIntelligence>('vercel:intel');
    if (hit.cached && hit.data) return hit.data;

    const base = { provider: 'vercel' as const, configured: isConfiguredVercel() };

    if (!base.configured) {
      const payload: VercelIntelligence = {
        ...base,
        message:
          'VERCEL_TOKEN or VERCEL_PROJECT_ID is not configured. Add them to the backend environment to enable Vercel deployment intelligence.',
        projectId: null,
        projectName: null,
        projectNameUnavailable: true,
        liveUrl: null,
        liveUrlUnavailable: true,
        current: null,
        deployments: [],
        fetchedAt: new Date().toISOString(),
      };
      setCached('vercel:intel', payload, INTEL_TTL_MS);
      return payload;
    }

    const token = process.env.VERCEL_TOKEN!.trim();
    const projectId = process.env.VERCEL_PROJECT_ID!.trim();

    try {
      const [deploysRes, projectRes] = await Promise.all([
        axios.get(`${VERCEL_API_BASE()}/v6/deployments`, {
          params: { projectId, limit: 10, target: 'production' },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 12000,
        }),
        axios.get(`${VERCEL_API_BASE()}/v9/projects/${encodeURIComponent(projectId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 12000,
        }),
      ]);

      const deployments: DeployEntry[] = (deploysRes.data?.deployments || []).map((d: any): DeployEntry => {
        const meta = d.meta || {};
        const branch = meta.githubCommitRef || meta.commitRef || meta.branch || null;
        const commitSha = shortSha(meta.githubCommitSha || meta.commitSha || null);
        const commitMessage = meta.githubCommitMessage || meta.commitMessage || null;
        const buildingAt = toIso(d.buildingAt);
        const readyAt = toIso(d.ready);
        return {
          id: d.uid || null,
          name: d.name || null,
          url: d.url || null,
          status: normalizeVercelStatus(d.readyState || d.state),
          createdAt: toIso(d.created || d.createdAt),
          finishedAt: readyAt,
          durationMs: diffMs(buildingAt, readyAt),
          durationUnavailable: !(buildingAt && readyAt),
          branch,
          branchUnavailable: !branch,
          commitSha,
          commitShaUnavailable: !commitSha,
          commitMessage,
          commitMessageUnavailable: !commitMessage,
          source: 'vercel',
        };
      });

      const liveUrl =
        projectRes.data?.targets?.production?.url ||
        projectRes.data?.latestDeployments?.[0]?.url ||
        null;

      const latest = deployments[0] || null;
      const current: CurrentDeployment | null = latest
        ? {
            status: latest.status,
            branch: latest.branch,
            branchUnavailable: latest.branchUnavailable,
            commitSha: latest.commitSha,
            commitShaUnavailable: latest.commitShaUnavailable,
            commitMessage: latest.commitMessage,
            commitMessageUnavailable: latest.commitMessageUnavailable,
            deployedAt: latest.createdAt,
          }
        : null;

      const payload: VercelIntelligence = {
        ...base,
        message: null,
        projectId,
        projectName: projectRes.data?.name || null,
        projectNameUnavailable: !projectRes.data?.name,
        liveUrl,
        liveUrlUnavailable: !liveUrl,
        current,
        deployments,
        fetchedAt: new Date().toISOString(),
      };
      setCached('vercel:intel', payload, INTEL_TTL_MS);
      return payload;
    } catch (err: any) {
      console.error(
        '[DEPLOY INTELLIGENCE ERROR] Vercel API request failed:',
        err.response?.status || err.message,
        err.response?.data?.error?.message || ''
      );
      const statusCode = err.response?.status;
      const message =
        err.response?.data?.error?.code === 'TOKEN_NOT_FOUND'
          ? 'Vercel token is invalid or revoked.'
          : statusCode
            ? `Vercel API returned HTTP ${statusCode}.`
            : 'Vercel API is unreachable.';
      return {
        ...base,
        message,
        projectId,
        projectName: null,
        projectNameUnavailable: true,
        liveUrl: null,
        liveUrlUnavailable: true,
        current: null,
        deployments: [],
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Render deployment intelligence:
   *   - GET /v1/services/:serviceId/deploys   → deploy history/status
   *   - GET /v1/services/:serviceId/events    → recent service activity
   */
  static async getRenderIntelligence(): Promise<RenderIntelligence> {
    const hit = getCached<RenderIntelligence>('render:intel');
    if (hit.cached && hit.data) return hit.data;

    const base = { provider: 'render' as const, configured: isConfiguredRender() };

    if (!base.configured) {
      const payload: RenderIntelligence = {
        ...base,
        message:
          'RENDER_API_KEY or RENDER_SERVICE_ID is not configured. Add them to the backend environment to enable Render deployment intelligence.',
        serviceId: null,
        serviceName: null,
        serviceNameUnavailable: true,
        current: null,
        deploys: [],
        events: [],
        fetchedAt: new Date().toISOString(),
      };
      setCached('render:intel', payload, INTEL_TTL_MS);
      return payload;
    }

    const apiKey = process.env.RENDER_API_KEY!.trim();
    const serviceId = process.env.RENDER_SERVICE_ID!.trim();
    const headers = { Authorization: `Bearer ${apiKey}` };

    try {
      const [deploysRes, eventsRes] = await Promise.all([
        axios.get(`${RENDER_API_BASE()}/services/${encodeURIComponent(serviceId)}/deploys`, {
          params: { limit: 10 },
          headers,
          timeout: 12000,
        }),
        axios.get(`${RENDER_API_BASE()}/services/${encodeURIComponent(serviceId)}/events`, {
          headers,
          timeout: 12000,
        }),
      ]);

      const rawDeploys: any[] = Array.isArray(deploysRes.data) ? deploysRes.data : deploysRes.data?.deploys || [];
      const deploys: DeployEntry[] = rawDeploys.map((d: any): DeployEntry => {
        const commit = d.commit || {};
        const branch = commit.branch || null;
        const commitSha = shortSha(commit.id || null, 7);
        const commitMessage = commit.message || null;
        const createdAt = toIso(d.createdAt);
        const finishedAt = toIso(d.finishedAt);
        return {
          id: d.id || null,
          name: commit.message || null, // Render deploys have no display name; use commit message.
          url: null,
          status: normalizeRenderStatus(d.status),
          createdAt,
          finishedAt,
          durationMs: diffMs(createdAt, finishedAt),
          durationUnavailable: !(createdAt && finishedAt),
          branch,
          branchUnavailable: !branch,
          commitSha,
          commitShaUnavailable: !commitSha,
          commitMessage,
          commitMessageUnavailable: !commitMessage,
          source: 'render',
        };
      });

      const rawEvents: any[] = Array.isArray(eventsRes.data) ? eventsRes.data : eventsRes.data?.events || [];
      const events: RenderEvent[] = rawEvents.slice(0, 10).map((e: any): RenderEvent => {
        const details = e.details;
        return {
          id: e.id || null,
          type: e.type || null,
          timestamp: toIso(e.timestamp),
          details: typeof details === 'string' ? details : details ? JSON.stringify(details) : null,
          detailsUnavailable: !details,
        };
      });

      const latest = deploys[0] || null;
      const current: CurrentDeployment | null = latest
        ? {
            status: latest.status,
            branch: latest.branch,
            branchUnavailable: latest.branchUnavailable,
            commitSha: latest.commitSha,
            commitShaUnavailable: latest.commitShaUnavailable,
            commitMessage: latest.commitMessage,
            commitMessageUnavailable: latest.commitMessageUnavailable,
            deployedAt: latest.createdAt,
          }
        : null;

      const payload: RenderIntelligence = {
        ...base,
        message: null,
        serviceId,
        serviceName: null,
        serviceNameUnavailable: true,
        current,
        deploys,
        events,
        fetchedAt: new Date().toISOString(),
      };
      setCached('render:intel', payload, INTEL_TTL_MS);
      return payload;
    } catch (err: any) {
      console.error(
        '[DEPLOY INTELLIGENCE ERROR] Render API request failed:',
        err.response?.status || err.message,
        err.response?.data?.message || ''
      );
      const statusCode = err.response?.status;
      const message = statusCode ? `Render API returned HTTP ${statusCode}.` : 'Render API is unreachable.';
      return {
        ...base,
        message,
        serviceId,
        serviceName: null,
        serviceNameUnavailable: true,
        current: null,
        deploys: [],
        events: [],
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Render backend runtime logs — most recent first, paginated by `offset`.
   *   - GET /v1/services/:serviceId/logs?limit&offset
   */
  static async getRenderLogs(offset = 0, limit = 100): Promise<RenderLogs> {
    const cacheKey = `render:logs:${offset}:${limit}`;
    const hit = getCached<RenderLogs>(cacheKey);
    if (hit.cached && hit.data) return hit.data;

    const base = {
      provider: 'render' as const,
      configured: isConfiguredRender(),
      limit,
      offset,
      fetchedAt: new Date().toISOString(),
    };

    if (!base.configured) {
      const payload: RenderLogs = {
        ...base,
        message:
          'RENDER_API_KEY or RENDER_SERVICE_ID is not configured. Add them to the backend environment to enable Render logs.',
        logs: [],
        nextOffset: null,
        hasMore: false,
      };
      setCached(cacheKey, payload, LOGS_TTL_MS);
      return payload;
    }

    const apiKey = process.env.RENDER_API_KEY!.trim();
    const serviceId = process.env.RENDER_SERVICE_ID!.trim();

    try {
      const res = await axios.get(`${RENDER_API_BASE()}/services/${encodeURIComponent(serviceId)}/logs`, {
        params: { limit, offset },
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000,
      });

      const raw: any[] = Array.isArray(res.data) ? res.data : res.data?.logs || [];
      const logs: RenderLogEntry[] = raw.map((l: any): RenderLogEntry => ({
        id: l.id || null,
        message: typeof l.message === 'string' ? l.message : null,
        type: l.type || 'log',
        updatedAt: toIso(l.updatedAt || l.timestamp),
      }));

      // Most recent first (the provider can return chronological order).
      logs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

      const hasMore = logs.length === limit;
      const payload: RenderLogs = {
        ...base,
        message: null,
        logs,
        nextOffset: hasMore ? offset + limit : null,
        hasMore,
      };
      setCached(cacheKey, payload, LOGS_TTL_MS);
      return payload;
    } catch (err: any) {
      console.error(
        '[DEPLOY INTELLIGENCE ERROR] Render logs request failed:',
        err.response?.status || err.message,
        err.response?.data?.message || ''
      );
      const statusCode = err.response?.status;
      return {
        ...base,
        message: statusCode ? `Render logs API returned HTTP ${statusCode}.` : 'Render logs API is unreachable.',
        logs: [],
        nextOffset: null,
        hasMore: false,
      };
    }
  }
}