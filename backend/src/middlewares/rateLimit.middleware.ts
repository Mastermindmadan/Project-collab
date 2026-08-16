import rateLimit from 'express-rate-limit';
import { Request } from 'express';
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

/** Dedicated limiter for OTP send/resend to reduce abuse. */
export const otpRequestRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many OTP requests. Please wait before trying again.',
    });
  },
});

/**
 * Per-user hourly cap on Gemini-backed endpoints.
 * Keys by authenticated user ID when available; falls back to the
 * default IP-based keying (express-rate-limit handles IPv6 normalisation
 * internally when keyGenerator returns undefined / is omitted).
 */
export const geminiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  // Only supply a custom key when we have a real user ID.
  // Returning undefined lets express-rate-limit fall back to its own
  // IPv6-safe IP resolution, avoiding ERR_ERL_KEY_GEN_IPV6.
  keyGenerator: (req: Request): string => {
    const user = (req as AuthenticatedRequest).user;
    if (user?.id) return user.id;
    // Let the library's default IP key handle unauthenticated requests
    // by returning the forwarded-for header or the socket address.
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0] ?? req.socket.remoteAddress ?? 'unknown';
    return ip;
  },
  handler: (_req, res) => {
    res.status(429).json({
      error: "You've reached the hourly limit for AI requests. Please try again later.",
    });
  },
});
