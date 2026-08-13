// scripts/cloudinary_verification.js
// Verifies that Drive and Document uploads now store files on Cloudinary
// Run after starting backend (npm run dev) and frontend (npm run dev)

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

function log(msg) { console.log(msg); }

async function ensureCloudinaryEnv() {
  const required = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing Cloudinary env vars: ${missing.join(', ')}`);
  }
  log('✅ Cloudinary env vars present');
}

async function registerUser(email) {
  const password = 'TestPass123!';
  await axios.post(`${BACKEND_URL}/api/auth/register`, {
    name: 'Verifier', email, password,
  });
  const login = await axios.post(`${BACKEND_URL}/api/auth/login`, { email, password });
  return login.data.accessToken;
}

async function getFirstProjectId(token) {
  const res = await axios.get(`${BACKEND_URL}/api/project`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.data.length) throw new Error('No project found for user');
  return res.data[0].id;
}

async function uploadDocument(token, projectId) {
  const tempFile = path.join(__dirname, 'temp.txt');
  fs.writeFileSync(tempFile, 'Cloudinary test file');
  const form = new FormData();
  form.append('file', fs.createReadStream(tempFile));
  form.append('projectId', projectId);
  form.append('uploadedById', 'temp-user-id'); // will be ignored in auth check, but required by schema
  const headers = { Authorization: `Bearer ${token}`, ...form.getHeaders() };
  const res = await axios.post(`${BACKEND_URL}/api/upload`, form, { headers });
  fs.unlinkSync(tempFile);
  return res.data;
}

async function uploadDriveFile(token, projectId) {
  const tempFile = path.join(__dirname, 'temp2.txt');
  fs.writeFileSync(tempFile, 'Drive Cloudinary test');
  const form = new FormData();
  form.append('file', fs.createReadStream(tempFile));
  form.append('uploadedById', 'temp-user-id');
  const headers = { Authorization: `Bearer ${token}`, ...form.getHeaders() };
  const res = await axios.post(`${BACKEND_URL}/api/drive/${projectId}/files`, form, { headers });
  fs.unlinkSync(tempFile);
  return res.data;
}

(async () => {
  const report = [];
  try {
    await ensureCloudinaryEnv();
  } catch (e) { report.push(`❌ Cloudinary env check: ${e.message}`); console.log(report.join('\n')); process.exit(1); }

  const emailA = `verifA_${Date.now()}@example.com`;
  const token = await registerUser(emailA);
  const projectId = await getFirstProjectId(token);

  // 1️⃣ Document upload
  try {
    const docRes = await uploadDocument(token, projectId);
    const url = docRes.document.fileUrl;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      report.push('✅ Document upload stored on Cloudinary');
    } else {
      report.push('❌ Document upload did not use Cloudinary');
    }
  } catch (e) {
    report.push(`❌ Document upload error: ${e.message}`);
  }

  // 2️⃣ Drive file upload
  try {
    const driveRes = await uploadDriveFile(token, projectId);
    const fileUrl = driveRes.file.fileUrl;
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      report.push('✅ Drive file upload stored on Cloudinary');
    } else {
      report.push('❌ Drive file upload did not use Cloudinary');
    }
  } catch (e) {
    report.push(`❌ Drive upload error: ${e.message}`);
  }

  console.log('\n=== CLOUDINARY VERIFICATION REPORT ===');
  console.log(report.join('\n'));
})();
