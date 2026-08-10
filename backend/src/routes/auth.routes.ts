import { Router } from 'express';
import { register, login, logout, refreshToken, getProfile, updateProfile, requestPasswordReset, resetPassword } from '../controllers/auth.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';
import { authRateLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', authRateLimiter, login);
router.post('/logout', logout);
router.post('/refresh-token', refreshToken);

// Protected routes
router.get('/profile', authenticateJWT, getProfile);
router.put('/profile', authenticateJWT, updateProfile);

router.post('/request-password-reset', authRateLimiter, requestPasswordReset);
router.post('/reset-password', authRateLimiter, resetPassword);

export default router;

