import { Router, Request, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

// All search routes require an authenticated user
router.use(authenticateJWT);

// GET /api/search?q=<query>&type=<all|users|projects|teams|tasks|documents|meetings>
// Results are scoped to the requesting user's teams to enforce data isolation.
router.get('/', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

  // Pre-compute the set of team IDs the user belongs to (for scoping)
  const teamMemberships = await prisma.teamMember.findMany({
    where: { userId: authReq.user.id },
    select: { teamId: true },
  });
  const teamIds = teamMemberships.map(tm => tm.teamId);
  const hasTeams = teamIds.length > 0;
  try {
    const q = String(req.query.q || '').trim();
    const type = String(req.query.type || 'all');
    const userId = String(req.query.userId || '');

    if (!q || q.length < 2) {
      return res.json({ success: true, results: { users: [], projects: [], teams: [], tasks: [], documents: [], meetings: [] } });
    }

    const results: Record<string, any[]> = { users: [], projects: [], teams: [], tasks: [], documents: [], meetings: [] };

    if (type === 'all' || type === 'users') {
      const teamMembers = await prisma.teamMember.findMany({
        where: { teamId: { in: hasTeams ? teamIds : ['__none__'] } },
        select: { userId: true },
      });
      const userIds = Array.from(new Set(teamMembers.map(tm => tm.userId)));

      results.users = await prisma.user.findMany({
        where: {
          id: { in: userIds.length > 0 ? userIds : ['__none__'] },
          OR: [{ name: { contains: q } }, { email: { contains: q } }],
        },
        select: { id: true, name: true, email: true, avatarUrl: true, role: true },
        take: 5,
      });
    }

    if (type === 'all' || type === 'teams') {
      // Teams: only those the user is a member of
      results.teams = await prisma.team.findMany({
        where: {
          id: { in: hasTeams ? teamIds : ['__none__'] },
          name: { contains: q },
        },
        include: { _count: { select: { members: true, projects: true } } },
        take: 5,
      });
    }

    if (type === 'all' || type === 'projects') {
      results.projects = await prisma.project.findMany({
        where: {
          teamId: { in: hasTeams ? teamIds : ['__none__'] },
          OR: [{ title: { contains: q } }, { description: { contains: q } }],
        },
        include: { team: { select: { name: true } } },
        take: 5,
      });
    }

    if (type === 'all' || type === 'tasks') {
      results.tasks = await prisma.task.findMany({
        where: {
          project: { teamId: { in: hasTeams ? teamIds : ['__none__'] } },
          OR: [{ title: { contains: q } }, { description: { contains: q } }],
        },
        include: {
          project: { select: { id: true, title: true } },
          assignee: { select: { name: true, avatarUrl: true } },
        },
        take: 5,
      });
    }

    if (type === 'all' || type === 'documents') {
      results.documents = await prisma.document.findMany({
        where: {
          project: { teamId: { in: hasTeams ? teamIds : ['__none__'] } },
          OR: [{ name: { contains: q } }, { description: { contains: q } }],
        },
        include: { project: { select: { id: true, title: true } } },
        take: 5,
      });
    }

    if (type === 'all' || type === 'meetings') {
      results.meetings = await prisma.meeting.findMany({
        where: {
          project: { teamId: { in: hasTeams ? teamIds : ['__none__'] } },
          title: { contains: q },
        },
        include: { project: { select: { id: true, title: true } } },
        take: 5,
      });
    }

    const totalCount = Object.values(results).reduce((acc, arr) => acc + arr.length, 0);
    res.json({ success: true, query: q, totalCount, results });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
