import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getIO } from '../utils/socket';

/**
 * Get chat channels (teams user belongs to) with recent message preview
 */
export const getUserChannels = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      console.warn(`[chat/channels] AUTH 401 no user for ${req.method} ${req.originalUrl}`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
      console.warn(`[chat/messages] 403 userId=${authReq.user.id} teamId=${teamId} reason=not-a-member`);
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
      console.warn(`[chat/send] 403 userId=${authReq.user.id} teamId=${teamId} reason=not-a-member`);
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

/**
 * Delete a team chat message.
 *
 * Authorization (scoped to the SAME team that owns the message):
 *   - the message's original sender can always delete it, OR
 *   - a team OWNER / ADMIN (membership.role in the message's team) can delete
 *     ANY message in that team, including other members'.
 *
 * A member of one team holding an admin role on it CANNOT delete a message from
 * a different team: the teamId in the URL must match message.teamId, and the
 * role check is performed against that team's membership row.
 */
export const deleteTeamMessage = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { teamId, messageId } = req.params;

    // Same membership lookup pattern used by getTeamMessages / sendTeamMessage.
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId } },
    });

    if (!membership) {
      console.warn(`[chat/delete] 403 userId=${authReq.user.id} teamId=${teamId} reason=not-a-member`);
      return res.status(403).json({ error: 'Forbidden: You are not a member of this team' });
    }

    // The message must exist AND belong to the SAME team being addressed — this
    // prevents a team-A admin from deleting a message that lives in team B.
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.teamId !== teamId) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const isSender = message.senderId === authReq.user.id;
    const isTeamAdmin = membership.role === 'OWNER' || membership.role === 'ADMIN';

    if (!isSender && !isTeamAdmin) {
      console.warn(
        `[chat/delete] 403 userId=${authReq.user.id} teamId=${teamId} messageId=${messageId} role=${membership.role} reason=not-sender-or-admin`
      );
      return res.status(403).json({ error: 'Only the sender or a team admin can delete this message' });
    }

    await prisma.message.delete({ where: { id: messageId } });

    // Broadcast a live removal to the team room. This fires for BOTH
    // self-deletions and admin/owner-initiated deletions of another member's
    // message, so the message disappears for every connected team member in
    // real time — not just for the person who deleted it.
    const io = getIO();
    if (io) {
      io.to(`team:${teamId}`).emit('delete-team-message', {
        id: message.id,
        teamId,
        deletedBy: authReq.user.id,
      });
    }

    res.json({ success: true, id: message.id });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};
