import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

/**
 * Get chat channels (teams user belongs to) with recent message preview
 */
export const getUserChannels = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const userTeams = await prisma.teamMember.findMany({
      where: { userId: authReq.user.id },
      include: {
        team: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, avatarUrl: true, role: true } }
              }
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: {
                sender: { select: { name: true } }
              }
            }
          }
        }
      }
    });

    const channels = userTeams.map((tm) => {
      const team = tm.team;
      const lastMsg = team.messages[0];
      return {
        id: team.id,
        name: team.name,
        inviteCode: team.inviteCode,
        role: tm.role,
        memberCount: team.members.length,
        members: team.members.map((m) => ({ ...m.user, teamRole: m.role })),
        lastMessage: lastMsg
          ? {
              content: lastMsg.content,
              senderName: lastMsg.sender.name,
              createdAt: lastMsg.createdAt
            }
          : null
      };
    });

    res.json({ channels });
  } catch (error) {
    console.error('Error fetching user chat channels:', error);
    res.status(500).json({ error: 'Failed to fetch chat channels' });
  }
};

/**
 * Get historical chat messages for a specific team
 */
export const getTeamMessages = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { teamId } = req.params;

    // Security Check: User must belong to team
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: You are not a member of this team' });
    }

    const messages = await prisma.message.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true, role: true }
        }
      }
    });

    res.json({ messages });
  } catch (error) {
    console.error('Error fetching team messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

/**
 * Send a message to a team chat (REST fallback)
 */
export const sendTeamMessage = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { teamId } = req.params;
    const { content, attachments } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }

    // Security Check: User must belong to team
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Forbidden: You are not a member of this team' });
    }

    // Sanitize content (strip basic dangerous script tags)
    const sanitizedContent = content.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    const message = await prisma.message.create({
      data: {
        content: sanitizedContent,
        senderId: authReq.user.id,
        teamId,
        attachments: attachments ? JSON.stringify(attachments) : null,
        type: 'CHAT'
      },
      include: {
        sender: {
          select: { id: true, name: true, avatarUrl: true, role: true }
        }
      }
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
};
