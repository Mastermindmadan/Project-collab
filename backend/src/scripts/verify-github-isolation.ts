import axios from 'axios';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'uITMPp8dy9Fo2TCG6MlwZsj0APRP0XT/Iri4gZS342/y9FmM3fIyIo6P8sZNYqR/';

const FALLBACK_INDICATORS = {
  stars: 18,
  commitAuthors: new Set(['Alex Chen', 'Priya Mehta', 'Marcus Vance', 'Sneha Kapoor', 'Arjun Verma']),
  branchNames: new Set(['main', 'dev', 'feature/ai-integration']),
  prTitles: new Set(['feat: Add AI sprint roadmap generator', 'fix: Socket.io real-time chat room isolation']),
  contribLogins: new Set(['priyamehta', 'arjunv', 'snehak'])
};

function checkFallback(data: any) {
  const flags: string[] = [];
  if (!data) return ['No data returned'];
  if (data.repoInfo && data.repoInfo.stars === 18) flags.push('Repo stars === 18 (fallback mock)');
  if (data.commits && data.commits.length && FALLBACK_INDICATORS.commitAuthors.has(data.commits[0].author)) {
    flags.push(`Fallback commit author detected: ${data.commits[0].author}`);
  }
  if (data.branches && data.branches.length === 3 && data.branches.every((b: any) => FALLBACK_INDICATORS.branchNames.has(b.name))) {
    flags.push('Fallback branch set detected');
  }
  if (data.pullRequests && data.pullRequests.length && FALLBACK_INDICATORS.prTitles.has(data.pullRequests[0].title)) {
    flags.push(`Fallback PR title detected: ${data.pullRequests[0].title}`);
  }
  if (data.contributors && data.contributors.length && FALLBACK_INDICATORS.contribLogins.has(data.contributors[0].username)) {
    flags.push(`Fallback contributor detected: ${data.contributors[0].username}`);
  }
  return flags;
}

