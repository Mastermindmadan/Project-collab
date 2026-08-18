import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendNotificationToUser } from '../utils/socket';
import { recalculateProjectHealth } from '../utils/projectHealth';

export const createTask = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, description, status, priority, dueDate, projectId, assigneeId, milestoneId, parentTaskId } = req.body;

    if (!title || !projectId) {
      return res.status(400).json({ error: 'title and projectId are required.' });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Verify membership
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || '',
        status: status || 'TODO',
        priority: priority || 'LOW',
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId,
        assigneeId: assigneeId || null,
        milestoneId: milestoneId || null,
        parentTaskId: parentTaskId || null
      },
      include: {
        assignee: {
          select: { id: true, name: true, avatarUrl: true }
        }
      }
    });

    // Create Activity Log
    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId,
        action: 'CREATED_TASK',
        metadata: JSON.stringify({ taskId: task.id, title: task.title })
      }
    });

    // Notify assignee if set
    if (assigneeId && assigneeId !== authReq.user.id) {
      const notif = await prisma.notification.create({
        data: {
          userId: assigneeId,
          title: 'New Task Assigned',
          message: `You have been assigned the task: "${task.title}" in project "${project.title}"`
        }
      });
      sendNotificationToUser(assigneeId, notif);
    }

    // Trigger asynchronous project health recalculation
    void recalculateProjectHealth(projectId);

    res.status(201).json({ message: 'Task created successfully', task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateTask = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { taskId } = req.params;
    const { title, description, status, priority, dueDate, assigneeId, milestoneId, parentTaskId } = req.body;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // Verify membership
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: task.project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const previousStatus = task.status;
    const previousAssigneeId = task.assigneeId;

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: title !== undefined ? title : task.title,
        description: description !== undefined ? description : task.description,
        status: status !== undefined ? status : task.status,
        priority: priority !== undefined ? priority : task.priority,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : task.dueDate,
        assigneeId: assigneeId !== undefined ? (assigneeId || null) : task.assigneeId,
        milestoneId: milestoneId !== undefined ? (milestoneId || null) : task.milestoneId,
        parentTaskId: parentTaskId !== undefined ? (parentTaskId || null) : task.parentTaskId
      },
      include: {
        assignee: {
          select: { id: true, name: true, avatarUrl: true }
        }
      }
    });

    // Create logs for status change or completions
    if (status && status !== previousStatus) {
      await prisma.activityLog.create({
        data: {
          userId: authReq.user.id,
          projectId: task.projectId,
          action: status === 'COMPLETED' ? 'COMPLETED_TASK' : 'UPDATED_TASK_STATUS',
          metadata: JSON.stringify({ taskId: task.id, title: task.title, from: previousStatus, to: status })
        }
      });
    }

    // Notify on new assignee
    if (assigneeId && assigneeId !== previousAssigneeId && assigneeId !== authReq.user.id) {
      const notif = await prisma.notification.create({
        data: {
          userId: assigneeId,
          title: 'Task Assigned',
          message: `You have been assigned the task: "${updatedTask.title}"`
        }
      });
      sendNotificationToUser(assigneeId, notif);
    }

    // Trigger asynchronous project health recalculation
    void recalculateProjectHealth(task.projectId);

    res.json({ message: 'Task updated successfully', task: updatedTask });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const deleteTask = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: task.project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    await prisma.task.delete({ where: { id: taskId } });

    // Trigger asynchronous project health recalculation
    void recalculateProjectHealth(task.projectId);

    res.json({ message: 'Task deleted successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Subtasks
export const createSubtask = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { taskId, title } = req.body;
    if (!taskId || !title) {
      return res.status(400).json({ error: 'taskId and title are required.' });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    });

    if (!task) {
      return res.status(404).json({ error: 'Parent task not found.' });
    }

    // Verify membership
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: task.project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const subtask = await prisma.subtask.create({
      data: { taskId, title, isCompleted: false }
    });

    res.status(201).json({ message: 'Subtask created successfully', subtask });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateSubtask = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subtaskId } = req.params;
    const { title, isCompleted } = req.body;

    const subtask = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { task: { include: { project: true } } }
    });

    if (!subtask) {
      return res.status(404).json({ error: 'Subtask not found.' });
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: subtask.task.project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const updated = await prisma.subtask.update({
      where: { id: subtaskId },
      data: {
        title: title !== undefined ? title : subtask.title,
        isCompleted: isCompleted !== undefined ? isCompleted : subtask.isCompleted
      }
    });

    res.json({ message: 'Subtask updated successfully', subtask: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Comments
export const addTaskComment = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { taskId, content } = req.body;
    if (!taskId || !content) {
      return res.status(400).json({ error: 'taskId and content are required.' });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { project: true }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: task.project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId: authReq.user.id,
        content
      },
      include: {
        user: {
          select: { id: true, name: true, avatarUrl: true }
        }
      }
    });

    // Notify assignee if assigned and commenter is not the assignee
    if (task.assigneeId && task.assigneeId !== authReq.user.id) {
      const snippet = content.length > 50 ? content.substring(0, 50) + '...' : content;
      const notif = await prisma.notification.create({
        data: {
          userId: task.assigneeId,
          title: `New Comment on "${task.title}"`,
          message: `${authReq.user.name}: "${snippet}"`
        }
      });
      sendNotificationToUser(task.assigneeId, notif);
    }

    res.status(201).json({ message: 'Comment added successfully', comment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
