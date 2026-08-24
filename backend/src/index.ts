import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { isOriginAllowed, getAllowedOrigins, ALLOWED_METHODS, ALLOWED_HEADERS, USE_CREDENTIALS } from './config/cors';
import { isCloudinaryConfigured, logCloudinaryDiagnostics } from './utils/cloudinary';

// Load environment variables
dotenv.config();

// ─── Startup Environment Validation ─────────────────────────────────────────
// Fail fast in production if critical secrets are missing, so the server doesn't
// boot with insecure defaults (e.g. predictable JWT secrets).
const requiredEnv = ['DATABASE_URL', 'JWT_SECRET', 'ALLOWED_ORIGINS', 'FRONTEND_URL'];
const missingEnv = requiredEnv.filter(k => !process.env[k]);
if ((process.env.NODE_ENV || 'development') === 'production') {
  if (missingEnv.length) throw new Error(`FATAL: Missing required env vars: ${missingEnv.join(', ')}`);
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'super-secret-key-projectcollab-ai-2026-xyz-abc') {
    throw new Error('FATAL: JWT_SECRET is unset or still using the insecure default. Set a strong random secret.');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === 'super-secret-refresh-key-projectcollab-ai-2026-xyz-abc') {
    throw new Error('FATAL: JWT_REFRESH_SECRET is unset or still using the insecure default. Set a strong random secret.');
  }
  // Password-reset emails cannot be delivered without SMTP. Fail loudly so ops
  // notices the misconfiguration instead of users getting silent failures.
  const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  if (!smtpConfigured) {
    console.warn('[STARTUP] WARNING: SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS). Password-reset OTP emails will NOT be delivered. Set these env vars to enable email delivery.');
  }
}

// Cloudinary is the ONLY persistence path for file uploads — there is no
// local-disk fallback anymore because Render's disk is ephemeral and wiped on
// every deploy/restart. Warn loudly at boot when Cloudinary is missing/invalid
// so the misconfiguration is visible in Render logs immediately instead of
// surfacing through user-visible upload failures days later.
logCloudinaryDiagnostics();
if (!isCloudinaryConfigured()) {
  console.warn(
    '[STARTUP] WARNING: Cloudinary is not configured properly (CLOUDINARY_CLOUD_NAME, ' +
      'CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set without quotes/spaces).'
  );
}

// Imports routers
import authRoutes from './routes/auth.routes';
import teamRoutes from './routes/team.routes';
import projectRoutes from './routes/project.routes';
import taskRoutes from './routes/task.routes';
import aiRoutes from './routes/ai.routes';
import githubRoutes from './routes/github.routes';
import analyticsRoutes from './routes/analytics.routes';
import miscRoutes from './routes/misc.routes';
import uploadRoutes from './routes/upload.routes';
import searchRoutes from './routes/search.routes';
import driveRoutes from './routes/drive.routes';
import reportsRoutes from './routes/reports.routes';
import chatRoutes from './routes/chat.routes';

import filesRoutes from './routes/files.routes';
import aipmRoutes from './routes/aipm.routes';


// Import Socket helper
import { initChatSocket } from './sockets/chat.socket';
import { setIO } from './utils/socket';
import { startDeadlineReminderCron } from './services/reminder.service';
import prisma from './utils/prisma';

const app = express();
const server = http.createServer(app);

// Configure Socket.io
const io = new Server(server, {
  transports: ['websocket', 'polling'],
  cors: {
    // Same CORS allow-list as the Express middleware (see src/config/cors.ts)
    origin(origin, callback) {
      if (isOriginAllowed(origin)) callback(null, true);
      else callback(new Error('Origin not allowed by CORS'));
    },
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    credentials: USE_CREDENTIALS,
  },
});
setIO(io);

// Configure Express middlewares
//
// IMPORTANT: this must be registered BEFORE the API routers and before any
// middleware that could reject requests. Preflight (OPTIONS) requests are
// short-circuited here (preflightContinue: false) so they receive CORS headers
// + a 204 status WITHOUT ever reaching the JWT authentication middleware.
app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    credentials: USE_CREDENTIALS, // Bearer JWT auth — cookies are not used.
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files as static assets
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Root & Health Endpoints
app.get('/', (_req, res) => {
  res.send(`
    <div style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc; height: 100vh;">
      <h2>🚀 ProjectCollab AI API Server</h2>
      <p>Status: <span style="color: #10b981; font-weight: bold;">ONLINE &amp; HEALTHY</span></p>
      <p>API Base Path: <code>/api</code></p>
      <p>Health Check: <a href="/api/health" style="color: #60a5fa;">/api/health</a></p>
    </div>
  `);
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'ProjectCollab AI API server is healthy and running.' });
});

// Setup API routers
app.use('/api/auth', authRoutes);
import emailRoutes from './routes/email.routes';
app.use('/api/email', emailRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', miscRoutes);
app.use('/api/misc', miscRoutes);
app.use('/api/ai-pm', aipmRoutes);


// Initialize Socket.io chat behaviors
initChatSocket(io);

// Initialize Deadline Reminders Cron
startDeadlineReminderCron();

// Start the server
// Production (Render) injects $PORT; fall back to 5000 only for local dev.
// Explicitly bind 0.0.0.0 so Render's proxy can reach the listener.
const PORT: number = Number(process.env.PORT) || 5000;

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 ProjectCollab AI server running on port ${PORT}`);
  console.log(`📁 Uploads served at /uploads`);
  console.log(`🌐 CORS ALLOWED_ORIGINS (raw env): "${process.env.ALLOWED_ORIGINS || ''}"`);
  console.log(`🌐 CORS Allowed Origins (active):`, getAllowedOrigins());
  console.log(`====================================================`);

  prisma.$connect()
    .then(() => console.log('✅ Database connected successfully.'))
    .catch((err) => console.error('⚠️ Database connection warning:', err.message));
});

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