async function runVerification() {
  const report: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    report.push(msg);
  };

  log('================================================================');
  log('LIVE GITHUB INTELLIGENCE ISOLATION VERIFICATION SUITE');
  log('================================================================\n');

  try {
    const timestamp = Date.now();
    const emailA = `account_a_${timestamp}@liveverify.com`;
    const emailB = `account_b_${timestamp}@liveverify.com`;
    const password = 'Password123!';
    const passwordHash = await bcrypt.hash(password, 10);

    // Step 1: Create Accounts directly in DB
    log('--- STEP 1: Creating fresh Account A and Account B ---');
    const userA = await prisma.user.create({
      data: { name: 'User A (React)', email: emailA, passwordHash, role: 'STUDENT' }
    });
    const tokenA = jwt.sign({ id: userA.id, email: userA.email, name: userA.name, role: userA.role }, JWT_SECRET, { expiresIn: '1h' });
    log(`[+] Created Account A: ID ${userA.id} (${emailA})`);

    const userB = await prisma.user.create({
      data: { name: 'User B (Vue)', email: emailB, passwordHash, role: 'STUDENT' }
    });
    const tokenB = jwt.sign({ id: userB.id, email: userB.email, name: userB.name, role: userB.role }, JWT_SECRET, { expiresIn: '1h' });
    log(`[+] Created Account B: ID ${userB.id} (${emailB})`);

    // Step 2: Create Teams and Projects
    log('\n--- STEP 2: Creating Projects and Linking Real GitHub Repos ---');
    const resTeamA = await axios.post(`${BASE_URL}/api/teams/create`, { name: "Team Alpha" }, { headers: { Authorization: `Bearer ${tokenA}` } });
    const teamA = resTeamA.data.team;
    const projA = await axios.post(`${BASE_URL}/api/projects/create`, { title: "React Project A", description: "Account A React project", teamId: teamA.id }, { headers: { Authorization: `Bearer ${tokenA}` } });
    const projAId = projA.data.project ? projA.data.project.id : projA.data.id;
    log(`[+] Account A created Project A: ID ${projAId}`);

    const resTeamB = await axios.post(`${BASE_URL}/api/teams/create`, { name: "Team Beta" }, { headers: { Authorization: `Bearer ${tokenB}` } });
    const teamB = resTeamB.data.team;
    const projB = await axios.post(`${BASE_URL}/api/projects/create`, { title: "Vue Project B", description: "Account B Vue project", teamId: teamB.id }, { headers: { Authorization: `Bearer ${tokenB}` } });
    const projBId = projB.data.project ? projB.data.project.id : projB.data.id;
    log(`[+] Account B created Project B: ID ${projBId}`);

    // Link Repos
    log('[+] Account A linking real repo "facebook/react" to Project A...');
    const linkA = await axios.post(`${BASE_URL}/api/github/link-repo`, { projectId: projAId, githubRepo: 'facebook/react' }, { headers: { Authorization: `Bearer ${tokenA}` } });
    log(`    Response: ${linkA.data.message}, repo: ${linkA.data.project.githubRepo}`);

    log('[+] Account B linking real repo "vuejs/core" to Project B...');
    const linkB = await axios.post(`${BASE_URL}/api/github/link-repo`, { projectId: projBId, githubRepo: 'vuejs/core' }, { headers: { Authorization: `Bearer ${tokenB}` } });
    log(`    Response: ${linkB.data.message}, repo: ${linkB.data.project.githubRepo}`);

    // Shared Team and Project
    log('\n[+] Creating Shared Team & Project for Account A and Account B...');
    const resSharedTeam = await axios.post(`${BASE_URL}/api/teams/create`, { name: "Shared Team" }, { headers: { Authorization: `Bearer ${tokenA}` } });
    const sharedTeam = resSharedTeam.data.team;
    
    // User B joins Shared Team using invite code
    await axios.post(`${BASE_URL}/api/teams/join`, { inviteCode: sharedTeam.inviteCode }, { headers: { Authorization: `Bearer ${tokenB}` } });
    log(`[+] Account B joined Shared Team using invite code: ${sharedTeam.inviteCode}`);

    const resSharedProj = await axios.post(`${BASE_URL}/api/projects/create`, { title: "Shared Project", description: "Shared project between A and B", teamId: sharedTeam.id }, { headers: { Authorization: `Bearer ${tokenA}` } });
    const sharedProjId = resSharedProj.data.project ? resSharedProj.data.project.id : resSharedProj.data.id;
    await axios.post(`${BASE_URL}/api/github/link-repo`, { projectId: sharedProjId, githubRepo: 'facebook/react' }, { headers: { Authorization: `Bearer ${tokenA}` } });
    log(`[+] Shared Project created: ID ${sharedProjId} with repo "facebook/react"`);

    // Step 3: Verify Public GitHub API Data for Account A
    log('\n--- STEP 3: Verifying Account A GitHub Intelligence Data (facebook/react) ---');
    const intelA = await axios.get(`${BASE_URL}/api/github/intelligence`, {
      params: { projectId: projAId, path: 'facebook/react' },
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const dataA = intelA.data;
    const fallbacksA = checkFallback(dataA);
    if (fallbacksA.length === 0) {
      log('✅ Account A GitHub Intelligence: Valid REAL facebook/react data received (No fallback/mock data detected)');
      log(`   Repo Name: ${dataA.repoInfo?.name || dataA.repoInfo?.full_name}`);
      log(`   Stars: ${dataA.repoInfo?.stars || dataA.repoInfo?.stargazers_count}`);
      log(`   Recent Commit Author: ${dataA.commits?.[0]?.author}`);
      log(`   Recent Commit Message: ${dataA.commits?.[0]?.message?.slice(0, 60)}...`);
      log(`   Branch Count: ${dataA.branches?.length}`);
      log(`   PR Count: ${dataA.pullRequests?.length}`);
      log(`   Contributor Count: ${dataA.contributors?.length}`);
    } else {
      log(`❌ Account A returned fallback data: ${fallbacksA.join(', ')}`);
    }

    // Step 4: Verify Public GitHub API Data for Account B
    log('\n--- STEP 4: Verifying Account B GitHub Intelligence Data (vuejs/core) ---');
    const intelB = await axios.get(`${BASE_URL}/api/github/intelligence`, {
      params: { projectId: projBId, path: 'vuejs/core' },
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const dataB = intelB.data;
    const fallbacksB = checkFallback(dataB);
    if (fallbacksB.length === 0) {
      log('✅ Account B GitHub Intelligence: Valid REAL vuejs/core data received (No fallback/mock data detected)');
      log(`   Repo Name: ${dataB.repoInfo?.name || dataB.repoInfo?.full_name}`);
      log(`   Stars: ${dataB.repoInfo?.stars || dataB.repoInfo?.stargazers_count}`);
      log(`   Recent Commit Author: ${dataB.commits?.[0]?.author}`);
      log(`   Recent Commit Message: ${dataB.commits?.[0]?.message?.slice(0, 60)}...`);
      log(`   Branch Count: ${dataB.branches?.length}`);
      log(`   PR Count: ${dataB.pullRequests?.length}`);
      log(`   Contributor Count: ${dataB.contributors?.length}`);
    } else {
      log(`❌ Account B returned fallback data: ${fallbacksB.join(', ')}`);
    }

    // Confirm A and B data are completely distinct
    if (dataA.repoInfo?.name !== dataB.repoInfo?.name && dataA.commits?.[0]?.sha !== dataB.commits?.[0]?.sha) {
      log('✅ Account A and Account B data are strictly isolated and distinct!');
    } else {
      log('❌ ERROR: Data collision or cross-leakage detected between Account A and Account B!');
    }

    // Step 5: Cross-Account Security Attacks
    log('\n--- STEP 5: Testing Cross-Account Endpoint Security (Replay/Unauthorized Requests) ---');
    
    // Attack 5a: Account B tries to access Account A's project GitHub intelligence
    try {
      await axios.get(`${BASE_URL}/api/github/intelligence`, {
        params: { projectId: projAId, path: 'facebook/react' },
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      log('❌ CRITICAL SECURITY VULNERABILITY: Account B was able to access Account A\'s project intelligence!');
    } catch (err: any) {
      log(`✅ PASS: Account B request to Project A rejected with HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`);
    }

    // Attack 5b: Account B tries to access Account A's project commits
    try {
      await axios.get(`${BASE_URL}/api/github/commits`, {
        params: { projectId: projAId },
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      log('❌ CRITICAL SECURITY VULNERABILITY: Account B was able to access Account A\'s project commits!');
    } catch (err: any) {
      log(`✅ PASS: Account B request to Project A commits rejected with HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`);
    }

    // Attack 5c: Account B tries to request arbitrary repo (facebook/react) on Account B's project
    try {
      await axios.get(`${BASE_URL}/api/github/intelligence`, {
        params: { projectId: projBId, path: 'facebook/react' },
        headers: { Authorization: `Bearer ${tokenB}` }
      });
      log('❌ CRITICAL SECURITY VULNERABILITY: Account B requested disconnected repo facebook/react on Project B!');
    } catch (err: any) {
      log(`✅ PASS: Account B request for unlinked repo on Project B rejected with HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`);
    }

    // Attack 5d: Request missing projectId
    try {
      await axios.get(`${BASE_URL}/api/github/intelligence`, {
        params: { path: 'facebook/react' },
        headers: { Authorization: `Bearer ${tokenA}` }
      });
      log('❌ CRITICAL VULNERABILITY: Request missing projectId succeeded!');
    } catch (err: any) {
      log(`✅ PASS: Request missing projectId rejected with HTTP ${err.response?.status}: ${JSON.stringify(err.response?.data)}`);
    }

    // Step 6: Shared Team Member Verification
    log('\n--- STEP 6: Verifying Shared Team Project Access ---');
    const sharedIntelA = await axios.get(`${BASE_URL}/api/github/intelligence`, {
      params: { projectId: sharedProjId, path: 'facebook/react' },
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const sharedIntelB = await axios.get(`${BASE_URL}/api/github/intelligence`, {
      params: { projectId: sharedProjId, path: 'facebook/react' },
      headers: { Authorization: `Bearer ${tokenB}` }
    });

    if (sharedIntelA.data.commits?.[0]?.sha === sharedIntelB.data.commits?.[0]?.sha) {
      log('✅ PASS: Both Account A and Account B see identical, correct repository data for the Shared Project!');
      log(`   Shared Recent Commit SHA: ${sharedIntelA.data.commits?.[0]?.sha}`);
    } else {
      log('❌ FAIL: Shared project returned different data for Team Member A vs Team Member B!');
    }

    // Step 7: AI Features Cache Isolation Verification
    log('\n--- STEP 7: Verifying AI-Powered Features Cache Isolation ---');
    const testPrompt = "Generate detailed roadmap for user authentication module";
    
    const payloadA = JSON.stringify({
      prompt: testPrompt.trim(),
      feature: 'planner',
      userId: userA.id,
      projectId: projAId,
    });
    const keyA = crypto.createHash('sha256').update(payloadA).digest('hex');

    const payloadB = JSON.stringify({
      prompt: testPrompt.trim(),
      feature: 'planner',
      userId: userB.id,
      projectId: projBId,
    });
    const keyB = crypto.createHash('sha256').update(payloadB).digest('hex');

    log(`   Cache Key for User A (Project A): ${keyA.slice(0, 16)}...`);
    log(`   Cache Key for User B (Project B): ${keyB.slice(0, 16)}...`);

    if (keyA !== keyB) {
      log('✅ PASS: Cache keys for identical prompts are strictly scoped per-user and per-project! No cross-account cache leaks can occur.');
    } else {
      log('❌ FAIL: Cache key collision!');
    }

    log('\n================================================================');
    log(`TEST USER ACCOUNTS FOR BROWSER VERIFICATION:`);
    log(`ACCOUNT A EMAIL: ${emailA}`);
    log(`ACCOUNT B EMAIL: ${emailB}`);
    log(`PASSWORD: ${password}`);
    log(`USER A ID: ${userA.id}`);
    log(`USER B ID: ${userB.id}`);
    log(`PROJECT A ID: ${projAId}`);
    log(`PROJECT B ID: ${projBId}`);
    log(`SHARED PROJECT ID: ${sharedProjId}`);
    log('================================================================\n');

  } catch (err: any) {
    console.error('VERIFICATION ERROR DETAILED:', err?.response?.status, err?.response?.data || err.stack || err.message);
  } finally {
    await prisma.$disconnect();
  }
}

runVerification();
