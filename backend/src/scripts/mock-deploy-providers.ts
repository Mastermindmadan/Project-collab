/**
 * Mock Vercel + Render API server for end-to-end verification of the
 * Deployment Intelligence integration WITHOUT live third-party accounts.
 *
 * Serves the EXACT response shapes the real providers return (see Vercel REST
 * API docs and Render OpenAPI spec). Also enforces Bearer auth so the test can
 * prove the backend really forwards VERCEL_TOKEN / RENDER_API_KEY, and counts
 * per-endpoint hits so the test can prove the 30-45s in-memory cache works.
 *
 * Run:  npx ts-node src/scripts/mock-deploy-providers.ts   (port 8899)
 */
import http from 'http';

const PORT = 8899;
const VERCEL_TOKEN = 'dummy-vercel-token-abc123';
const RENDER_KEY = 'rnd_dummy-render-key-xyz789';

const counters: Record<string, number> = {};

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

// ─── Vercel deploy history (v6) ────────────────────────────────────────────
const vercelDeployments = [
  {
    uid: 'dpl_v1_ready',
    name: 'project-collab-one',
    url: 'project-collab-one.vercel.app',
    readyState: 'READY',
    state: 'READY',
    target: 'production',
    created: String(now - 3600_000 * 26),
    buildingAt: String(now - 3600_000 * 26 + 45_000),
    ready: String(now - 3600_000 * 26 + 90_000),
    meta: {
      githubCommitRef: 'main',
      githubCommitSha: '9f4c2ab1d7e08f3a5b6c7d8e9f0a1b2c3d4e5f60',
      githubCommitMessage: 'feat: add deployment intelligence',
    },
  },
  {
    uid: 'dpl_v2_building',
    name: 'project-collab-one',
    url: null,
    readyState: 'BUILDING',
    state: 'BUILDING',
    target: 'production',
    created: String(now - 3600_000 * 2),
    meta: {
      githubCommitRef: 'main',
      githubCommitSha: 'aabbccddeeff00112233445566778899aabbccdd',
      githubCommitMessage: 'fix: render log pagination',
    },
  },
  {
    uid: 'dpl_v3_failed',
    name: 'project-collab-one',
    url: null,
    readyState: 'ERROR',
    state: 'ERROR',
    target: 'production',
    created: String(now - 3600_000 * 50),
    buildingAt: String(now - 3600_000 * 50 + 30_000),
    ready: null,
    meta: { githubCommitRef: 'feature/vercel-logos', githubCommitSha: '1111222233334444555566667777888899990000' },
  },
  {
    uid: 'dpl_v4_queued',
    name: 'project-collab-one',
    url: null,
    readyState: 'QUEUED',
    state: 'QUEUED',
    target: 'preview',
    created: String(now - 60_000),
    meta: { githubCommitRef: 'feature/vercel-logos' },
  },
  {
    uid: 'dpl_v5_no_meta',
    name: 'project-collab-one',
    url: 'project-collab-one-g1x2y3.vercel.app',
    readyState: 'READY',
    state: 'READY',
    target: 'production',
    created: String(now - 3600_000 * 74),
    buildingAt: String(now - 3600_000 * 74 + 60_000),
    ready: String(now - 3600_000 * 74 + 120_000),
    meta: {},
  },
];

const vercelProject = {
  id: 'prj_dummy-vercel-project',
  name: 'project-collab-one',
  targets: { production: { url: 'project-collab-one.vercel.app' } },
  latestDeployments: [{ url: 'project-collab-one.vercel.app', readyState: 'READY' }],
};

// ─── Render deploys + events (v1) ──────────────────────────────────────────
// The real Render API wraps every list entry in a cursor envelope:
// [{ "deploy": {...}, "cursor": "..." }] / [{ "event": {...}, "cursor": "..." }].
const renderService = {
  id: 'srv_dummy-render-service',
  name: 'project-collab',
  branch: 'main',
  ownerId: 'tea_dummy-render-owner',
  type: 'web_service',
  suspended: 'not_suspended',
  serviceDetails: { url: 'https://project-collab.onrender.com' },
};

const renderDeploys = [
  { deploy: { id: 'dep_live_1', status: 'live', createdAt: iso(now - 3600_000 * 26), finishedAt: iso(now - 3600_000 * 26 + 95_000), commit: { id: '9f4c2ab1d7e08f3a5b6c7d8e9f0a1b2c3d4e5f60', branch: 'main', message: 'feat: add deployment intelligence' } }, cursor: 'c1' },
  { deploy: { id: 'dep_build_1', status: 'build_in_progress', createdAt: iso(now - 3600_000 * 2), finishedAt: null, commit: { id: 'aabbccddeeff00112233445566778899aabbccdd', branch: 'main', message: 'fix: render log pagination' } }, cursor: 'c2' },
  { deploy: { id: 'dep_failed_1', status: 'deploy_failed', createdAt: iso(now - 3600_000 * 50), finishedAt: iso(now - 3600_000 * 50 + 31_000), commit: { id: '1111222233334444555566667777888899990000', branch: 'feature/render-events' } }, cursor: 'c3' },
  { deploy: { id: 'dep_cancel_1', status: 'canceled', createdAt: iso(now - 3600_000 * 74), finishedAt: iso(now - 3600_000 * 74 + 20_000), commit: { id: '9999aaaabbbbccc0ddddeeeeffff000011112222', branch: 'main', message: 'build: bump deps' } }, cursor: 'c4' },
  { deploy: { id: 'dep_no_commit', status: 'live', createdAt: iso(now - 3600_000 * 98), finishedAt: iso(now - 3600_000 * 98 + 60_000), commit: {} }, cursor: 'c5' },
];

