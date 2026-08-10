import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { getAllowedOrigins, isOriginAllowed } from './config/cors';

// Load environment variables
dotenv.config();

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

// Import Socket helper
import { initChatSocket } from './sockets/chat.socket';

const app = express();
const server = http.createServer(app);

// Configure Socket.io
const allowedOrigins = getAllowedOrigins();
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Configure Express middlewares
app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
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
app.use('/api/teams', teamRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api', miscRoutes);
app.use('/api/misc', miscRoutes);

// Initialize Socket.io chat behaviors
initChatSocket(io);

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 ProjectCollab AI server running on port ${PORT}`);
  console.log(`📁 Uploads served at /uploads`);
  console.log(`====================================================`);
});
