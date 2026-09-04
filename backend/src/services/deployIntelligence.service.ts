// ─────────────────────────────────────────────────────────────────────────────
// Deployment Intelligence service — read-only Vercel + Render API integration.
//
// Every call below hits the REAL provider APIs (api.vercel.com / api.render.com)
// server-side with the VERCEL_API_TOKEN / RENDER_API_KEY from env. Nothing is
// ever faked: if a field cannot be read from the provider response it is
// returned as `null` with a matching `*Unavailable: true` flag so the UI can
// label it "Unavailable" instead of inventing data.
//
// Per-project provider ids (the Vercel project id and the Render service id)
// are passed in as arguments by the route, which reads them from the Project
// row in the DB. The account-level API tokens stay in env and are used ONLY in
// this module's Authorization headers — never included in any returned payload.
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
// (every 30s) never hammers the provider APIs. Keys include the provider id so
// different projects' deployments never share a cache entry.
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

// Tokens are account-level and stay in env. The per-project provider id is an
// argument so the DB value (Project.vercelProjectId / Project.renderServiceId)
// drives which target we query.
// VERCEL_API_TOKEN is the documented name; VERCEL_TOKEN is the legacy name in
// existing .env files — either works so existing deployments keep functioning.
function vercelToken(): string | null {
  return process.env.VERCEL_API_TOKEN?.trim() || process.env.VERCEL_TOKEN?.trim() || null;
}

function hasVercelToken(): boolean {
  const token = vercelToken();
  return !!token && !isPlaceholder(token);
}

