import { Router } from 'express';
import axios from 'axios';
import { AIService } from '../services/ai.service';
import { GeminiKeyManager } from '../services/geminiKeyManager';
import { AIRouterService } from '../services/aiRouter.service';
import prisma from '../utils/prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { geminiRateLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();

// All AI routes require authentication
router.use(authenticateJWT);

// GET /api/ai/health - Health check endpoint for multi-provider AI Router & failover diagnostics
router.get('/health', async (_req, res) => {
  const report = await AIRouterService.getHealthReport();
  return res.json(report);
});

// GET /api/ai/status - Lightweight Gemini connectivity probe for the UI status indicator
router.get('/status', async (_req, res) => {
  const activeKeyObj = GeminiKeyManager.getActiveKey();
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  if (!activeKeyObj) {
    return res.json({ status: 'unavailable', latencyMs: null });
  }

  const startedAt = Date.now();
  try {
    await axios.get(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${activeKeyObj.key}`,
      { timeout: 8000 }
    );
    const latencyMs = Date.now() - startedAt;
    return res.json({ status: latencyMs > 2500 ? 'slow' : 'online', latencyMs });
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 429) {
      GeminiKeyManager.markExhausted(activeKeyObj.index, 'Status probe HTTP 429');
    }
    console.warn('Gemini status probe failed:', error instanceof Error ? error.message : error);
    return res.json({ status: 'unavailable', latencyMs: Date.now() - startedAt });
  }
});

// GET /api/ai/usage - Returns user daily usage and quotas
router.get('/usage', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
  const usage = await AIRouterService.getUserDailyUsage(authReq.user.id);
  res.json({ usage });
});


// 1. AI PLANNER API
router.post('/planner', geminiRateLimiter, async (req, res) => {
  try {
    const { title, description, objectives, teamSize, deadline } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Title is required for project planning.' });
    }

    const mergedObjectives = objectives || (description ? [description] : []);
    const parsedTeamSize = typeof teamSize === 'number' ? teamSize : parseInt(teamSize) || 4;

    const plan = await AIService.planProject(title, mergedObjectives, parsedTeamSize, deadline || '');
    res.json({ plan });
  } catch (error: any) {
    console.error('AI Planner Route Error:', error.message);
    if (error.message?.startsWith('RATE_LIMIT_EXCEEDED')) {
      return res.status(429).json({ error: error.message });
    }
    res.status(503).json({ success: false, message: error.message || 'AI service temporarily unavailable' });
  }
});

// 2. REQUIREMENT ANALYZER API
router.post('/analyze-docs', geminiRateLimiter, async (req, res) => {
  try {
    const { documentText } = req.body;
    if (!documentText || documentText.trim() === '') {
      return res.status(400).json({ error: 'Document text or project description is required.' });
    }

    const analysis = await AIService.analyzeRequirements(documentText);
    res.json({ analysis });
  } catch (error: any) {
    console.error('Requirement Analyzer Route Error:', error.message);
    if (error.message?.startsWith('RATE_LIMIT_EXCEEDED')) {
      return res.status(429).json({ error: error.message });
    }
    res.status(503).json({ success: false, message: error.message || 'AI service temporarily unavailable' });
  }
});

// 3. AI RISK DETECTION ENGINE API
router.post('/risk-detection', geminiRateLimiter, async (req, res) => {
  try {
    const { projectName, description, teamSize, deadline } = req.body;
    if (!projectName) {
      return res.status(400).json({ error: 'Project Name is required for risk analysis.' });
    }

    const parsedTeamSize = typeof teamSize === 'number' ? teamSize : parseInt(teamSize) || 4;
    const riskAnalysis = await AIService.analyzeProjectRisk(
      projectName,
      description || '',
      parsedTeamSize,
      deadline || ''
    );

    res.json({ riskAnalysis });
  } catch (error: any) {
    console.error('AI Risk Detection Route Error:', error.message);
    if (error.message?.startsWith('RATE_LIMIT_EXCEEDED')) {
      return res.status(429).json({ error: error.message });
    }
    res.status(503).json({ success: false, message: error.message || 'AI service temporarily unavailable' });
  }
});

// 4. DELAY PREDICTION API (Database-linked project risk)
router.get('/projects/:projectId/delay-prediction', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { projectId } = req.params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: true, milestones: true, gitAnalytics: true }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const commitsCount = project.gitAnalytics?.commitsCount || 0;
    const prediction = await AIService.predictDelay(project.tasks, project.milestones, commitsCount);

    res.json({ prediction });
  } catch (error: any) {
    console.error('Delay Prediction Error:', error.message);
    res.status(503).json({ success: false, message: 'AI service temporarily unavailable' });
  }
});

// 5. WEEKLY SPRINT SUMMARY API
router.post('/sprint-summary', geminiRateLimiter, async (req, res) => {
  try {
    const { completedTasks, pendingTasks, commitStats, blockages } = req.body;
    const summary = await AIService.generateSprintSummary(
      completedTasks || [],
      pendingTasks || [],
      commitStats || 'No commit logs',
      blockages || []
    );
    res.json({ summary });
  } catch (error: any) {
    console.error('Sprint Summary Route Error:', error.message);
    res.status(503).json({ success: false, message: 'AI service temporarily unavailable' });
  }
});

export default router;
