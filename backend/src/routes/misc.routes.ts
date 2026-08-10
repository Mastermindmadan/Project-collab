import { Router } from 'express';
import { getNotifications, markNotificationRead, getProjectActivityFeed, createMeeting } from '../controllers/misc.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

// Notifications
router.get('/notifications', getNotifications);
router.put('/notifications/:id/read', markNotificationRead);

// Activity Log Feed
router.get('/projects/:projectId/activities', getProjectActivityFeed);

// Meetings
router.post('/meetings', createMeeting);

export default router;
