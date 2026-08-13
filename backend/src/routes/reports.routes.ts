import { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// All report routes require authentication
router.use(authenticateJWT);

// GET /api/reports/project/:id — structured project report data
router.get('/project/:id', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        team: { include: { members: { include: { user: { select: { id: true, name: true } } } } } },
        tasks: { include: { assignee: { select: { name: true } }, oldSubtasks: true } },
        milestones: true,
        meetings: true,
        documents: true,
        activityLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    // Verify the requester is a member of the project's team
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } },
    });
    if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });

    const tasksByStatus = {
      TODO: project.tasks.filter(t => t.status === 'TODO').length,
      IN_PROGRESS: project.tasks.filter(t => t.status === 'IN_PROGRESS').length,
      REVIEW: project.tasks.filter(t => t.status === 'REVIEW').length,
      COMPLETED: project.tasks.filter(t => t.status === 'COMPLETED').length,
    };

    const memberStats = project.team.members.map(m => {
      const assigned = project.tasks.filter(t => t.assigneeId === m.userId);
      return {
        name: m.user.name,
        role: m.role,
        assigned: assigned.length,
        completed: assigned.filter(t => t.status === 'COMPLETED').length,
      };
    });

    res.json({
      success: true,
      report: {
        project: { id: project.id, title: project.title, description: project.description, status: project.status, healthScore: project.healthScore, createdAt: project.createdAt },
        team: { name: project.team.name, memberCount: project.team.members.length },
        tasks: { total: project.tasks.length, byStatus: tasksByStatus },
        milestones: { total: project.milestones.length, completed: project.milestones.filter(m => m.status === 'COMPLETED').length },
        meetings: { total: project.meetings.length },
        documents: { total: project.documents.length },
        memberStats,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/team/:id — team report data
router.get('/team/:id', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const team = await prisma.team.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } },
        projects: { include: { tasks: true, milestones: true } },
      },
    });
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    // Verify the requester is a member of the team
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: req.params.id } },
    });
    if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });

    const projectSummaries = team.projects.map(p => ({
      id: p.id, title: p.title, status: p.status, healthScore: p.healthScore,
      totalTasks: p.tasks.length,
      completedTasks: p.tasks.filter(t => t.status === 'COMPLETED').length,
      totalMilestones: p.milestones.length,
      completedMilestones: p.milestones.filter(m => m.status === 'COMPLETED').length,
    }));

    res.json({
      success: true,
      report: {
        team: { id: team.id, name: team.name, memberCount: team.members.length, projectCount: team.projects.length },
        projects: projectSummaries,
        members: team.members.map(m => ({ name: m.user.name, role: m.role })),
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/tasks?projectId= — task report data
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { projectId } = req.query;
    let where: any = {};

    if (projectId) {
      const pid = String(projectId);
      // Verify membership on the requested project
      const proj = await prisma.project.findUnique({
        where: { id: pid },
        select: { teamId: true },
      });
      if (!proj) return res.status(404).json({ success: false, message: 'Project not found' });
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: authReq.user.id, teamId: proj.teamId } },
      });
      if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });
      where = { projectId: pid };
    } else {
      // Scope to the user's own team projects
      const teamIds = (await prisma.teamMember.findMany({
        where: { userId: authReq.user.id },
        select: { teamId: true },
      })).map(tm => tm.teamId);
      where = { project: { teamId: { in: teamIds } } };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { name: true } },
        project: { select: { title: true } },
        oldSubtasks: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const summary = {
      total: tasks.length,
      byStatus: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, COMPLETED: 0 } as Record<string, number>,
      byPriority: { LOW: 0, MEDIUM: 0, HIGH: 0 } as Record<string, number>,
      overdue: tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED').length,
    };
    tasks.forEach(t => {
      summary.byStatus[t.status] = (summary.byStatus[t.status] || 0) + 1;
      summary.byPriority[t.priority] = (summary.byPriority[t.priority] || 0) + 1;
    });

    res.json({ success: true, report: { summary, tasks, generatedAt: new Date().toISOString() } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/members?teamId= — per-member analytics data
router.get('/members', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { teamId } = req.query;
    let where: any = {};

    if (teamId) {
      const tid = String(teamId);
      // Verify the requester is a member of the requested team
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: authReq.user.id, teamId: tid } },
      });
      if (!membership) return res.status(403).json({ success: false, message: 'Access denied' });
      where = { teamId: tid };
    } else {
      // Scope to the user's own teams
      where = { userId: authReq.user.id };
    }

    const members = await prisma.teamMember.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, avatarUrl: true },
        },
        team: { select: { name: true } },
      },
    });

    const memberStats = await Promise.all(members.map(async (m) => {
      const tasks = await prisma.task.findMany({
        where: { assigneeId: m.userId },
        select: { status: true, priority: true, dueDate: true, createdAt: true, updatedAt: true },
      });
      const completed = tasks.filter(t => t.status === 'COMPLETED').length;
      const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS').length;
      const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED').length;
      const productivity = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;

      return {
                userId: m.userId, name: m.user.name, avatarUrl: m.user.avatarUrl,
        team: m.team.name, role: m.role,
        totalTasks: tasks.length, completed, inProgress, overdue, productivity,
      };
    }));

    res.json({ success: true, members: memberStats, generatedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
