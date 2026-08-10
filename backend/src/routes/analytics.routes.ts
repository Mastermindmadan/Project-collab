import { Router } from 'express';
import prisma from '../utils/prisma';
import { AIService } from '../services/ai.service';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/project/:projectId/summary', async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: {
          include: { assignee: { select: { id: true, name: true } } }
        },
        milestones: true,
        gitAnalytics: true,
        messages: { select: { id: true, createdAt: true } }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Verify membership
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const tasks = project.tasks;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
    const reviewTasks = tasks.filter(t => t.status === 'REVIEW').length;
    const todoTasks = tasks.filter(t => t.status === 'TODO').length;

    const taskCompletionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

    // Fetch commit frequency count
    const commitsCount = project.gitAnalytics?.commitsCount || 0;

    // Chat activity (last 7 days messages count)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Quick count of messages within 7 days
    const recentMessagesCount = await prisma.message.count({
      where: {
        projectId,
        createdAt: { gte: sevenDaysAgo }
      }
    });

    // Overdue tasks count
    const now = new Date();
    const overdueTasksCount = tasks.filter(
      t => t.status !== 'COMPLETED' && t.dueDate && new Date(t.dueDate) < now
    ).length;

    const overdueMilestonesCount = project.milestones.filter(
      m => m.status !== 'COMPLETED' && new Date(m.dueDate) < now
    ).length;

    const totalOverdueCount = overdueTasksCount + overdueMilestonesCount;

    // Calculate health score using AI service formula
    const healthResult = AIService.computeHealthScore(
      taskCompletionRate,
      commitsCount,
      recentMessagesCount,
      totalOverdueCount
    );

    // Save/Update health score in DB
    await prisma.project.update({
      where: { id: projectId },
      data: {
        healthScore: healthResult.score,
        status: healthResult.status
      }
    });

    // Team task distributions
    const memberTasks: { [key: string]: { name: string; completed: number; total: number } } = {};
    
    // Initialize with project team members
    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId: project.teamId },
      include: { user: { select: { id: true, name: true } } }
    });

    teamMembers.forEach(tm => {
      memberTasks[tm.userId] = {
        name: tm.user.name,
        completed: 0,
        total: 0
      };
    });

    // Populate task metrics
    tasks.forEach(t => {
      if (t.assigneeId && memberTasks[t.assigneeId]) {
        memberTasks[t.assigneeId].total += 1;
        if (t.status === 'COMPLETED') {
          memberTasks[t.assigneeId].completed += 1;
        }
      }
    });

    const teamContributionList = Object.keys(memberTasks).map(userId => {
      const stats = memberTasks[userId];
      const taskPercentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
      
      // Attempt to retrieve Git contributions
      let gitPercentage = 0;
      if (project.gitAnalytics?.contributionData) {
        const raw = project.gitAnalytics.contributionData;
        const gitData = (typeof raw === 'string' ? JSON.parse(raw) : raw) as any[];
        const userGit = Array.isArray(gitData) ? gitData.find(g => g.name?.toLowerCase() === stats.name?.toLowerCase()) : null;
        if (userGit) gitPercentage = userGit.percentage;
      }

      // Combined weight metric: 60% git commits, 40% tasks completed
      const totalWeight = Math.round((gitPercentage * 0.6) + (taskPercentage * 0.4));

      return {
        userId,
        name: stats.name,
        taskCount: stats.total,
        taskCompletedCount: stats.completed,
        taskCompletionRate: taskPercentage,
        gitContributionRate: gitPercentage,
        combinedProductivityScore: totalWeight || 10
      };
    });

    res.json({
      health: {
        score: healthResult.score,
        status: healthResult.status,
        metrics: healthResult.metrics
      },
      taskStats: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        review: reviewTasks,
        todo: todoTasks,
        completionPercentage: Math.round(taskCompletionRate * 100)
      },
      teamContributions: teamContributionList,
      milestonesProgress: {
        total: project.milestones.length,
        completed: project.milestones.filter(m => m.status === 'COMPLETED').length,
        pending: project.milestones.filter(m => m.status !== 'COMPLETED').length
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
