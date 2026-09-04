import axios from 'axios';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'uITMPp8dy9Fo2TCG6MlwZsj0APRP0XT/Iri4gZS342/y9FmM3fIyIo6P8sZNYqR/';

/**
 * LIVE DEPLOYMENT INTELLIGENCE ISOLATION VERIFICATION SUITE
 *
 * Mirrors verify-github-isolation.ts:
 *   1. Members of a project's team can query Deployment Intelligence for that project.
 *   2. A member of another team is rejected with 403 before any provider call.
 *   3. Unauthenticated requests are rejected with 401.
 *   4. Unknown projects return404.
 *   5. Shared-team members CAN access each other's projects.
 *   6. Responses never leak VERCEL_TOKEN / RENDER_API_KEY values.
 *
 * Run with the backend running: npx ts-node src/scripts/verify-deploy-isolation.ts
 */
async function runVerification() {
  const report: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    report.push(msg);
  };

  log('================================================================');
  log('LIVE DEPLOYMENT INTELLIGENCE ISOLATION VERIFICATION SUITE');
  log('================================================================\n');

  try {
    const timestamp = Date.now();
    const emailA = `deploy_a_${timestamp}@liveverify.com`;
    const emailB = `deploy_b_${timestamp}@liveverify.com`;
    const password = 'Password123!';
    const passwordHash = await bcrypt.hash(password, 10);

    // Step 1: Create fresh accounts
    log('--- STEP 1: Creating fresh Account A and Account B ---');
    const userA = await prisma.user.create({
      data: { name: 'Deploy User A', email: emailA, passwordHash, role: 'STUDENT' },
    });
    const tokenA = jwt.sign({ id: userA.id, email: userA.email, name: userA.name, role: userA.role }, JWT_SECRET, { expiresIn: '1h' });
    log(`[+] Created Account A: ID ${userA.id}`);

    const userB = await prisma.user.create({
      data: { name: 'Deploy User B', email: emailB, passwordHash, role: 'STUDENT' },
    });
    const tokenB = jwt.sign({ id: userB.id, email: userB.email, name: userB.name, role: userB.role }, JWT_SECRET, { expiresIn: '1h' });
    log(`[+] Created Account B: ID ${userB.id}`);

    // Step 2: Teams + Projects
    log('\n--- STEP 2: Creating Teams and Projects ---');
    const resTeamA = await axios.post(`${BASE_URL}/api/teams/create`, { name: 'Deploy Team Alpha' }, { headers: { Authorization: `Bearer ${tokenA}` } });
    const projA = await axios.post(`${BASE_URL}/api/projects/create`, { title: 'Deploy Project A', description: 'A', teamId: resTeamA.data.team.id }, { headers: { Authorization: `Bearer ${tokenA}` } });
    const projAId = projA.data.project ? projA.data.project.id : projA.data.id;

    const resTeamB = await axios.post(`${BASE_URL}/api/teams/create`, { name: 'Deploy Team Beta' }, { headers: { Authorization: `Bearer ${tokenB}` } });
    const projB = await axios.post(`${BASE_URL}/api/projects/create`, { title: 'Deploy Project B', description: 'B', teamId: resTeamB.data.team.id }, { headers: { Authorization: `Bearer ${tokenB}` } });
    const projBId = projB.data.project ? projB.data.project.id : projB.data.id;

    log(`[+] Project A: ${projAId}, Project B: ${projBId}`);

    // Step 2b: Configure per-project deploy provider ids (same path Project
    // Settings uses). Without these the endpoints intentionally return 404
    // ("Deployment not configured for this project"), which would mask the
    // access-control checks below.
    log('\n--- STEP 2b: Configure deploy provider ids per project ---');
    await axios.patch(`${BASE_URL}/api/projects/${projAId}/deploy-settings`,
      { vercelProjectId: 'prj_proj-a-vercel', renderServiceId: 'srv_proj-a-render' },
      { headers: { Authorization: `Bearer ${tokenA}` } });
    await axios.patch(`${BASE_URL}/api/projects/${projBId}/deploy-settings`,
      { vercelProjectId: 'prj_proj-b-vercel', renderServiceId: 'srv_proj-b-render' },
      { headers: { Authorization: `Bearer ${tokenB}` } });
    log('[+] Projects configured with per-project provider ids');

    // Step 3: Member access. With per-project ids configured, the member
    // request returns 200 when the provider is reachable/configured, or 503 if
    // the provider call itself fails (token missing/unable to reach endpoint).
    // ISOLATION cares about 4xx auth codes, not 2xx/503 provider reachability.
    log('\n--- STEP 3: Member access on own projects ---');
    const memberARes = await axios.get(`${BASE_URL}/api/deploy-intelligence/vercel/${projAId}`, { headers: { Authorization: `Bearer ${tokenA}` }, validateStatus: () => true });
    const memberBRes = await axios.get(`${BASE_URL}/api/deploy-intelligence/render/${projBId}`, { headers: { Authorization: `Bearer ${tokenB}` }, validateStatus: () => true });
    const memberLogs = await axios.get(`${BASE_URL}/api/deploy-intelligence/render/${projBId}/logs`, { headers: { Authorization: `Bearer ${tokenB}` }, validateStatus: () => true });
    log(`[+] Member A → Vercel: HTTP ${memberARes.status}; Member B → Render: HTTP ${memberBRes.status}; Logs: HTTP ${memberLogs.status}`);
    if ([200, 503].includes(memberARes.status) && [200, 503].includes(memberBRes.status) && [200, 503].includes(memberLogs.status)) {
      log('✅ Members can reach their own project deployment intelligence (200 data / 503 unavailable).');
    } else {
      log(`❌ Unexpected status on member access: ${memberARes.status}/${memberBRes.status}/${memberLogs.status}`);
    }

    // Step 4: Cross-account access must be blocked
    log('\n--- STEP 4: Cross-account access (Account B → Project A) ---');
    const crossCodes: number[] = [];
    for (const path of [
      `/api/deploy-intelligence/vercel/${projAId}`,
      `/api/deploy-intelligence/render/${projAId}`,
      `/api/deploy-intelligence/render/${projAId}/logs`,
    ]) {
      try {
        await axios.get(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${tokenB}` } });
        crossCodes.push(200);
      } catch (e: any) {
        crossCodes.push(e.response?.status ?? 0);
      }
    }
    log(`    Cross-account statuses: ${crossCodes.join(', ')}`);
    if (crossCodes.every((c) => c === 403)) {
      log('✅ PASS: Account B rejected with 403 on ALL Project A deployment-intelligence endpoints.');
    } else {
      log(`❌ SECURITY VULNERABILITY: Account B reached Project A data (${crossCodes.join(', ')})`);
    }

    // Step 5: Unauthenticated request
    log('\n--- STEP 5: Unauthenticated request ---');
    try {
      await axios.get(`${BASE_URL}/api/deploy-intelligence/vercel/${projAId}`);
      log('❌ Unauthenticated request was NOT rejected');
    } catch (e: any) {
      log(`✅ PASS: Unauthenticated rejected with HTTP ${e.response?.status ?? e.message}`);
    }

    // Step 6: Unknown project id
    log('\n--- STEP 6: Unknown project id ---');
    try {
      await axios.get(`${BASE_URL}/api/deploy-intelligence/vercel/nonexistent-project-123`, { headers: { Authorization: `Bearer ${tokenA}` } });
      log('❌ Unknown project id was NOT rejected');
    } catch (e: any) {
      log(`✅ PASS: Unknown project rejected with HTTP ${e.response?.status ?? e.message}`);
    }

    // Step 7: No token leakage in successful member responses
    log('\n--- STEP 7: Token-leak check ---');
    const secrets = [process.env.VERCEL_TOKEN || '', process.env.VERCEL_API_TOKEN || '', process.env.RENDER_API_KEY || '', process.env.BREVO_API_KEY || '']
      .map((s) => s.trim())
      .filter(Boolean);
    const leakCadidates = [memberARes.data, memberBRes.data, memberLogs.data];
    const leaks = secrets.filter((s) => leakCadidates.some((d) => JSON.stringify(d).includes(s)));
    if (leaks.length === 0) {
      log('✅ PASS: No provider API token appears in any Deployment Intelligence response.');
    } else {
      log(`❌ LEAK DETECTED: ${leaks.length} token value(s) present in responses`);
    }

    // Step 8: Shared team access
    log('\n--- STEP 8: Shared team access ---');
    const resShared = await axios.post(`${BASE_URL}/api/teams/create`, { name: 'Deploy Shared Team' }, { headers: { Authorization: `Bearer ${tokenA}` } });
    const sharedTeam = resShared.data.team;
    await axios.post(`${BASE_URL}/api/teams/join`, { inviteCode: sharedTeam.inviteCode }, { headers: { Authorization: `Bearer ${tokenB}` } });
    const sharedProj = await axios.post(`${BASE_URL}/api/projects/create`, { title: 'Deploy Shared Project', description: 'S', teamId: sharedTeam.id }, { headers: { Authorization: `Bearer ${tokenA}` } });
    const sharedProjId = sharedProj.data.project ? sharedProj.data.project.id : sharedProj.data.id;
    await axios.patch(`${BASE_URL}/api/projects/${sharedProjId}/deploy-settings`,
      { vercelProjectId: 'prj_shared-vercel', renderServiceId: 'srv_shared-render' },
      { headers: { Authorization: `Bearer ${tokenA}` } });

    const sharedA = await axios.get(`${BASE_URL}/api/deploy-intelligence/render/${sharedProjId}`, { headers: { Authorization: `Bearer ${tokenA}` }, validateStatus: () => true });
    const sharedB = await axios.get(`${BASE_URL}/api/deploy-intelligence/render/${sharedProjId}/logs`, { headers: { Authorization: `Bearer ${tokenB}` }, validateStatus: () => true });
    log(`    Shared project statuses: A=${sharedA.status}, B(logs)=${sharedB.status}`);
    if ([200, 503].includes(sharedA.status) && [200, 503].includes(sharedB.status)) {
      log('✅ PASS: Shared team members can both access the shared project deployment intelligence.');
    } else {
      log('❌ Shared team access check failed.');
    }

    log('\n================================================================');
    log('DEPLOYMENT INTELLIGENCE ISOLATION VERIFICATION COMPLETE');
    log('================================================================');

    // Cleanup test accounts / teams
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await prisma.team.deleteMany({ where: { name: { startsWith: 'Deploy Team' } } });
    await prisma.team.deleteMany({ where: { name: 'Deploy Shared Team' } });
    log('Cleaned up test accounts/teams.');
  } catch (err: any) {
    console.error('Verification run failed:', err.response?.data || err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runVerification();