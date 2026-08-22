import { Router } from 'express';
import { getUserChannels, getTeamMessages, sendTeamMessage, deleteTeamMessage } from '../controllers/chat.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/channels', getUserChannels);
router.get('/team/:teamId', getTeamMessages);
router.post('/team/:teamId/message', sendTeamMessage);
router.delete('/team/:teamId/message/:messageId', deleteTeamMessage);

export default router;
