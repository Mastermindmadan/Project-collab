import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/search?q=<query>&type=<all|users|projects|teams|tasks|documents|meetings>
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const type = String(req.query.type || 'all');
    const userId = String(req.query.userId || '');

    if (!q || q.length < 2) {
      return res.json({ success: true, results: { users: [], projects: [], teams: [], tasks: [], documents: [], meetings: [] } });
    }

    const results: Record<string, any[]> = { users: [], projects: [], teams: [], tasks: [], documents: [], meetings: [] };

    if (type === 'all' || type === 'users') {
      results.users = await prisma.user.findMany({
        where: { OR: [{ name: { contains: q } }, { email: { contains: q } }] },
        select: { id: true, name: true, email: true, avatarUrl: true, role: true },
        take: 5,
      });
    }

    if (type === 'all' || type === 'teams') {
      results.teams = await prisma.team.findMany({
        where: { name: { contains: q } },
        include: { _count: { select: { members: true, projects: true } } },
        take: 5,
      });
    }

    if (type === 'all' || type === 'projects') {
      results.projects = await prisma.project.findMany({
        where: { OR: [{ title: { contains: q } }, { description: { contains: q } }] },
        include: { team: { select: { name: true } } },
        take: 5,
      });
    }

    if (type === 'all' || type === 'tasks') {
      results.tasks = await prisma.task.findMany({
        where: { OR: [{ title: { contains: q } }, { description: { contains: q } }] },
        include: {
          project: { select: { id: true, title: true } },
          assignee: { select: { name: true, avatarUrl: true } },
        },
        take: 5,
      });
    }

    if (type === 'all' || type === 'documents') {
      results.documents = await prisma.document.findMany({
        where: { OR: [{ name: { contains: q } }, { description: { contains: q } }] },
        include: { project: { select: { id: true, title: true } } },
        take: 5,
      });
    }

    if (type === 'all' || type === 'meetings') {
      results.meetings = await prisma.meeting.findMany({
        where: { title: { contains: q } },
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
