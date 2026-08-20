import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
const id = '698140bb-a8b0-453c-856c-3ceea2570f8e';

function classify(url) {
  if (!url) return 'NULL';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (url.includes('cloudinary.com')) return 'CLOUDINARY';
    if (url.includes('supabase')) return 'SUPABASE';
    return 'REMOTE-OTHER';
  }
  if (url.startsWith('/uploads/')) return 'LOCAL-UPLOADS';
  return 'LOCAL-OTHER';
}

(async () => {
  try {
    const drive = await prisma.driveFile.findUnique({ where: { id } });
    const doc = await prisma.document.findUnique({ where: { id } });
    console.log('=== TARGET ID LOOKUP ===');
    console.log('driveFile:', drive ? { id: drive.id, name: drive.name, fileUrl: drive.fileUrl, projectId: drive.projectId, mimeType: drive.mimeType } : null);
    console.log('document:', doc ? { id: doc.id, name: doc.name, fileUrl: doc.fileUrl, projectId: doc.projectId, mimeType: doc.mimeType } : null);

    const drives = await prisma.driveFile.findMany({ select: { id: true, fileUrl: true } });
    const docs = await prisma.document.findMany({ select: { id: true, fileUrl: true } });

    const tally = {};
    for (const f of drives) { const c = classify(f.fileUrl); tally['drive:'+c] = (tally['drive:'+c]||0)+1; }
    for (const d of docs) { const c = classify(d.fileUrl); tally['doc:'+c] = (tally['doc:'+c]||0)+1; }

    console.log('=== DRIVE file count:', drives.length, '=== DOC count:', docs.length);
    console.log('=== URL FORMAT TALLY ===');
    console.log(JSON.stringify(tally, null, 2));

    console.log('=== SAMPLE DRIVE fileUrls ===');
    drives.slice(0, 8).forEach(f => console.log(classify(f.fileUrl).padEnd(16), f.fileUrl));
    console.log('=== SAMPLE DOC fileUrls ===');
    docs.slice(0, 8).forEach(d => console.log(classify(d.fileUrl).padEnd(16), d.fileUrl));
  } catch (e) {
    console.error('QUERY ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
