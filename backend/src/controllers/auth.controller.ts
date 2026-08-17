import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import crypto from 'crypto';
import { sendMail, SmtpNotConfiguredError } from '../utils/mailer';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in environment variables.');
}

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_OTP_EXPIRY_MINUTES = Number(process.env.PASSWORD_RESET_OTP_EXPIRY_MINUTES || 10);
const PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS || 60);

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

const generateSixDigitOtp = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};

const sendPasswordResetOtp = async (email: string, name: string, otp: string) => {
  const html = `<html><body style="font-family:Arial,Helvetica,sans-serif;">
    <h2>ProjectCollab AI Password Reset Code</h2>
    <p>Hi ${name || 'there'},</p>
    <p>Use the following one-time code to reset your password:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:18px 0;">${otp}</p>
    <p>This code expires in ${PASSWORD_RESET_OTP_EXPIRY_MINUTES} minutes and can be used only once.</p>
    <p>If you did not request this, you can safely ignore this email. No action is needed.</p>
    <hr/>
    <p style="font-size:0.9em;color:#555;">For your security: never share this code with anyone. The ProjectCollab AI team will never ask for it.</p>
    <p style="font-size:0.9em;color:#555;">- The ProjectCollab AI Team</p>
  </body></html>`;

  try {
    await sendMail(email, 'Password Reset OTP', html);
  } catch (err) {
    // In non-production (local dev) with SMTP unconfigured, surface the OTP on
    // the server console so the flow can still be tested. This is explicitly
    // gated away from production to avoid leaking the OTP in prod logs.
    if (err instanceof SmtpNotConfiguredError && process.env.NODE_ENV !== 'production') {
      console.log(`[DEV OTP] Password reset OTP for ${email}: ${otp}`);
      return;
    }
    throw err;
  }
};

const getValidPasswordResetTokens = async (userId: string) => {
  return prisma.token.findMany({
    where: {
      userId,
      type: 'PASSWORD_RESET',
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
};

const findMatchingOtpToken = async (userId: string, otp: string) => {
  const candidates = await getValidPasswordResetTokens(userId);
  for (const candidate of candidates) {
    const isMatch = await bcrypt.compare(otp, candidate.token);
    if (isMatch) return candidate;
  }
  return null;
};

const enforceOtpResendCooldown = async (userId: string) => {
  const latest = await prisma.token.findFirst({
    where: { userId, type: 'PASSWORD_RESET' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (!latest) return;

  const elapsedMs = Date.now() - latest.createdAt.getTime();
  const minIntervalMs = PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS * 1000;
  if (elapsedMs < minIntervalMs) {
    const retryAfterSeconds = Math.ceil((minIntervalMs - elapsedMs) / 1000);
    const error = new Error('OTP_RESEND_COOLDOWN');
    (error as any).retryAfterSeconds = retryAfterSeconds;
    throw error;
  }
};

const issuePasswordResetOtp = async (user: { id: string; email: string; name: string }) => {
  await enforceOtpResendCooldown(user.id);

  const otp = generateSixDigitOtp();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_OTP_EXPIRY_MINUTES * 60 * 1000);

  // Keep a single active OTP per user.
  await prisma.token.deleteMany({ where: { userId: user.id, type: 'PASSWORD_RESET' } });

  await prisma.token.create({
    data: {
      token: hashedOtp,
      userId: user.id,
      type: 'PASSWORD_RESET',
      expiresAt,
    },
  });

  await sendPasswordResetOtp(user.email, user.name, otp);
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

// Password Reset OTP Flow
export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const genericSuccess = { message: 'If the account exists, an OTP has been sent.' };
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json(genericSuccess);

    await issuePasswordResetOtp({ id: user.id, email: user.email, name: user.name });
    return res.json(genericSuccess);
  } catch (error) {
    if ((error as Error).message === 'OTP_RESEND_COOLDOWN') {
      const retryAfter = (error as any).retryAfterSeconds || PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS;
      return res.status(429).json({ error: `Please wait ${retryAfter}s before requesting another OTP.` });
    }
    if (error instanceof SmtpNotConfiguredError) {
      // Honest failure: email could not be delivered, so we must NOT report success.
      console.error('[AUTH] Password reset email failed: SMTP not configured.');
      return res.status(503).json({ error: 'We were unable to send the reset email. Please try again later.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const resendPasswordResetOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const genericSuccess = { message: 'If the account exists, a new OTP has been sent.' };
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json(genericSuccess);

    await issuePasswordResetOtp({ id: user.id, email: user.email, name: user.name });
    return res.json(genericSuccess);
  } catch (error) {
    if ((error as Error).message === 'OTP_RESEND_COOLDOWN') {
      const retryAfter = (error as any).retryAfterSeconds || PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS;
      return res.status(429).json({ error: `Please wait ${retryAfter}s before requesting another OTP.` });
    }
    if (error instanceof SmtpNotConfiguredError) {
      console.error('[AUTH] Password reset email (resend) failed: SMTP not configured.');
      return res.status(503).json({ error: 'We were unable to send the reset email. Please try again later.' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const verifyPasswordResetOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required.' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    const matchedToken = await findMatchingOtpToken(user.id, String(otp));
    if (!matchedToken) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    return res.json({ message: 'OTP verified successfully.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;
    if (!email || !otp || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    const matchedToken = await findMatchingOtpToken(user.id, String(otp));
    if (!matchedToken) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // Single-use OTP: invalidate all reset tokens once password is changed.
    await prisma.token.deleteMany({ where: { userId: user.id, type: 'PASSWORD_RESET' } });

    return res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
