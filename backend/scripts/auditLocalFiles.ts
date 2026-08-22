/**
 * auditLocalFiles.ts
 *
 * One-off audit script (standalone — not part of the app, excluded from the
 * build via tsconfig's `include: ["src/**"]`).
 *
 * Render's disk is ephemeral: rows whose `fileUrl` is NOT an http:// or
 * https:// URL point at files that sit on local disk and will 404 after the
 * next deploy/restart. Script REPORTS those rows on DriveFile and Document so
 * affected users can be identified and asked to re-upload.
 *
 * It is strictly read-only — no rows are created, modified or deleted.
 *
 * Run from the backend/ directory:
 *   npx ts-node scripts/auditLocalFiles.ts
 */
import path from 'path';
import { config as loadEnv } from 'dotenv';
import prisma from '../src/utils/prisma';

loadEnv({ path: path.join(__dirname, '..', '.env') });

interface LocalFileRow {
  table: 'DriveFile' | 'Document';
  id: string;
  name: string | null;
  projectId: string;
  uploadedById: string;
}

async function main(): Promise<void> {
  // fileUrl does NOT start with "http://" AND does NOT start with "https://"
  const driveFileRows = await prisma.driveFile.findMany({
    where: {
      NOT: {
        OR: [
          { fileUrl: { startsWith: 'http://' } },
          { fileUrl: { startsWith: 'https://' } },
        ],
      },
    },
    select: { id: true, name: true, projectId: true, uploadedById: true },
    orderBy: { createdAt: 'asc' },
  });

  const documentRows = await prisma.document.findMany({
    where: {
      NOT: {
        OR: [
          { fileUrl: { startsWith: 'http://' } },
          { fileUrl: { startsWith: 'https://' } },
        ],
      },
    },
    select: { id: true, name: true, projectId: true, uploadedById: true },
    orderBy: { createdAt: 'asc' },
  });

  const rows: LocalFileRow[] = [
    ...driveFileRows.map((row) => ({ table: 'DriveFile' as const, ...row })),
    ...documentRows.map((row) => ({ table: 'Document' as const, ...row })),
  ];

  console.log('=== LOCAL-DISK FILE AUDIT ===');
  console.log(`DriveFile rows not on http(s): ${driveFileRows.length}`);
  console.log(`Document rows not on http(s):  ${documentRows.length}`);
  console.log(`Total affected:                ${rows.length}`);
  console.log('');

  if (rows.length === 0) {
    console.log('No DriveFile/Document rows reference local-disk paths. Nothing to do.');
  } else {
    for (const row of rows) {
      console.log(
        `[${row.table}] id=${row.id} | name=${JSON.stringify(row.name)} | ` +
        `projectId=${row.projectId} | uploadedById=${row.uploadedById}`
      );
    }
    console.log('');
    console.log('These fileUrl values do not start with http:// or https://, so they point at');
    console.log('ephemeral local disk and will 404 after the next deploy/restart.');
    console.log('Report-only audit: no rows were created, modified or deleted.');
    console.log('ACTION: contact the uploadedById users above and ask them to re-upload their files.');
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error('Audit failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());