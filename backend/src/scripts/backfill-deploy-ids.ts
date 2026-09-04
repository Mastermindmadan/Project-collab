/**
 * One-time backfill: seed the per-project deployment provider ids
 * (Project.vercelProjectId / Project.renderServiceId) from the legacy global
 * env values (VERCEL_PROJECT_ID / RENDER_SERVICE_ID).
 *
 * Deployment Intelligence used to read a single global VERCEL_PROJECT_ID /
 * RENDER_SERVICE_ID pair from env. It is now per-project (stored on each
 * Project row and edited in Project Settings). Run this once so projects that
 * relied on the old global pair keep showing their deployments.
 *
 * Usage (PowerShell, from backend/):
 *   $env:VERCEL_PROJECT_ID="prj_..."; $env:RENDER_SERVICE_ID="srv-..."
 *   npx ts-node src/scripts/backfill-deploy-ids.ts <projectId>        # one project
 *   npx ts-node src/scripts/backfill-deploy-ids.ts --all              # every project still missing ids
 */
import prisma from '../utils/prisma';

async function run() {
  const vercelProjectId = process.env.VERCEL_PROJECT_ID?.trim() || null;
  const renderServiceId = process.env.RENDER_SERVICE_ID?.trim() || null;

  if (!vercelProjectId && !renderServiceId) {
    console.error('Nothing to backfill: set VERCEL_PROJECT_ID and/or RENDER_SERVICE_ID in the environment first.');
    process.exit(1);
  }

  const target = process.argv[2] || '';
  const all = target === '--all';

  const where = all
    ? { OR: [{ vercelProjectId: null }, { renderServiceId: null }] }
    : { id: target };

  const projects = await prisma.project.findMany({ where, select: { id: true, title: true } });
  if (projects.length === 0) {
    console.log(all ? 'No projects are missing deploy ids — nothing to do.' : `No project found with id ${target}`);
    await prisma.$disconnect();
    return;
  }

  for (const project of projects) {
    await prisma.project.update({
      where: { id: project.id },
      data: { vercelProjectId, renderServiceId },
    });
    console.log(`[+] ${project.id} (${project.title}) → vercel=${vercelProjectId} render=${renderServiceId}`);
  }

  console.log(`Backfilled ${projects.length} project(s).`);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error('Backfill failed:', e.message);
  process.exit(1);
});