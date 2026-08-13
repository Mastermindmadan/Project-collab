import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendNotificationToUser } from '../utils/socket';

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: authReq.user.id },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ notifications });
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
