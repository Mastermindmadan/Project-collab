import { Router } from 'express';
import {
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
  getProjectActivityFeed,
  createMeeting,
  getActiveSessions
} from '../controllers/misc.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

// Notifications
router.get('/notifications', getNotifications);
router.patch('/notifications/mark-read', markNotificationsRead);
router.put('/notifications/mark-all-read', markNotificationsRead);
router.put('/notifications/:id/read', markNotificationRead);

// Active Sessions
router.get('/sessions', getActiveSessions);

// Activity Log Feed
router.get('/projects/:projectId/activities', getProjectActivityFeed);

// Meetings
router.post('/meetings', createMeeting);

export default router;
