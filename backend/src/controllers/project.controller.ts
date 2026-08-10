import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const createProject = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, description, objectives, teamId, githubRepo } = req.body;

    if (!title || !teamId) {
      return res.status(400).json({ error: 'Title and teamId are required.' });
    }

    // Verify member is part of the team
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this team.' });
    }

    const project = await prisma.project.create({
      data: {
        title,
        description: description || '',
        objectives: JSON.stringify(Array.isArray(objectives) ? objectives : []),
        githubRepo: githubRepo || null,
        teamId,
        healthScore: 100,
        status: 'HEALTHY'
      }
    });

    // Create a base log
    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId: project.id,
        action: 'CREATED_PROJECT',
        metadata: JSON.stringify({ title: project.title })
      }
    });

    res.status(201).json({
      message: 'Project created successfully',
      project
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getProjectDetails = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        milestones: {
          orderBy: { dueDate: 'asc' }
        },
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true, avatarUrl: true }
            },
            oldSubtasks: true,
            comments: {
              include: {
                user: {
                  select: { id: true, name: true, avatarUrl: true }
                }
              },
              orderBy: { createdAt: 'asc' }
            }
          }
        },
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, avatarUrl: true, skills: true }
                }
              }
            }
          }
        },
        documents: true,
        meetings: {
          orderBy: { dateTime: 'asc' }
        },
        gitAnalytics: true,
        repositories: {
          include: {
            connectedBy: { select: { id: true, name: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Verify membership
    const membership = await prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: authReq.user.id,
          teamId: project.teamId
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Dynamic health calculation based on actual progress/metrics
    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter(t => t.status === 'COMPLETED').length;
    const taskCompletionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;

    const commitsCount = project.gitAnalytics?.commitsCount || 0;
    
    // Count chat messages for this team
    const chatActivityCount = await prisma.message.count({
      where: { teamId: project.teamId }
    });

    const now = new Date();
    const overdueTasksCount = project.tasks.filter(
      t => t.status !== 'COMPLETED' && t.dueDate && new Date(t.dueDate) < now
    ).length;

    const overdueMilestonesCount = project.milestones.filter(
      m => m.status !== 'COMPLETED' && new Date(m.dueDate) < now
    ).length;

    const overdueCount = overdueTasksCount + overdueMilestonesCount;

    // Health score formula mirroring AIService
    const taskScore = taskCompletionRate * 100 * 0.40;
    const commitRatio = Math.min(commitsCount / 15, 1);
    const commitScore = commitRatio * 100 * 0.30;
    const chatRatio = Math.min(chatActivityCount / 10, 1);
    const chatScore = chatRatio * 100 * 0.15;
    const overduePenalty = Math.min(overdueCount * 8, 15);
    
    let baselineScore = taskScore + commitScore + chatScore;
    if (totalTasks === 0) {
      // If there are no tasks yet, starting baseline health is 70 (Attention Required), since no progress has started.
      baselineScore = 70 + commitScore + chatScore;
    }
    const healthScore = Math.max(Math.min(Math.round(baselineScore - overduePenalty), 100), 10);

    let status: 'HEALTHY' | 'ATTENTION' | 'RISK' = 'HEALTHY';
    if (healthScore < 50) {
      status = 'RISK';
    } else if (healthScore < 75) {
      status = 'ATTENTION';
    }

    // Update in database so it persists and matches the list view
    if (project.healthScore !== healthScore || project.status !== status) {
      await prisma.project.update({
        where: { id: projectId },
        data: { healthScore, status }
      });
      project.healthScore = healthScore;
      project.status = status;
    }

    res.json({ project });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Lightweight payload for dashboard and analytics cards. Keep the full detail
// query above for views that need comments, documents, meetings, and full members.
export const getProjectSummary = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.params;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        healthScore: true,
        teamId: true,
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            assigneeId: true,
            assignee: { select: { id: true, name: true } }
          }
        },
        milestones: {
          select: { id: true, title: true, status: true, dueDate: true }
        }
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({ project });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateProject = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.params;
    const { title, description, objectives, githubRepo, healthScore, status } = req.body;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Check membership (only team owners or admins should modify project settings)
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership || (membership.role !== 'OWNER' && membership.role !== 'ADMIN')) {
      return res.status(403).json({ error: 'Permission denied. Must be Team Owner or Admin.' });
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        title: title !== undefined ? title : project.title,
        description: description !== undefined ? description : project.description,
        objectives: objectives !== undefined ? objectives : project.objectives,
        githubRepo: githubRepo !== undefined ? githubRepo : project.githubRepo,
        healthScore: healthScore !== undefined ? healthScore : project.healthScore,
        status: status !== undefined ? status : project.status
      }
    });

    // Create log
    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId,
        action: 'UPDATED_PROJECT',
        metadata: JSON.stringify({ updatedFields: Object.keys(req.body) })
      }
    });

    res.json({ message: 'Project updated successfully', project: updatedProject });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Verify ownership
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership || membership.role !== 'OWNER') {
      return res.status(403).json({ error: 'Permission denied. Only Team Owner can delete a project.' });
    }

    await prisma.project.delete({ where: { id: projectId } });

    res.json({ message: 'Project deleted successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Milestones
export const createMilestone = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId, title, description, dueDate } = req.body;

    if (!projectId || !title || !dueDate) {
      return res.status(400).json({ error: 'projectId, title, and dueDate are required.' });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Check membership
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const milestone = await prisma.milestone.create({
      data: {
        projectId,
        title,
        description: description || '',
        dueDate: new Date(dueDate),
        status: 'PENDING'
      }
    });

    // Create log
    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId,
        action: 'CREATED_MILESTONE',
        metadata: JSON.stringify({ title: milestone.title })
      }
    });

    res.status(201).json({ message: 'Milestone created successfully', milestone });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const updateMilestone = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { milestoneId } = req.params;
    const { title, description, dueDate, status } = req.body;

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { project: true }
    });

    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found.' });
    }

    // Check membership
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: milestone.project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const updated = await prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        title: title || milestone.title,
        description: description !== undefined ? description : milestone.description,
        dueDate: dueDate ? new Date(dueDate) : milestone.dueDate,
        status: status || milestone.status
      }
    });

    res.json({ message: 'Milestone updated successfully', milestone: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const uploadDocument = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId, name, fileUrl, category } = req.body;

    if (!projectId || !name || !fileUrl || !category) {
      return res.status(400).json({ error: 'projectId, name, fileUrl, and category are required.' });
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

    const document = await prisma.document.create({
      data: {
        name,
        fileUrl,
        category,
        projectId,
        uploadedById: authReq.user.id
      }
    });

    // Create log
    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId,
        action: 'UPLOADED_DOCUMENT',
        metadata: JSON.stringify({ name: document.name, category: document.category })
      }
    });

    res.status(201).json({ message: 'Document uploaded successfully', document });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getProjectMessages = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const messages = await prisma.message.findMany({
      where: { projectId },
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    res.json({ messages });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

export const connectRepository = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.params;
    const { fullPath, owner: inputOwner, repoName: inputRepoName } = req.body;

    let owner = inputOwner;
    let repoName = inputRepoName;
    let path = fullPath ? fullPath.replace('https://github.com/', '').trim() : '';

    if (path && (!owner || !repoName)) {
      const parts = path.split('/');
      owner = parts[0] || '';
      repoName = parts[1] || '';
    } else if (owner && repoName) {
      path = `${owner}/${repoName}`;
    }

    if (!owner || !repoName || !path) {
      return res.status(400).json({ error: 'Repository owner and repoName (or fullPath "owner/repo") are required.' });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. You must be a team member to connect repositories.' });
    }

    const repository = await prisma.repository.upsert({
      where: {
        projectId_fullPath: { projectId, fullPath: path }
      },
      update: {
        owner,
        repoName,
        connectedByUserId: authReq.user.id
      },
      create: {
        projectId,
        owner,
        repoName,
        fullPath: path,
        connectedByUserId: authReq.user.id
      },
      include: {
        connectedBy: { select: { id: true, name: true, avatarUrl: true } }
      }
    });

    if (!project.githubRepo) {
      await prisma.project.update({
        where: { id: projectId },
        data: { githubRepo: path }
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId,
        action: 'CONNECTED_REPOSITORY',
        metadata: JSON.stringify({ fullPath: path })
      }
    });

    res.status(201).json({ message: 'Repository connected successfully', repository });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const getProjectRepositories = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.params;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const repositories = await prisma.repository.findMany({
      where: { projectId },
      include: {
        connectedBy: { select: { id: true, name: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({ repositories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const deleteProjectRepository = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId, repoId } = req.params;
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: { project: true }
    });

    if (!repo || repo.projectId !== projectId) {
      return res.status(404).json({ error: 'Repository link not found.' });
    }

    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: repo.project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    await prisma.repository.delete({ where: { id: repoId } });

    res.json({ message: 'Repository disconnected successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
