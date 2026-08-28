import { Router } from 'express';
import { GitHubService } from '../services/github.service';
import prisma from '../utils/prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { geminiRateLimiter } from '../middlewares/rateLimit.middleware';
import { syncGitHub, getActivityFeed, downloadGitHubReport } from '../controllers/githubSync.controller';

const router = Router();

// All github routes require authentication
router.use(authenticateJWT);

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
    const repoPath = (req.query.path as string) || 'facebook/react';
    const intelligence = await GitHubService.getGitHubIntelligence(repoPath);
    res.json(intelligence);
  } catch (error: any) {
    console.error('GitHub Intelligence Error:', error.message);
    res.status(503).json({ error: error.message || 'GitHub Intelligence is currently unavailable.' });
  }
});

// 2. REPO INFO API
router.get('/repo', async (req, res) => {
  try {
    const path = req.query.path as string;
    if (!path) return res.status(400).json({ error: 'Repository path (owner/repo) is required.' });
    const info = await GitHubService.getRepoInfo(path);
    res.json({ info });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repository info' });
  }
});

// 3. COMMITS API
router.get('/commits', async (req, res) => {
  try {
    const path = req.query.path as string;
    if (!path) return res.status(400).json({ error: 'Repository path (owner/repo) is required.' });
    const commits = await GitHubService.getCommits(path);
    res.json({ commits });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

// 4. CONTRIBUTORS API
router.get('/contributors', async (req, res) => {
  try {
    const path = req.query.path as string;
    if (!path) return res.status(400).json({ error: 'Repository path (owner/repo) is required.' });
    const contributors = await GitHubService.getContributors(path);
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
