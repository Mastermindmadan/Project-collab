// Live manual verification of the GitHub Intelligence data-isolation fix.
// Two REAL freshly-registered accounts against the REAL public GitHub API.
//
// Fallback markers (offline mode) we must NOT see:
//   repoInfo.stars === 18
//   commits:  additionsUnavailable === false AND author in {Alex Chen, Priya Mehta, Marcus Vance, Sneha Kapoor, Arjun Verma}
//   branches: names exactly {main, dev, feature/ai-integration}
//   PRs:      reviewsUnavailable === false AND title 'feat: Add AI sprint roadmap generator'
//   contribs: additionsUnavailable === false AND login in {priyamehta, arjunv, snehak}
const axios = require('axios');
const B = 'http://127.0.0.1:5000';
const NL = String.fromCharCode(10);
const out = [];
const log = (s) => { out.push(s); console.log(s); };

const FB = {
  commitAuthors: new Set(['Alex Chen', 'Priya Mehta', 'Marcus Vance', 'Sneha Kapoor', 'Arjun Verma']),
  commitShas: new Set(['7a8b9c0', '3d4e5f6', '9g0h1i2', '5j6k7l8', '1m2n3o4']),
  branchNames: new Set(['main', 'dev', 'feature/ai-integration']),
  prTitles: new Set(['feat: Add AI sprint roadmap generator', 'fix: Socket.io real-time chat room isolation']),
  contribLogins: new Set(['priyamehta', 'arjunv', 'snehak']),
};

function detectFallback(d) {
  const reasons = [];
  if (!d) return ['no data'];
  if (d.repoInfo && d.repoInfo.stars === 18) reasons.push('stars===18');
  if (d.commits && d.commits.length && d.commits[0].additionsUnavailable === false &&
      FB.commitAuthors.has(d.commits[0].author)) reasons.push('fallback commit author ' + d.commits[0].author);
  if (d.branches && d.branches.length === 3 && d.branches.every(b => FB.branchNames.has(b.name))) reasons.push('fallback branch set');
  if (d.pullRequests && d.pullRequests.length && d.pullRequests[0].reviewsUnavailable === false &&
      FB.prTitles.has(d.pullRequests[0].title)) reasons.push('fallback PR title');
  if (d.contributors && d.contributors.length && d.contributors[0].additionsUnavailable === false &&
      FB.contribLogins.has(d.contributors[0].username)) reasons.push('fallback contributor ' + d.contributors[0].username);
  return reasons;
}

async function call(url, params, headers) {
  return (await axios.get(url, { params, headers })).data;
}

async function post(url, body, headers) {
  return (await axios.post(url, body, { headers })).data;
}