// src/routes/email.routes.ts
import { Router } from 'express';

const router = Router();

// Health endpoint for email service configuration
router.get('/health', (_req, res) => {
  const required = ['EMAIL_API_URL', 'EMAIL_API_KEY', 'EMAIL_FROM'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    return res.status(500).json({
      status: 'error',
      message: 'Email provider configuration missing',
      missingVariables: missing,
    });
  }
  return res.json({ status: 'ok', message: 'Email provider configured' });
});

export default router;
