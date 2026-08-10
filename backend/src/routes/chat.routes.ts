import { Router } from 'express';
import { getUserChannels, getTeamMessages, sendTeamMessage } from '../controllers/chat.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/channels', getUserChannels);
router.get('/team/:teamId', getTeamMessages);
router.post('/team/:teamId/message', sendTeamMessage);

export default router;
