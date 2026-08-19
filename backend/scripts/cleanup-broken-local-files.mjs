// One-off cleanup: remove DriveFile/Document rows that reference local
// /uploads/... files which no longer exist on disk. The old bug deleted the
// temp file on a failed Cloudinary upload but still recorded a local URL, so a
// handful of rows were left permanently pointing at missing files.
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();
const uploadsDir = path.join(process.cwd(), 'uploads');

function existsOnDisk(fileUrl) {
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return true; // remote, keep
  if (!fileUrl.startsWith('/uploads/')) return true; // not a local reference, keep
  return fs.existsSync(path.join(uploadsDir, path.basename(fileUrl)));
}

async function main() {
  const driveFiles = await prisma.driveFile.findMany();
  const docs = await prisma.document.findMany();

  const brokenDrive = driveFiles.filter((f) => !existsOnDisk(f.fileUrl));
  const brokenDocs = docs.filter((d) => !existsOnDisk(d.fileUrl));

  console.log(`Total drive files: ${driveFiles.length} | broken: ${brokenDrive.length}`);
  console.log(`Total documents:   ${docs.length} | broken: ${brokenDocs.length}`);

  for (const f of brokenDrive) {
    console.log(`REMOVE driveFile: ${f.id} ${f.name} -> ${f.fileUrl}`);
  }
  for (const d of brokenDocs) {
    console.log(`REMOVE document:  ${d.id} ${d.name} -> ${d.fileUrl}`);
  }

  if (process.argv.includes('--apply')) {
    for (const f of brokenDrive) await prisma.driveFile.delete({ where: { id: f.id } });
    for (const d of brokenDocs) await prisma.document.delete({ where: { id: d.id } });
    if (brokenDrive.length || brokenDocs.length) {
      console.log(`Deleted ${brokenDrive.length} drive files and ${brokenDocs.length} documents.`);
    }
  } else {
    console.log('Dry run. Re-run with --apply to delete the broken rows above.');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
