import fs from 'node:fs';

const BASE = 'http://localhost:5000';
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'rohan@university.edu', password: 'password123' }),
});
const { accessToken } = await login.json();
const auth = { Authorization: `Bearer ${accessToken}` };

// 1) Find ALL drive files across all projects and folders
const teams = (await (await fetch(`${BASE}/api/teams/my-teams`, { headers: auth })).json()).teams || [];
const projects = [];
for (const t of teams) for (const p of (t.projects || [])) projects.push(p);
console.log('TOTAL PROJECTS:', projects.length);

let found = [];
for (const p of projects) {
  try {
    const d = await (await fetch(`${BASE}/api/drive/${p.id}`, { headers: auth })).json();
    for (const f of (d.files || [])) found.push({ project: p.title, file: f });
    for (const folder of (d.folders || [])) {
      const d2 = await (await fetch(`${BASE}/api/drive/${p.id}?folderId=${folder.id}`, { headers: auth })).json();
      for (const f of (d2.files || [])) found.push({ project: p.title, folder: folder.name, file: f });
    }
  } catch {}
}
console.log('DRIVE FILES FOUND:', found.length);
for (const { project, folder, file } of found) {
  const onDisk = file.fileUrl.startsWith('/uploads/')
    ? fs.existsSync(`uploads/${file.fileUrl.split('/').pop()}`)
    : 'remote';
  const prev = await fetch(`${BASE}/api/files/${file.id}/preview`, { headers: auth });
  const down = await fetch(`${BASE}/api/files/${file.id}/download`, { headers: auth });
  console.log(`  [${project}${folder ? '/' + folder : ''}] ${file.name}`);
  console.log(`     fileUrl=${file.fileUrl} onDisk=${onDisk} preview=${prev.status} download=${down.status}`);
}

// 2) Reproduce: upload a small PNG then check disk + preview/download
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
fs.writeFileSync('test-upload.png', png);
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'test-upload.png');
form.append('projectId', projects[0].id);

const upRes = await fetch(`${BASE}/api/drive/${projects[0].id}/files`, {
  method: 'POST',
  headers: auth,
  body: form,
});
const upJson = await upRes.json();
console.log('UPLOAD status:', upRes.status, '| storageProvider:', upJson.storageProvider, '| fileUrl:', upJson.file?.fileUrl);
if (upJson.file) {
  const diskName = upJson.file.fileUrl.split('/').pop();
  console.log('  physical file exists on disk:', fs.existsSync(`uploads/${diskName}`));
  const prev = await fetch(`${BASE}/api/files/${upJson.file.id}/preview`, { headers: auth });
  const down = await fetch(`${BASE}/api/files/${upJson.file.id}/download`, { headers: auth });
  console.log('  preview:', prev.status, '| download:', down.status, '| download bytes:', (await down.arrayBuffer()).byteLength);
  await fetch(`${BASE}/api/drive/files/${upJson.file.id}`, { method: 'DELETE', headers: auth });
}
if (fs.existsSync('test-upload.png')) fs.unlinkSync('test-upload.png');