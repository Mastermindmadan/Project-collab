import { Router } from 'express';
import { register, login, logout, refreshToken, getProfile, updateProfile, requestPasswordReset, resendPasswordResetOtp, verifyPasswordResetOtp, resetPassword } from '../controllers/auth.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { authRateLimiter, otpRequestRateLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/logout', logout);
router.post('/refresh-token', refreshToken);

// Protected routes
router.get('/profile', authenticateJWT, getProfile);
router.put('/profile', authenticateJWT, updateProfile);

// Password Reset OTP Flow (with abuse/brute-force protection)
router.post('/request-password-reset', otpRequestRateLimiter, requestPasswordReset);
router.post('/resend-password-reset-otp', otpRequestRateLimiter, resendPasswordResetOtp);
router.post('/verify-password-reset-otp', otpRequestRateLimiter, verifyPasswordResetOtp);
router.post('/reset-password', authRateLimiter, resetPassword);

export default router;

