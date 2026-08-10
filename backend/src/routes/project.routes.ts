import { Router } from 'express';
import {
  createProject, getProjectDetails, getProjectSummary, updateProject, deleteProject,
  createMilestone, updateMilestone, uploadDocument, getProjectMessages,
  connectRepository, getProjectRepositories, deleteProjectRepository
} from '../controllers/project.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.post('/create', createProject);
router.get('/:projectId/summary', getProjectSummary);
router.get('/:projectId', getProjectDetails);
router.put('/:projectId', updateProject);
router.delete('/:projectId', deleteProject);

// Repositories
router.post('/:projectId/repositories', connectRepository);
router.get('/:projectId/repositories', getProjectRepositories);
router.delete('/:projectId/repositories/:repoId', deleteProjectRepository);

// Messages
router.get('/:projectId/messages', getProjectMessages);

// Milestones
router.post('/milestone', createMilestone);
router.put('/milestone/:milestoneId', updateMilestone);

// Documents
router.post('/document', uploadDocument);

export default router;