const renderEvents = [
  { event: { id: 'evt_1', type: 'service.updated', timestamp: iso(now - 3600_000 * 26), details: 'Deploy completed successfully' }, cursor: 'e1' },
  { event: { id: 'evt_2', type: 'instance.created', timestamp: iso(now - 3600_000 * 26), details: 'Instance web-1 started' }, cursor: 'e2' },
  { event: { id: 'evt_3', type: 'service.updated', timestamp: iso(now - 3600_000 * 2), details: 'Deploy started' }, cursor: 'e3' },
  { event: { id: 'evt_no_details', type: 'deploy', timestamp: iso(now - 3600_000), details: undefined }, cursor: 'e4' },
];

// ─── HTTP server ───────────────────────────────────────────────────────────
function guard(req: http.IncomingMessage): boolean {
  const auth = req.headers.authorization || '';
  const path = (req.url || '').split('?')[0];
  if (path.startsWith('/__')) return true;
  if (path.startsWith('/v6/') || path.startsWith('/v9/')) return auth === `Bearer ${VERCEL_TOKEN}`;
  return auth === `Bearer ${RENDER_KEY}`;
}

const server = http.createServer((req, res) => {
  const url = req.url || '';
  const path = url.split('?')[0];
  const query = new URLSearchParams(url.split('?')[1] || '');

  const send = (code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (path === '/__counters') return send(200, counters);
  if (path === '/__reset') { for (const k of Object.keys(counters)) delete counters[k]; return send(200, { ok: true }); }

  if (!guard(req)) {
    if (path.startsWith('/v6/') || path.startsWith('/v9/')) {
      return send(401, { error: { code: 'TOKEN_MISMATCH', message: 'Invalid token' } });
    }
    return send(401, { message: 'Unauthorized' });
  }

  const bump = (k: string) => { counters[k] = (counters[k] || 0) + 1; };

  if (path === '/v6/deployments' && req.method === 'GET') {
    bump('vercel.deployments');
    return send(200, { deployments: vercelDeployments, pagination: { count: String(vercelDeployments.length) } });
  }
  if (path.startsWith('/v9/projects/') && req.method === 'GET') {
    bump('vercel.projects');
    return send(200, vercelProject);
  }
  // Render deploys/events come from the service-owned object as a cursor
  // envelope — exactly like the real API. Only serve them for a known service.
  const isRenderService = path.startsWith('/v1/services/');
  if (isRenderService && req.method === 'GET') {
    const rest = path.replace('/v1/services/', '');
    const m = rest.match(/^([^/]+)(\/.*)?$/);
    const svcId = m ? m[1] : '';
    const sub = m ? m[2] || '' : '';
    if (svcId !== renderService.id) return send(404, { message: 'Service not found' });
    if (sub === '/deploys') {
      bump('render.deploys');
      return send(200, renderDeploys);
    }
    if (sub === '/events') {
      bump('render.events');
      return send(200, renderEvents);
    }
    if (sub === '') {
      bump('render.service');
      return send(200, renderService);
    }
    // /logs intentionally NOT served here — the real API has no such path;
    // logs live at the top-level /v1/logs endpoint.
  }

  // ─── Render logs (top-level /v1/logs — matches the real Render API) ──────
  if (path === '/v1/logs' && req.method === 'GET') {
    bump('render.logs');
    const resource = query.get('resource') || '';
    if (resource !== renderService.id) return send(404, { message: 'Resource not found' });
    const limit = Math.min(100, Number(query.get('limit') || 20));
    const endTime = query.get('endTime');
    let slice = renderLogs;
    if (endTime) slice = renderLogs.filter((l: any) => l.timestamp < endTime);
    const page = slice.slice(0, limit);
    const hasMore = slice.length > limit;
    const oldest = page.length ? page[page.length - 1].timestamp : renderLogs[renderLogs.length - 1].timestamp;
    return send(200, {
      logs: page,
      hasMore,
      nextStartTime: renderLogs[0].timestamp,
      nextEndTime: oldest,
    });
  }
  return send(404, { message: 'Not found in mock' });
});

server.listen(PORT, () => {
  console.log(`[MOCK] Vercel+Render provider server on http://localhost:${PORT}`);
  console.log(`[MOCK] VERCEL_TOKEN=${VERCEL_TOKEN}  RENDER_API_KEY=${RENDER_KEY}`);
  console.log(`[MOCK] ${vercelDeployments.length} vercel deploys, ${renderDeploys.length} render deploys, ${renderLogs.length} log lines`);
});
// ─── Render logs (returned ASCENDING — service must sort newest first) ─────
// Real /v1/logs entries carry `id`, `labels[]`, `message`, `timestamp`.
const LOG_COUNT = 250;
const renderLogs = Array.from({ length: LOG_COUNT }, (_, i) => ({
  id: `log_${LOG_COUNT - 1 - i}`,
  labels: [
    { name: 'resource', value: renderService.id },
    { name: 'instance', value: `${renderService.id}-mock` },
    { name: 'level', value: i % 13 === 0 ? 'error' : 'info' },
    { name: 'type', value: 'app' },
  ],
  message: i === 0 ? '[INFO] Server started listening on port 5000' : `[DEPLOY INTELLIGENCE] synthetic log line ${i} for E2E verification`,
  timestamp: iso(now - i * 60_000),
}));