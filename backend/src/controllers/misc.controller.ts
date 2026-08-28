import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendNotificationToUser } from '../utils/socket';
import { getOnlineUsersSnapshot } from '../sockets/chat.socket';

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const unreadOnly = req.query.unread === 'true' || req.query.unread === '1';
    const where: any = { userId: authReq.user.id };
    if (unreadOnly) {
      where.isRead = false;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.notification.count({
        where: { userId: authReq.user.id, isRead: false }
      })
    ]);

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const markNotificationsRead = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { notificationIds, all } = req.body || {};

    if (all || !notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      await prisma.notification.updateMany({
        where: { userId: authReq.user.id, isRead: false },
        data: { isRead: true }
      });
    } else {
      await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId: authReq.user.id
        },
        data: { isRead: true }
      });
    }

    const unreadCount = await prisma.notification.count({
      where: { userId: authReq.user.id, isRead: false }
    });

    res.json({ message: 'Notifications marked as read', unreadCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * GET /api/misc/sessions
 * Returns the currently-active (online) user sessions from the real-time socket
 * presence layer. Falls back to a clean empty list when no presence data exists.
 */
export const getActiveSessions = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const online = getOnlineUsersSnapshot();

    // Enrich each online user with database-backed profile fields.
    const userIds = online.map((u) => u.userId);
    const profiles = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, avatarUrl: true },
        })
      : [];

    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const sessions = online.map((u) => {
      const profile = profileMap.get(u.userId);
      return {
        id: `${u.userId}-${u.lastActive.getTime()}`,
        userId: u.userId,
        name: profile?.name || u.name,
        email: profile?.email || null,
        avatarUrl: profile?.avatarUrl || null,
        device: 'Browser',
        location: 'Current session',
        current: u.userId === authReq.user!.id,
        lastActive: u.lastActive,
      };
    });

    res.json({ sessions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const notif = await prisma.notification.findFirst({
      where: { id, userId: authReq.user.id }
    });

    if (!notif) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    res.json({ message: 'Notification marked as read', notification: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getProjectActivityFeed = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
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

    const logs = await prisma.activityLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, avatarUrl: true }
        }
      },
      take: 50
    });

    res.json({ logs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Meetings
export const createMeeting = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId, title, dateTime, link } = req.body;

    if (!projectId || !title || !dateTime || !link) {
      return res.status(400).json({ error: 'projectId, title, dateTime, and link are required.' });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
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

    const meeting = await prisma.meeting.create({
      data: {
        projectId,
        title,
        dateTime: new Date(dateTime),
        link,
        createdBy: authReq.user.id
      }
    });

    // Create log
    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId,
        action: 'SCHEDULED_MEETING',
        metadata: JSON.stringify({ title: meeting.title, dateTime: meeting.dateTime })
      }
    });

    // Notify all team members about the meeting assignment & schedule
    const teamMembers = await prisma.teamMember.findMany({
      where: { teamId: project.teamId, userId: { not: authReq.user.id } }
    });

    const formattedTime = new Date(dateTime).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

    for (const member of teamMembers) {
      const notif = await prisma.notification.create({
        data: {
          userId: member.userId,
          title: 'New Meeting Scheduled',
          message: `Meeting "${meeting.title}" scheduled for ${formattedTime} in project "${project.title}". Link: ${link}`
        }
      });
      sendNotificationToUser(member.userId, notif);
    }

    res.status(201).json({ message: 'Meeting scheduled successfully', meeting });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
