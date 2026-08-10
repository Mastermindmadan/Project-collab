import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';

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

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key-projectcollab-ai-2026-xyz-abc') as {
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
        return res.status(401).json({ error: 'User not found' });
      }

      (req as AuthenticatedRequest).user = user as any;
      next();
    } catch (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  } else {
    res.status(401).json({ error: 'Authorization header is missing or malformed' });
  }
};
