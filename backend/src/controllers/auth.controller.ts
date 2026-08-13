import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in environment variables.');
}

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Helper to generate access and refresh tokens
const generateTokens = (user: { id: string; email: string; name: string; role: 'STUDENT' | 'INSTRUCTOR' }) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

const parseSkills = (skills: any) => {
  if (typeof skills === 'string') {
    try { return JSON.parse(skills); } catch (e) { return []; }
  }
  return Array.isArray(skills) ? skills : [];
};

const purgeExpiredTokens = async () => {
  await prisma.token.deleteMany({ where: { expiresAt: { lt: new Date() } } });
};

const storeRefreshToken = async (userId: string, plainRefreshToken: string) => {
  const hashedRefreshToken = await bcrypt.hash(plainRefreshToken, 10);
  await prisma.token.create({
    data: {
      token: hashedRefreshToken,
      userId,
      type: 'REFRESH',
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
};

const findMatchingRefreshTokenRecord = async (userId: string, plainRefreshToken: string) => {
  const candidates = await prisma.token.findMany({
    where: {
      userId,
      type: 'REFRESH',
      expiresAt: { gte: new Date() },
    },
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  for (const candidate of candidates) {
    const isMatch = await bcrypt.compare(plainRefreshToken, candidate.token);
    if (isMatch) return candidate;
  }

  return null;
};

export const register = async (req: Request, res: Response) => {
  try {
    await purgeExpiredTokens();
    const { email, password, name, role, skills } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name are required.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userRole = role === 'INSTRUCTOR' ? 'INSTRUCTOR' : 'STUDENT';

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: userRole,
        skills: JSON.stringify(Array.isArray(skills) ? skills : [])
      }
    });

    const { accessToken, refreshToken } = generateTokens(user as any);

    await storeRefreshToken(user.id, refreshToken);

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        skills: parseSkills(user.skills)
      },
      accessToken,
      refreshToken
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    await purgeExpiredTokens();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const { accessToken, refreshToken } = generateTokens(user as any);

    await storeRefreshToken(user.id, refreshToken);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        skills: parseSkills(user.skills),
        avatarUrl: user.avatarUrl
      },
      accessToken,
      refreshToken
    });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    await purgeExpiredTokens();
    const { refreshToken } = req.body;

    if (refreshToken && typeof refreshToken === 'string') {
      try {
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { id: string };
        const matched = await findMatchingRefreshTokenRecord(decoded.id, refreshToken);
        if (matched) {
          await prisma.token.delete({ where: { id: matched.id } });
        }
      } catch {
        // Invalid refresh token on logout is non-fatal; return success consistently.
      }
    }

    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    await purgeExpiredTokens();
    const { refreshToken: incomingRefreshToken } = req.body;
    if (!incomingRefreshToken || typeof incomingRefreshToken !== 'string') {
      return res.status(400).json({ error: 'Refresh token is required.' });
    }

    let decoded: { id: string };
    try {
      decoded = jwt.verify(incomingRefreshToken, JWT_REFRESH_SECRET) as { id: string };
    } catch {
      return res.status(403).json({ error: 'Invalid or expired refresh token.' });
    }

    const dbToken = await findMatchingRefreshTokenRecord(decoded.id, incomingRefreshToken);

    if (!dbToken || dbToken.expiresAt < new Date()) {
      return res.status(403).json({ error: 'Invalid or expired refresh token.' });
    }

    const tokens = generateTokens(dbToken.user as any);

    // Rotate refresh token: invalidate old token and persist new hashed token.
    await prisma.token.delete({ where: { id: dbToken.id } });
    await storeRefreshToken(dbToken.userId, tokens.refreshToken);

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      select: {
        id: true, email: true, name: true, role: true,
        skills: true, avatarUrl: true, bio: true,
        github: true, linkedin: true, phone: true, githubUsername: true, createdAt: true
      }
    });

    res.json({ user: user ? { ...user, skills: parseSkills(user.skills) } : null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

    const { name, skills, avatarUrl, bio, github, linkedin, phone, githubUsername } = req.body;

    if (githubUsername && typeof githubUsername === 'string' && githubUsername.trim().length > 0) {
      const cleanUsername = githubUsername.trim();
      const githubRegex = /^(?!.*--)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
      if (!githubRegex.test(cleanUsername)) {
        return res.status(400).json({
          error: 'Invalid GitHub username format. Alphanumeric characters and single hyphens only, max 39 characters, no leading/trailing hyphen.'
        });
      }
    }

    const user = await prisma.user.update({
      where: { id: authReq.user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(skills !== undefined && { skills: Array.isArray(skills) ? JSON.stringify(skills) : undefined }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(bio !== undefined && { bio }),
        ...(github !== undefined && { github }),
        ...(linkedin !== undefined && { linkedin }),
        ...(phone !== undefined && { phone }),
        ...(githubUsername !== undefined && { githubUsername: githubUsername || null }),
      },
      select: {
        id: true, email: true, name: true, role: true,
        skills: true, avatarUrl: true, bio: true,
        github: true, linkedin: true, phone: true, githubUsername: true
      }
    });

    res.json({ message: 'Profile updated successfully', user: { ...user, skills: parseSkills(user.skills) } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Password Reset Flow
import crypto from 'crypto';
import { sendMail } from '../utils/mailer';

// Request password reset – sends email with token link
export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    // Respond with generic message to avoid enumeration
    const genericSuccess = { message: 'If the email exists, a reset link has been sent.' };
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json(genericSuccess);

    // Generate token and hash it for storage
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.token.create({
      data: {
        token: hashedToken,
        userId: user.id,
        expiresAt,
        type: 'PASSWORD_RESET',
      },
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}&id=${user.id}`;
    const html = `<html><body style="font-family:Arial,Helvetica,sans-serif;">
      <h2>Reset Your ProjectCollab AI Password</h2>
      <p>Hi ${user.name || ''},</p>
      <p>We received a request to reset your password. Click the button below to set a new password. This link will expire in 15 minutes.</p>
      <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#4F46E5;color:#fff;border-radius:4px;text-decoration:none;">Reset Password</a>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
      <hr/>
      <p style="font-size:0.9em;color:#555;">— The ProjectCollab AI Team</p>
    </body></html>`;

    await sendMail(email, 'Reset Your ProjectCollab AI Password', html);
    return res.json(genericSuccess);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Reset password using token
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, id, newPassword } = req.body;
    if (!token || !id || !newPassword) return res.status(400).json({ error: 'Missing fields.' });

    const dbToken = await prisma.token.findFirst({
      where: { userId: id, type: 'PASSWORD_RESET' },
    });
    if (!dbToken) return res.status(400).json({ error: 'Invalid or expired token.' });
    if (dbToken.expiresAt < new Date()) {
      await prisma.token.delete({ where: { id: dbToken.id } });
      return res.status(400).json({ error: 'Token has expired.' });
    }
    const isValid = await bcrypt.compare(token, dbToken.token);
    if (!isValid) return res.status(400).json({ error: 'Invalid token.' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    // Remove used token
    await prisma.token.delete({ where: { id: dbToken.id } });
    return res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
