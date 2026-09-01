import { Router } from 'express';
import { GitHubService, parseGitHubRepoPath } from '../services/github.service';
import prisma from '../utils/prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { geminiRateLimiter } from '../middlewares/rateLimit.middleware';
import { syncGitHub, getActivityFeed, downloadGitHubReport } from '../controllers/githubSync.controller';

const router = Router();

// All github routes require authentication
router.use(authenticateJWT);

/**
 * Scopes a GitHub repo query to a project the authenticated user actually
 * belongs to. Previously these endpoints accepted an arbitrary `path` query
 * param and could be pointed at any repository (including a seed/demo
 * reference like 'facebook/react'). Now every intelligence query must carry a
 * `projectId`, the user must be a member of that project's team, and the
 * requested repo path must be one of the project's connected Repository rows
 * (or its legacy `githubRepo` field).
 */
async function resolveScopedRepo(
  authReq: AuthenticatedRequest,
  projectId: string | undefined,
  requestedPath?: string
): Promise<{ repoPath: string } | { error: string; status: number }> {
  if (!authReq.user) return { error: 'Unauthorized', status: 401 };

  if (!projectId) {
    return {
      error: 'projectId is required. GitHub Intelligence queries must be scoped to a project you belong to.',
      status: 400,
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { teamId: true, githubRepo: true },
  });
  if (!project) return { error: 'Project not found.', status: 404 };

  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
  });
  if (!membership) {
    return { error: 'Access denied. You are not a member of this project\'s team.', status: 403 };
  }

  // Allowed repo paths for this project: connected Repository rows + legacy githubRepo field.
  const connectedRepos = await prisma.repository.findMany({
    where: { projectId },
    select: { fullPath: true },
  });
  const allowed = new Set<string>();
  connectedRepos.forEach((r) => {
    if (r.fullPath) allowed.add(r.fullPath.toLowerCase());
  });
  if (project.githubRepo) allowed.add(project.githubRepo.toLowerCase());

  const fallbackPath = project.githubRepo || connectedRepos[0]?.fullPath;

  let repoPath = '';
  if (requestedPath) {
    repoPath = parseGitHubRepoPath(requestedPath);
    if (!repoPath || !allowed.has(repoPath.toLowerCase())) {
      return { error: 'Repository is not connected to this project.', status: 400 };
    }
  } else if (fallbackPath) {
    repoPath = parseGitHubRepoPath(fallbackPath);
  } else {
    return { error: 'No GitHub repository is connected to this project.', status: 400 };
  }

  return { repoPath };
}

// GET /api/github/health - Health check endpoint for GitHub Intelligence service
router.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    message: 'GitHub Intelligence service operational'
  });
});

// 1. GITHUB INTELLIGENCE HUB API (Combines GitHub REST API + Gemini AI Insights)
router.get('/intelligence', geminiRateLimiter, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const scoped = await resolveScopedRepo(authReq, req.query.projectId as string, req.query.path as string);
    if ('error' in scoped) return res.status(scoped.status).json({ error: scoped.error });
    const intelligence = await GitHubService.getGitHubIntelligence(scoped.repoPath);
    res.json(intelligence);
  } catch (error: any) {
    console.error('GitHub Intelligence Error:', error.message);
    res.status(503).json({ error: error.message || 'GitHub Intelligence is currently unavailable.' });
  }
});

// 2. REPO INFO API
router.get('/repo', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const scoped = await resolveScopedRepo(authReq, req.query.projectId as string, req.query.path as string);
    if ('error' in scoped) return res.status(scoped.status).json({ error: scoped.error });
    const info = await GitHubService.getRepoInfo(scoped.repoPath);
    res.json({ info });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repository info' });
  }
});

// 3. COMMITS API
router.get('/commits', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const scoped = await resolveScopedRepo(authReq, req.query.projectId as string, req.query.path as string);
    if ('error' in scoped) return res.status(scoped.status).json({ error: scoped.error });
    const commits = await GitHubService.getCommits(scoped.repoPath);
    res.json({ commits });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

// 4. CONTRIBUTORS API
router.get('/contributors', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const scoped = await resolveScopedRepo(authReq, req.query.projectId as string, req.query.path as string);
    if ('error' in scoped) return res.status(scoped.status).json({ error: scoped.error });
    const contributors = await GitHubService.getContributors(scoped.repoPath);
    res.json({ contributors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contributors' });
  }
});

// 5. LINK REPO TO PROJECT API
router.post('/link-repo', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { projectId, githubRepo } = req.body;
    if (!projectId || !githubRepo) {
      return res.status(400).json({ error: 'projectId and githubRepo path are required.' });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Permission denied. You must be a member of this project\'s team.' });
    }

    const analytics = await GitHubService.getAnalytics(githubRepo);

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: { githubRepo },
      include: { gitAnalytics: true }
    });

    const gitAnalytics = await prisma.gitAnalytics.upsert({
      where: { projectId },
      update: {
        commitsCount: analytics.commitsCount,
        lastCommitTime: new Date(analytics.lastCommitTime),
        contributionData: JSON.stringify(analytics.authorSplit)
      },
      create: {
        projectId,
        commitsCount: analytics.commitsCount,
        lastCommitTime: new Date(analytics.lastCommitTime),
        contributionData: JSON.stringify(analytics.authorSplit)
      }
    });

    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId,
        action: 'CONNECTED_GITHUB_REPO',
        metadata: JSON.stringify({ repo: githubRepo })
      }
    });

    res.json({
      message: 'GitHub repository linked successfully',
      project: updatedProject,
      analytics: {
        ...gitAnalytics,
        weekdayActivity: analytics.weekdayActivity
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to link GitHub repository' });
  }
});

// 6. SYNC GITHUB DATA
router.post('/sync/:projectId', syncGitHub);

// 7. ACTIVITY FEED
router.get('/activity/:projectId', getActivityFeed);

// 8. DOWNLOAD PDF REPORT
router.get('/report/:projectId', downloadGitHubReport);

export default router;
