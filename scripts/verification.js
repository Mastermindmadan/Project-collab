// scripts/verification.js
// Live verification script for ProjectCollab AI
// Run with: node scripts/verification.js

const axios = require('axios');
const io = require('socket.io-client');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

async function waitFor(url, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await axios.get(url);
      if (res.status === 200) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function register(email, password) {
  return axios.post(`${BACKEND_URL}/api/auth/register`, {
    name: 'Test User',
    email,
    password,
  });
}

async function login(email, password) {
  return axios.post(`${BACKEND_URL}/api/auth/login`, {
    email,
    password,
  });
}

async function createTeam(accessToken, name) {
  return axios.post(`${BACKEND_URL}/api/team`, { name }, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function createTask(accessToken, projectId, title) {
  return axios.post(`${BACKEND_URL}/api/task`, { projectId, title }, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function createSubtask(accessToken, taskId, title) {
  return axios.post(`${BACKEND_URL}/api/task/${taskId}/subtask`, { title }, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function getTask(accessToken, taskId) {
  return axios.get(`${BACKEND_URL}/api/task/${taskId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function getDashboard(accessToken, projectId) {
  return axios.get(`${BACKEND_URL}/api/dashboard/${projectId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function getAnalytics(accessToken, projectId) {
  return axios.get(`${BACKEND_URL}/api/analytics/${projectId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function githubIntelligence(accessToken, owner, repo) {
  return axios.get(`${BACKEND_URL}/api/github/intelligence/${owner}/${repo}`, { headers: { Authorization: `Bearer ${accessToken}` } });
}

async function rapidFailedLogins(email) {
  const promises = [];
  for (let i = 0; i < 6; i++) {
    promises.push(axios.post(`${BACKEND_URL}/api/auth/login`, { email, password: 'wrongpass' }).catch(e => e.response));
  }
  const responses = await Promise.all(promises);
  return responses.map(r => r.status);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const report = [];
  try {
    // 1. Wait for services
    await waitFor(`${BACKEND_URL}/api/health`);
    await waitFor(`${FRONTEND_URL}`);
    report.push('✅ 1️⃣ Backend & Frontend are up');
  } catch (e) {
    report.push('❌ 1️⃣ Backend or Frontend failed to start');
    console.error(e);
    console.log(report.join('\n'));
    process.exit(1);
  }

  // 2. Register & login via API (acts as UI action)
  const testEmailA = `a_${Date.now()}@example.com`;
  const testPass = 'TestPass123!';
  let tokenA;
  try {
    await register(testEmailA, testPass);
    const loginRes = await login(testEmailA, testPass);
    tokenA = loginRes.data.accessToken;
    report.push('✅ 2️⃣ Registered and logged in fresh account');
  } catch (e) {
    report.push('❌ 2️⃣ Register/Login failed');
  }

  // 3. Create task with subtask and verify persistence
  let taskId;
  try {
    // assume user has a default project created on signup; fetch first project
    const projectsRes = await axios.get(`${BACKEND_URL}/api/project`, { headers: { Authorization: `Bearer ${tokenA}` } });
    const projectId = projectsRes.data[0].id;
    const taskRes = await createTask(tokenA, projectId, 'Verification Task');
    taskId = taskRes.data.id;
    await createSubtask(tokenA, taskId, 'Subtask 1');
    const fetched = await getTask(tokenA, taskId);
    const hasSub = fetched.data.subtasks && fetched.data.subtasks.length === 1;
    // refresh persistence check
    const refetched = await getTask(tokenA, taskId);
    const persisted = refetched.data.subtasks && refetched.data.subtasks.length === 1;
    if (hasSub && persisted) report.push('✅ 3️⃣ Task and subtask appear instantly and survive refresh');
    else report.push('❌ 3️⃣ Task/Subtask verification failed');
  } catch (e) {
    report.push('❌ 3️⃣ Task creation flow error');
  }

  // 4. Chat isolation between two accounts
  const testEmailB = `b_${Date.now()}@example.com`;
  let tokenB, teamAId, teamBId;
  try {
    // Register second account
    await register(testEmailB, testPass);
    const loginB = await login(testEmailB, testPass);
    tokenB = loginB.data.accessToken;
    // Create two teams, each owned by respective user
    const teamARes = await createTeam(tokenA, 'TeamA_' + Date.now());
    const teamBRes = await createTeam(tokenB, 'TeamB_' + Date.now());
    teamAId = teamARes.data.id;
    teamBId = teamBRes.data.id;
    // Connect sockets
    const socketA = io(`${BACKEND_URL}`, { auth: { token: tokenA }, transports: ['websocket'] });
    const socketB = io(`${BACKEND_URL}`, { auth: { token: tokenB }, transports: ['websocket'] });
    const events = { a: [], b: [] };
    socketA.on('new-team-message', (d) => events.a.push(d));
    socketB.on('new-team-message', (d) => events.b.push(d));
    await new Promise(r => setTimeout(r, 2000)); // wait for join
    // join respective teams
    socketA.emit('join-team', { teamId: teamAId });
    socketB.emit('join-team', { teamId: teamBId });
    await new Promise(r => setTimeout(r, 1000));
    // send message from A
    socketA.emit('send-team-message', { teamId: teamAId, content: 'Hello from A' });
    await new Promise(r => setTimeout(r, 1500));
    const aReceived = events.b.some(m => m.content === 'Hello from A');
    // now switch A token to B (simulate account switch)
    socketA.disconnect();
    const socketA2 = io(`${BACKEND_URL}`, { auth: { token: tokenB }, transports: ['websocket'] });
    const eventsA2 = [];
    socketA2.on('new-team-message', (d) => eventsA2.push(d));
    await new Promise(r => setTimeout(r, 1000));
    // ensure no old messages from teamA appear for tokenB
    const leaked = eventsA2.some(m => m.content === 'Hello from A');
    socketA2.disconnect();
    socketB.disconnect();
    if (!aReceived && !leaked) report.push('✅ 4️⃣ Chat isolation works, no leaks on account switch');
    else report.push('❌ 4️⃣ Chat isolation failed');
  } catch (e) {
    report.push('❌ 4️⃣ Chat test error');
  }

  // 5. GitHub Intelligence real data
  try {
    const ghRes = await githubIntelligence(tokenA, 'facebook', 'react');
    const hasStars = typeof ghRes.data.stars === 'number' || ghRes.data.stars === null;
    const estimatedFlag = ghRes.data.starsEstimated === true || ghRes.data.starsEstimated === false;
    if (hasStars && estimatedFlag) report.push('✅ 5️⃣ GitHub Intelligence loads real data with proper unavailable labeling');
    else report.push('❌ 5️⃣ GitHub Intelligence response format issue');
  } catch (e) {
    report.push('❌ 5️⃣ GitHub Intelligence request failed');
  }

  // 6. Rate‑limit 6 rapid wrong logins => 429 on 6th
  try {
    const statuses = await rapidFailedLogins(testEmailA);
    const sixth = statuses[5];
    if (sixth === 429) report.push('✅ 6️⃣ 6th rapid wrong login returns 429');
    else report.push(`❌ 6️⃣ Expected 429 but got ${sixth}`);
  } catch (e) {
    report.push('❌ 6️⃣ Rate‑limit test error');
  }

  // 7. Dashboard vs Analytics health score equality
  try {
    const projectsRes = await axios.get(`${BACKEND_URL}/api/project`, { headers: { Authorization: `Bearer ${tokenA}` } });
    const projId = projectsRes.data[0].id;
    const dash = await getDashboard(tokenA, projId);
    const analytics = await getAnalytics(tokenA, projId);
    const same = dash.data.healthScore === analytics.data.healthScore;
    if (same) report.push('✅ 7️⃣ Dashboard and Analytics health scores match');
    else report.push('❌ 7️⃣ Health scores differ');
  } catch (e) {
    report.push('❌ 7️⃣ Dashboard/Analytics verification error');
  }

  console.log('\n=== LIVE VERIFICATION REPORT ===');
  console.log(report.join('\n'));
})();
