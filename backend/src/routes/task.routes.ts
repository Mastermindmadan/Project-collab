import { Router } from 'express';
import { createTask, updateTask, deleteTask, createSubtask, updateSubtask, deleteSubtask, addTaskComment, getMyTasks } from '../controllers/task.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', getMyTasks);
router.get('/my-tasks', getMyTasks);
router.post('/', createTask);
router.post('/create', createTask);
router.put('/:taskId', updateTask);
router.delete('/:taskId', deleteTask);

// Subtasks
router.post('/subtask', createSubtask);
router.put('/subtask/:subtaskId', updateSubtask);
router.delete('/subtask/:subtaskId', deleteSubtask);

// Comments
router.post('/comment', addTaskComment);

export default router;
