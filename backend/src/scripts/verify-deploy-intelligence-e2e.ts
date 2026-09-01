import axios from 'axios';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';

const BASE = process.env.BACKEND_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'uITMPp8dy9Fo2TCG6MlwZsj0APRP0XT/Iri4gZS342/y9FmM3fIyIo6P8sZNYqR/';
const MOCK = 'http://localhost:8899';
const SECRETS = ['dummy-vercel-token-abc123', 'rnd_dummy-render-key-xyz789'];

let failures = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (cond) console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`);
  else { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failures++; }
};

/**
 * LIVE END-TO-END VERIFICATION of Deployment Intelligence against local MOCK
 * Vercel+Render providers. scripts/mock-deploy-providers.ts serves BOTH APIs
 * on :8899 with realistic payloads (success/building/failed/queued deploys,
 * missing-meta edge cases, 250 paginated log lines).
 *
 * Run procedure (PowerShell, from backend/):
 *   1. npx ts-node src/scripts/mock-deploy-providers.ts          # window 1 — keep running
 *   2. $env:VERCEL_TOKEN="dummy-vercel-token-abc123"; $env:VERCEL_PROJECT_ID="prj_dummy-vercel-project"; $env:RENDER_API_KEY="rnd_dummy-render-key-xyz789"; $env:RENDER_SERVICE_ID="srv_dummy-render-service"; $env:VERCEL_API_BASE="http://localhost:8899"; $env:RENDER_API_BASE="http://localhost:8899"
 *      npm run dev                                               # window 2 (dotenv will NOT override these)
 *   3. npx ts-node src/scripts/verify-deploy-intelligence-e2e.ts # window 3
 *      → expect "=== RESULT: ALL PASS ===" and exit code 0
 *
 * With real credentials in .env and NO *_API_BASE overrides, the same endpoints
 * hit the production Vercel/Render APIs instead — code path is identical.
 */
async function run() {
  console.log('================================================================');
  console.log('DEPLOYMENT INTELLIGENCE E2E VERIFICATION (mock providers)');
  console.log('================================================================');

  try {
    // ── Setup ──────────────────────────────────────────────────────────────
    const email = `deploy_e2e_${Date.now()}@liveverify.com`;
    const user = await prisma.user.create({ data: { name: 'E2E Deploy', email, passwordHash: await bcrypt.hash('Password123!', 10), role: 'STUDENT' } });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    const teamRes = await axios.post(`${BASE}/api/teams/create`, { name: 'E2E Deploy Team' }, { headers: { Authorization: `Bearer ${token}` } });
    const projRes = await axios.post(`${BASE}/api/projects/create`, { title: 'E2E Deploy Project', description: 'x', teamId: teamRes.data.team.id }, { headers: { Authorization: `Bearer ${token}` } });
    const projectId = projRes.data.project ? projRes.data.project.id : projRes.data.id;

    await axios.post(`${MOCK}/__reset`);
    const auth = { headers: { Authorization: `Bearer ${token}` } };

    // ── VERCEL ─────────────────────────────────────────────────────────────
    console.log('\n--- Vercel (/api/deploy-intelligence/vercel/:projectId) ---');
    const v = (await axios.get(`${BASE}/api/deploy-intelligence/vercel/${projectId}`, auth)).data;
    ok(v.provider === 'vercel' && v.configured === true, 'configured:true', `message=${v.message}`);
    ok(v.message === null, 'no error message');
    ok(v.projectName === 'project-collab-one', 'projectName', v.projectName);
    ok(v.liveUrl === 'project-collab-one.vercel.app' && v.liveUrlUnavailable === false, 'liveUrl from targets.production', v.liveUrl);
    ok(v.deployments.length === 5, '5 deploys returned', `len=${v.deployments.length}`);

    const d0 = v.deployments[0];
    ok(d0.status === 'success' && d0.id === 'dpl_v1_ready', 'latest deploy READY→success', d0.id);
    ok(d0.branch === 'main' && d0.commitSha === '9f4c2ab', 'branch+short sha', `${d0.branch}@${d0.commitSha}`);
    ok(d0.commitMessage === 'feat: add deployment intelligence', 'commit message', d0.commitMessage);
    ok(d0.durationMs === 45000 && d0.durationUnavailable === false, 'duration 45s', `${d0.durationMs}ms`);
    ok(v.deployments[1].status === 'building', 'BUILDING→building', v.deployments[1].id);
    ok(v.deployments[2].status === 'failed', 'ERROR→failed', v.deployments[2].id);
    ok(v.deployments[3].status === 'queued', 'QUEUED→queued', v.deployments[3].id);
    const d4 = v.deployments[4];
    ok(d4.status === 'success' && d4.branch === null && d4.branchUnavailable && d4.commitShaUnavailable && d4.commitMessageUnavailable,
      'no-meta deploy → unavailable flags', `branch=${d4.branch}`);
    ok(v.current?.status === 'success' && v.current?.branch === 'main' && v.current?.commitSha === '9f4c2ab', 'current derived from latest');
    ok(v.current?.deployedAt === d0.createdAt, 'current.deployedAt === latest.createdAt');

    // ── RENDER ─────────────────────────────────────────────────────────────
    console.log('\n--- Render (/api/deploy-intelligence/render/:projectId) ---');
    const r = (await axios.get(`${BASE}/api/deploy-intelligence/render/${projectId}`, auth)).data;
    ok(r.provider === 'render' && r.configured === true, 'configured:true', `message=${r.message}`);
    ok(r.message === null, 'no error message');
    ok(r.serviceId === 'srv_dummy-render-service', 'serviceId', r.serviceId);
    ok(r.deploys.length === 5, '5 deploys', `len=${r.deploys.length}`);
    const rd0 = r.deploys[0];
    ok(rd0.status === 'success' && rd0.id === 'dep_live_1', 'live→success', rd0.id);
    ok(rd0.branch === 'main' && rd0.commitSha === '9f4c2ab', 'branch+short sha', `${rd0.branch}@${rd0.commitSha}`);
    ok(rd0.commitMessage === 'feat: add deployment intelligence', 'commit message', rd0.commitMessage);
    ok(rd0.durationMs === 95000 && rd0.durationUnavailable === false, 'duration 95s', `${rd0.durationMs}ms`);
    ok(r.deploys[1].status === 'building', 'build_in_progress→building');
    ok(r.deploys[2].status === 'failed', 'deploy_failed→failed');
    ok(r.deploys[3].status === 'canceled', 'canceled→canceled');
    ok(r.deploys[4].status === 'success' && r.deploys[4].branchUnavailable && r.deploys[4].commitShaUnavailable, 'no-commit deploy → unavailable flags');
    ok(r.current?.status === 'success' && r.current?.commitSha === '9f4c2ab', 'current derived from latest deploy');
    ok(r.events.length === 4, '4 events', `len=${r.events.length}`);
    ok(r.events[0].type === 'service.updated' && r.events[0].details === 'Deploy completed successfully', 'event type+details');
    ok(r.events[3].details === null && r.events[3].detailsUnavailable === true, 'event without details → unavailable flag');

    // ── RENDER LOGS ────────────────────────────────────────────────────────
    console.log('\n--- Render logs (/api/deploy-intelligence/render/:projectId/logs) ---');
    const l0 = (await axios.get(`${BASE}/api/deploy-intelligence/render/${projectId}/logs?limit=100`, auth)).data;
    ok(l0.configured === true && l0.message === null, 'logs configured + no error');
    ok(l0.logs.length === 100 && l0.hasMore === true && l0.nextOffset === 100, 'page1: 100 lines, hasMore', `next=${l0.nextOffset}`);
    ok(l0.logs[0].id === 'log_249', 'most-recent-first (newest id first)', l0.logs[0].id);
    ok(l0.logs[0].updatedAt >= l0.logs[99].updatedAt, 'timestamps descending (newest first)');
    const ts = l0.logs.map((x: any) => String(x.updatedAt));
    ok(ts.every((t: string, i: number) => i === 0 || t <= ts[i - 1]), 'full page sorted newest→oldest');
    ok(l0.logs[13].type === 'error', 'error-type line preserved');
    const l1 = (await axios.get(`${BASE}/api/deploy-intelligence/render/${projectId}/logs?limit=100&offset=100`, auth)).data;
    ok(l1.logs.length === 100 && l1.nextOffset === 200 && l1.hasMore === true, 'page2: nextOffset 200');
    const l2 = (await axios.get(`${BASE}/api/deploy-intelligence/render/${projectId}/logs?limit=100&offset=200`, auth)).data;
    ok(l2.logs.length === 50 && l2.hasMore === false && l2.nextOffset === null, 'page3: last page (50)');
    ok(l0.logs[0].id !== l1.logs[0].id && l1.logs[0].id !== l2.logs[0].id, 'pages are distinct');

    // ── CACHE ──────────────────────────────────────────────────────────────
    console.log('\n--- In-memory caching (30-45s TTL) ---');
    const countersAfterFirst = (await axios.get(`${MOCK}/__counters`)).data;
    const v2 = (await axios.get(`${BASE}/api/deploy-intelligence/vercel/${projectId}`, auth)).data;
    const r2 = (await axios.get(`${BASE}/api/deploy-intelligence/render/${projectId}`, auth)).data;
    const l0b = (await axios.get(`${BASE}/api/deploy-intelligence/render/${projectId}/logs?limit=100`, auth)).data;
    ok(v2.fetchedAt === v.fetchedAt, 'vercel cached (same fetchedAt)');
    ok(r2.fetchedAt === r.fetchedAt, 'render cached (same fetchedAt)');
    ok(l0b.fetchedAt === l0.fetchedAt, 'logs cached (same fetchedAt)');
    const countersAfterSecond = (await axios.get(`${MOCK}/__counters`)).data;
    ok(countersAfterSecond['vercel.deployments'] === countersAfterFirst['vercel.deployments'], 'vercel provider hit unchanged', `hits=${countersAfterSecond['vercel.deployments'] || 0}`);
    const logsHits = (countersAfterSecond['render.logs'] || 0) - (countersAfterFirst['render.logs'] || 0);
    ok(logsHits === 0, 'render logs provider hit unchanged');

    // ── TOKEN LEAK CHECK ───────────────────────────────────────────────────
    console.log('\n--- Secret non-leakage ---');
    const bodies = [v, r, l0, l1, l2].map((x) => JSON.stringify(x));
    const leaked = SECRETS.filter((s) => bodies.some((b) => b.includes(s)));
    ok(leaked.length === 0, 'no dummy tokens in any response', leaked.join(',') || 'clean');

    // ── Cleanup ────────────────────────────────────────────────────────────
    await prisma.user.deleteMany({ where: { email } });
    await prisma.team.deleteMany({ where: { name: 'E2E Deploy Team' } });
    console.log('\nCleaned up test user/team.');
  } catch (err: any) {
    console.error('E2E run failed:', err.response?.data || err.message);
    failures++;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n=== RESULT: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

run();