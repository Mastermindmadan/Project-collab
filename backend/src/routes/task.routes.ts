import { Router } from 'express';
import { createTask, updateTask, deleteTask, createSubtask, updateSubtask, addTaskComment } from '../controllers/task.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.post('/create', createTask);
router.put('/:taskId', updateTask);
router.delete('/:taskId', deleteTask);

// Subtasks
router.post('/subtask', createSubtask);
router.put('/subtask/:subtaskId', updateSubtask);

// Comments
router.post('/comment', addTaskComment);

export default router;
