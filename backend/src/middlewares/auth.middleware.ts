import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in environment variables.');
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: 'STUDENT' | 'INSTRUCTOR';
  };
}

export const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        id: string;
        email: string;
        name: string;
        role: 'STUDENT' | 'INSTRUCTOR';
      };

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, name: true, role: true }
      });

      if (!user) {
        logAuthRejection(req, '401 User not found');
        return res.status(401).json({ error: 'User not found' });
      }

      (req as AuthenticatedRequest).user = user as any;
      next();
    } catch (err) {
      // A 403 here means a token WAS sent but could not be verified (expired,
      // malformed, or signed with a different secret). On the chat routes this
      // is the only 403 source for GET /api/chat/channels — getUserChannels has
      // no membership 403 of its own — so this entry point is critical for
      // diagnosing the intermittent "Invalid or expired token" 403s.
      logAuthRejection(req, '403 Invalid or expired token', (err as Error)?.name);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  } else {
    logAuthRejection(req, '401 Authorization token is missing');
    res.status(401).json({ error: 'Authorization token is missing' });
  }
};

/**
 * Single diagnostic line for every authentication rejection so Render logs make
 * the next occurrence self-explanatory (route path + reason + failure detail).
 */
function logAuthRejection(req: Request, reason: string, detail?: string): void {
  console.warn(`[auth] REJECT ${req.method} ${req.originalUrl} -> ${reason}${detail ? ` (${detail})` : ''}`);
}