function hasRenderKey(): boolean {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  return !!apiKey && !isPlaceholder(apiKey);
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
// ─── Render response helpers ────────────────────────────────────────────────
// The Render REST API wraps each list entry in a cursor envelope, e.g.
// [{ "deploy": {...}, "cursor": "..." }]. These helpers unwrap the envelope and
// fall back to a bare object for robustness.
function unwrapRenderList(raw: any[]): any[] {
  return (raw || []).map((item: any) => {
    if (item && typeof item === 'object' && ('deploy' in item || 'event' in item)) {
      return item.deploy ?? item.event ?? item;
    }
    return item;
  });
}

/** The service-level GET exposes the live branch, ownerId + service name. */
interface RenderServiceMeta {
  id: string | null;
  name: string | null;
  branch: string | null;
  ownerId: string | null;
  type: string | null;
  url: string | null;
}

async function fetchRenderServiceMeta(serviceId: string): Promise<RenderServiceMeta> {
  const cacheKey = `render:svc:${serviceId}`;
  const hit = getCached<RenderServiceMeta>(cacheKey);
  if (hit.cached && hit.data) return hit.data;

  const apiKey = process.env.RENDER_API_KEY!.trim();
  const res = await axios.get(`${RENDER_API_BASE()}/services/${encodeURIComponent(serviceId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 12000,
  });

  const meta: RenderServiceMeta = {
    id: res.data?.id || serviceId,
    name: res.data?.name || null,
    branch: res.data?.branch || null,
    ownerId: res.data?.ownerId || null,
    type: res.data?.type || null,
    url: res.data?.serviceDetails?.url || null,
  };
  setCached(cacheKey, meta, INTEL_TTL_MS);
  return meta;
}

// ─── Service ────────────────────────────────────────────────────────────────
export class DeployIntelligenceService {
/**
   * Vercel deployment intelligence for ONE project:
   *   - GET /v6/deployments?projectId=...   → deploy history (status/commit/branch/ts/duration)
   *   - GET /v9/projects/:id                → project name + current live URL/domain
   * `vercelProjectId` is the project-scoped Vercel id from the DB; only the
   * account token is read from env.
   */
  static async getVercelIntelligence(vercelProjectId: string): Promise<VercelIntelligence> {
    const cacheKey = `vercel:intel:${vercelProjectId}`;
    const hit = getCached<VercelIntelligence>(cacheKey);
    if (hit.cached && hit.data) return hit.data;

    const base = { provider: 'vercel' as const, configured: hasVercelToken() };

    if (!base.configured) {
      const payload: VercelIntelligence = {
        ...base,
        message:
          'VERCEL_API_TOKEN is not configured. Add it to the backend environment to enable Vercel deployment intelligence.',
        projectId: vercelProjectId,
        projectName: null,
        projectNameUnavailable: true,
        liveUrl: null,
        liveUrlUnavailable: true,
        current: null,
        deployments: [],
        fetchedAt: new Date().toISOString(),
      };
      setCached(cacheKey, payload, INTEL_TTL_MS);
      return payload;
    }

    const token = vercelToken()!;
    const projectId = vercelProjectId.trim();

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
      setCached(cacheKey, payload, INTEL_TTL_MS);
      return payload;
    } catch (err: any) {
      console.error(
        '[DEPLOY INTELLIGENCE ERROR] Vercel API request failed:',
        `projectId=${projectId}`,
        `url=${VERCEL_API_BASE()}/v6/deployments`,
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
   * Render deployment intelligence for ONE service:
   *   - GET /v1/services/:serviceId          → service name + live branch + ownerId (for logs)
   *   - GET /v1/services/:serviceId/deploys  → deploy history/status (cursor envelope)
   *   - GET /v1/services/:serviceId/events   → recent service activity (cursor envelope)
   * `renderServiceId` is the project-scoped Render service id from the DB.
   */
  static async getRenderIntelligence(renderServiceId: string): Promise<RenderIntelligence> {
    const cacheKey = `render:intel:${renderServiceId}`;
    const hit = getCached<RenderIntelligence>(cacheKey);
    if (hit.cached && hit.data) return hit.data;

    const base = { provider: 'render' as const, configured: hasRenderKey() };

    if (!base.configured) {
      const payload: RenderIntelligence = {
        ...base,
        message:
          'RENDER_API_KEY is not configured. Add it to the backend environment to enable Render deployment intelligence.',
        serviceId: renderServiceId,
        serviceName: null,
        serviceNameUnavailable: true,
        current: null,
        deploys: [],
        events: [],
        fetchedAt: new Date().toISOString(),
      };
      setCached(cacheKey, payload, INTEL_TTL_MS);
      return payload;
    }

    const apiKey = process.env.RENDER_API_KEY!.trim();
    const serviceId = renderServiceId.trim();
    const headers = { Authorization: `Bearer ${apiKey}` };

    try {
      const [meta, deploysRes, eventsRes] = await Promise.all([
        fetchRenderServiceMeta(serviceId),
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
      const deploys: DeployEntry[] = unwrapRenderList(rawDeploys)
        .slice(0, 10)
        .map((d: any): DeployEntry => {
          const commit = d.commit || {};
          // Render deploy commits carry no branch; the service-level branch
          // is the deployment's source branch, so use it as the fallback.
          const branch = commit.branch || meta.branch || null;
          const commitSha = shortSha(commit.id || null, 7);
          const commitMessage = commit.message || null;
          const createdAt = toIso(d.createdAt);
          const finishedAt = toIso(d.finishedAt);
          return {
            id: d.id || null,
            name: commit.message || null, // Render deploys have no display name; use commit message.
            url: meta.url || null,
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
      const events: RenderEvent[] = unwrapRenderList(rawEvents).slice(0, 10).map((e: any): RenderEvent => {
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
        serviceName: meta.name || null,
        serviceNameUnavailable: !meta.name,
        current,
        deploys,
        events,
        fetchedAt: new Date().toISOString(),
      };
      setCached(cacheKey, payload, INTEL_TTL_MS);
      return payload;
    } catch (err: any) {
      console.error(
        '[DEPLOY INTELLIGENCE ERROR] Render API request failed:',
        `serviceId=${serviceId}`,
        `url=${RENDER_API_BASE()}/services/${serviceId}`,
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
   *
   * Render's REST API serves logs from the top-level `/v1/logs` endpoint (not
   * `/services/:id/logs`, which 404s):
   *   - GET /v1/logs?ownerId=...&resource=<serviceId>&direction=backward&limit&startTime&endTime
   *
   * List responses are paginated by TIME, not offset, so we page backwards
   * (limit=100 at a time, threading the returned `nextEndTime` as the next
   * `endTime`) until we have fetched `offset` extra lines, then slice the
   * requested page out.
   */
  static async getRenderLogs(renderServiceId: string, offset = 0, limit = 100): Promise<RenderLogs> {
    const cacheKey = `render:logs:${renderServiceId}:${offset}:${limit}`;
    const hit = getCached<RenderLogs>(cacheKey);
    if (hit.cached && hit.data) return hit.data;

    const base = {
      provider: 'render' as const,
      configured: hasRenderKey(),
      limit,
      offset,
      fetchedAt: new Date().toISOString(),
    };

    if (!base.configured) {
      const payload: RenderLogs = {
        ...base,
        message:
          'RENDER_API_KEY is not configured. Add it to the backend environment to enable Render logs.',
        logs: [],
        nextOffset: null,
        hasMore: false,
      };
      setCached(cacheKey, payload, LOGS_TTL_MS);
      return payload;
    }

    const apiKey = process.env.RENDER_API_KEY!.trim();
    const serviceId = renderServiceId.trim();

    try {
      const meta = await fetchRenderServiceMeta(serviceId);
      if (!meta.ownerId) {
        const payload: RenderLogs = {
          ...base,
          message: 'Render did not expose an ownerId for this service; cannot paginate logs.',
          logs: [],
          nextOffset: null,
          hasMore: false,
        };
        setCached(cacheKey, payload, LOGS_TTL_MS);
        return payload;
      }

      const params: Record<string, string | number> = {
        ownerId: meta.ownerId,
        resource: serviceId,
        direction: 'backward', // most-recent first
        limit: 100, // max supported by the API
      };

      const collected: RenderLogEntry[] = [];
      let hasMore = true;
      let pageCount = 0;
      const MAX_PAGES = 12; // guards against runaway loops on huge offsets

      while (hasMore && pageCount < MAX_PAGES) {
        const res = await axios.get(`${RENDER_API_BASE()}/logs`, {
          params,
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        });

        const raw: any[] = Array.isArray(res.data) ? res.data : res.data?.logs || [];
        const pageLogs: RenderLogEntry[] = raw.map((l: any): RenderLogEntry => {
          const labels: Array<{ name?: string; value?: string }> = Array.isArray(l.labels) ? l.labels : [];
          const label = (name: string) => labels.find((x) => x.name === name)?.value ?? null;
          const level = label('level');
          const streamType = label('type');
          // Keep error lines flagged as 'error' (the UI colors them red) even
          // though the stream type label itself is 'app'/'build'/etc.
          const type = level === 'error' ? 'error' : streamType || level || 'log';
          return {
            id: l.id || null,
            message: typeof l.message === 'string' ? l.message : null,
            type,
            updatedAt: toIso(l.timestamp),
          };
        });
        collected.push(...pageLogs);

        // The most recent fetched timestamp on the last page is the boundary
        // for the NEXT older page.
        const wanted = offset + limit;
        if (collected.length >= wanted) break;

        hasMore = res.data?.hasMore === true;
        const nextEnd = res.data?.nextEndTime;
        if (!hasMore || !nextEnd) break;
        params.endTime = nextEnd as string;
        pageCount++;
      }

      // collected is newest-first (each page is reversed ascending within).
      collected.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      const logs = collected.slice(offset, offset + limit);
      const reachedEnd = collected.length < offset + limit;
      const nextOffset = reachedEnd ? null : offset + limit;

      const payload: RenderLogs = {
        ...base,
        message: null,
        logs,
        nextOffset,
        hasMore: !reachedEnd,
      };
      setCached(cacheKey, payload, LOGS_TTL_MS);
      return payload;
    } catch (err: any) {
      console.error(
        '[DEPLOY INTELLIGENCE ERROR] Render logs request failed:',
        `serviceId=${serviceId}`,
        `url=${RENDER_API_BASE()}/logs`,
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