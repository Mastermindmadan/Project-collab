import { Router } from 'express';
import prisma from '../utils/prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { DeployIntelligenceService } from '../services/deployIntelligence.service';

const router = Router();

// All deployment-intelligence routes require authentication.
router.use(authenticateJWT);

/**
 * Scopes a Deployment Intelligence query to the authenticated user's own project.
 *
 * Mirrors the isolation fix applied to GitHub Intelligence: the `:projectId` path
 * parameter is the internal ProjectCollab project id, and the caller must be a
 * member of that project's team. Members of OTHER teams - or unauthenticated
 * callers - are rejected before any provider API (Vercel/Render) is contacted.
 *
 * The provider service ids (VERCEL_PROJECT_ID / RENDER_SERVICE_ID) are read from
 * env on the backend only; the internal project id here is purely for access control.
 */
async function resolveScopedProject(
  authReq: AuthenticatedRequest,
  projectId: string | undefined
): Promise<{ teamId: string } | { error: string; status: number }> {
  if (!authReq.user) return { error: 'Unauthorized', status: 401 };

  if (!projectId) {
    return {
      error: 'projectId is required. Deployment Intelligence queries must be scoped to a project you belong to.',
      status: 400,
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { teamId: true },
  });
  if (!project) return { error: 'Project not found.', status: 404 };

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
  });
  if (!membership) {
    return { error: "Access denied. You are not a member of this project's team.", status: 403 };
  }

  return { teamId: project.teamId };
}

// GET /api/deploy-intelligence/vercel/:projectId
router.get('/vercel/:projectId', async (req, res) => {
  try {
    const scoped = await resolveScopedProject(req as AuthenticatedRequest, req.params.projectId);
    if ('error' in scoped) return res.status(scoped.status).json({ error: scoped.error });
    const data = await DeployIntelligenceService.getVercelIntelligence();
    res.json(data);
  } catch (error: any) {
    console.error('[DEPLOY INTELLIGENCE ERROR] Vercel endpoint failed:', error.message);
    res.status(503).json({ error: error.message || 'Deployment Intelligence is currently unavailable.' });
  }
});

// GET /api/deploy-intelligence/render/:projectId
router.get('/render/:projectId', async (req, res) => {
  try {
    const scoped = await resolveScopedProject(req as AuthenticatedRequest, req.params.projectId);
    if ('error' in scoped) return res.status(scoped.status).json({ error: scoped.error });
    const data = await DeployIntelligenceService.getRenderIntelligence();
    res.json(data);
  } catch (error: any) {
    console.error('[DEPLOY INTELLIGENCE ERROR] Render endpoint failed:', error.message);
    res.status(503).json({ error: error.message || 'Deployment Intelligence is currently unavailable.' });
  }
});

// GET /api/deploy-intelligence/render/:projectId/logs
router.get('/render/:projectId/logs', async (req, res) => {
  try {
    const scoped = await resolveScopedProject(req as AuthenticatedRequest, req.params.projectId);
    if ('error' in scoped) return res.status(scoped.status).json({ error: scoped.error });

    const offset = Math.max(0, Number(req.query.offset) || 0);
    const requestedLimit = Number(req.query.limit) || 100;
    const limit = Math.min(Math.max(1, requestedLimit), 200);

    const data = await DeployIntelligenceService.getRenderLogs(offset, limit);
    res.json(data);
  } catch (error: any) {
    console.error('[DEPLOY INTELLIGENCE ERROR] Render logs endpoint failed:', error.message);
    res.status(503).json({ error: error.message || 'Deployment Intelligence is currently unavailable.' });
  }
});

export default router;