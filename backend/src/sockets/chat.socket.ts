import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { sendNotificationToUser } from '../utils/socket';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in environment variables.');
}

interface ActiveUser {
  userId: string;
  socketId: string;
  name: string;
  teamId?: string;
}

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// Map socket.id -> ActiveUser
const onlineUsers = new Map<string, ActiveUser>();

export const initChatSocket = (io: Server) => {
  // 🔐 1. JWT Authentication Middleware for Socket Connections
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication error: Missing JWT token'));
      }

      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
      };
      next();
    } catch (err) {
      console.warn('Socket Auth Failed:', (err as Error).message);
      return next(new Error('Authentication error: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user;
    if (!user) return socket.disconnect();

    console.log(`🔌 Socket connected: ${user.name} (${socket.id})`);
    socket.join(`user:${user.id}`);

    // 🚪 2. Join Team Chat Room with Security Check
    socket.on('join-team', async (data: { teamId: string }) => {
      const { teamId } = data;
      if (!teamId) return;

      try {
        // Verify user is a member of the requested team
        const membership = await prisma.teamMember.findUnique({
          where: { userId_teamId: { userId: user.id, teamId } },
        });

        if (!membership) {
          socket.emit('error-msg', { message: 'Forbidden: You are not a member of this team.' });
          return;
        }

        const previousTeamId = onlineUsers.get(socket.id)?.teamId;
        if (previousTeamId && previousTeamId !== teamId) {
          socket.leave(`team:${previousTeamId}`);
          broadcastTeamPresence(io, previousTeamId);
        }

        const roomName = `team:${teamId}`;
        socket.join(roomName);

        // Store active session
        onlineUsers.set(socket.id, {
          userId: user.id,
          socketId: socket.id,
          name: user.name,
          teamId,
        });

        console.log(`👤 ${user.name} joined room ${roomName}`);

        // Broadcast presence
        broadcastTeamPresence(io, teamId);
      } catch (error) {
        console.error('Socket: Failed to join team room', error);
      }
    });

    // 🚪 3. Leave Team Room (triggered when switching teams on frontend)
    socket.on('leave-team', (data: { teamId: string }) => {
      const { teamId } = data;
      if (!teamId) return;
      const roomName = `team:${teamId}`;
      socket.leave(roomName);

      // Update the stored active teamId to null
      const session = onlineUsers.get(socket.id);
      if (session && session.teamId === teamId) {
        onlineUsers.set(socket.id, { ...session, teamId: undefined });
        broadcastTeamPresence(io, teamId);
      }
      console.log(`👋 ${user.name} left room ${roomName}`);
    });

    // ⌨️ 4. Handle Typing Indicator
    socket.on('typing', (data: { teamId: string; isTyping: boolean }) => {
      const { teamId, isTyping } = data;
      if (!teamId) return;
      if (onlineUsers.get(socket.id)?.teamId !== teamId) {
        socket.emit('error-msg', { message: 'Join the team chat before sending typing events.' });
        return;
      }
      socket.to(`team:${teamId}`).emit('user-typing', {
        userId: user.id,
        name: user.name,
        isTyping,
      });
    });

    // 💬 4. Handle Message Sending & DB Persistence
    socket.on('send-team-message', async (data: { teamId: string; content: string; attachments?: string[] }) => {
      const { teamId, content, attachments } = data;

      if (!teamId || !content || !content.trim()) return;

      try {
        // Security check
        const membership = await prisma.teamMember.findUnique({
          where: { userId_teamId: { userId: user.id, teamId } },
        });

        if (!membership) {
          socket.emit('error-msg', { message: 'Forbidden: You cannot post to this team.' });
          return;
        }

        if (onlineUsers.get(socket.id)?.teamId !== teamId) {
          socket.emit('error-msg', { message: 'Join the team chat before sending messages.' });
          return;
        }

        // Sanitize content (strip basic dangerous tags)
        const sanitizedContent = content.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        // Persist message in PostgreSQL via Prisma
        const message = await prisma.message.create({
          data: {
            teamId,
            senderId: user.id,
            content: sanitizedContent,
            attachments: attachments ? JSON.stringify(attachments) : null,
            type: 'CHAT',
          },
          include: {
            sender: {
              select: { id: true, name: true, avatarUrl: true, role: true },
            },
          },
        });

        // Broadcast to all sockets in the team room
        io.to(`team:${teamId}`).emit('new-team-message', {
          id: message.id,
          teamId: message.teamId,
          content: message.content,
          senderId: message.senderId,
          createdAt: message.createdAt,
          attachments: attachments || [],
          sender: message.sender,
        });

        // Create in-app notifications for team members
        const otherMembers = await prisma.teamMember.findMany({
          where: { teamId, userId: { not: user.id } },
          include: { team: true }
        });

        const teamName = otherMembers[0]?.team?.name || 'Team';
        const snippet = sanitizedContent.length > 50 ? sanitizedContent.substring(0, 50) + '...' : sanitizedContent;

        for (const m of otherMembers) {
          const notif = await prisma.notification.create({
            data: {
              userId: m.userId,
              title: `New Message in ${teamName}`,
              message: `${user.name}: "${snippet}"`
            }
          });
          sendNotificationToUser(m.userId, notif);
        }

      } catch (error) {
        console.error('Socket: Failed to save/send team message', error);
        socket.emit('error-msg', { message: 'Failed to deliver message' });
      }
    });

    // ❌ 5. Disconnect Handler
    socket.on('disconnect', () => {
      const session = onlineUsers.get(socket.id);
      if (session) {
        console.log(`❌ ${session.name} disconnected: ${socket.id}`);
        onlineUsers.delete(socket.id);
        if (session.teamId) {
          broadcastTeamPresence(io, session.teamId);
        }
      }
    });
  });
};

const broadcastTeamPresence = (io: Server, teamId: string) => {
  const members = Array.from(onlineUsers.values()).filter((u) => u.teamId === teamId);
  io.to(`team:${teamId}`).emit('online-team-members', members);
};

/**
 * Returns a snapshot of all currently connected (online) users keyed by userId,
 * with the socket that connected most recently. Used by the "Active Sessions"
 * endpoint so the UI reflects real-time presence instead of mock data.
 */
export function getOnlineUsersSnapshot(): Array<{
  userId: string;
  name: string;
  lastActive: Date;
}> {
  const byUser = new Map<string, { session: ActiveUser; connectedAt: number }>();
  for (const session of onlineUsers.values()) {
    const existing = byUser.get(session.userId);
    if (!existing) {
      byUser.set(session.userId, { session, connectedAt: Date.now() });
    }
  }
  return Array.from(byUser.values()).map(({ session }) => ({
    userId: session.userId,
    name: session.name,
    lastActive: new Date(byUser.get(session.userId)!.connectedAt),
  }));
}
