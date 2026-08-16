import { Router } from 'express';
import { createTeam, joinTeam, getTeamDetails, getMyTeams, updateMemberRole, removeMember, generateQRCodeInvite, updateTeamName, addMember } from '../controllers/team.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.post('/create', createTeam);
router.post('/join', joinTeam);
router.get('/my-teams', getMyTeams);
router.get('/:teamId', getTeamDetails);
router.put('/role', updateMemberRole);
router.post('/remove', removeMember);
router.post('/add-member', addMember);
router.post('/name', updateTeamName);
router.get('/:teamId/qr-invite', generateQRCodeInvite);

export default router;
