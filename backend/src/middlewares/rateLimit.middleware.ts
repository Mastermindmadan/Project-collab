import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from './auth.middleware';

/** Brute-force protection for login and password-reset flows. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many attempts. Please wait 15 minutes before trying again.',
    });
  },
});

/** Per-user hourly cap on Gemini-backed endpoints. */
export const geminiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = (req as AuthenticatedRequest).user;
    return user?.id ?? req.ip ?? 'anonymous';
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: "You've reached the hourly limit for AI requests. Please try again later.",
    });
  },
});
