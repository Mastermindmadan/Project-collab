import { Request, Response } from 'express';
import { syncProjectGitHub } from '../services/githubSync.service';
import { getProjectActivity } from '../services/activity.service';
import { generateGitHubReport } from '../services/githubReport.service';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import prisma from '../utils/prisma';

export const syncGitHub = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true, githubRepo: true },
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });

    if (!membership) return res.status(403).json({ error: 'Access denied' });

    if (!project.githubRepo) {
      return res.status(400).json({ error: 'No GitHub repository linked to this project' });
    }

    const result = await syncProjectGitHub(projectId);

    res.json({
      message: 'GitHub sync completed successfully',
      result,
    });
  } catch (error: any) {
    console.error('GitHub sync error:', error);
    res.status(500).json({ error: error.message || 'Sync failed' });
  }
};

export const getActivityFeed = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { projectId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });

    if (!membership) return res.status(403).json({ error: 'Access denied' });

    const events = await getProjectActivity(projectId, limit);

    res.json({ events });
  } catch (error: any) {
    console.error('Activity feed error:', error);
    res.status(500).json({ error: error.message || 'Failed to load activity' });
  }
};

export const downloadGitHubReport = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });

    if (!membership) return res.status(403).json({ error: 'Access denied' });

    await generateGitHubReport(projectId);

    res.json({ message: 'Report generated and downloaded' });
  } catch (error: any) {
    console.error('Report generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate report' });
  }
};
