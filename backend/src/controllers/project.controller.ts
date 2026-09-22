import { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { recalculateProjectHealth } from '../utils/projectHealth';

export const getAvailableUsers = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        skills: true,
        _count: {
          select: {
            assignedTasks: {
              where: {
                status: {
                  not: 'COMPLETED',
                },
              },
            },
            teamMembers: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const formatted = users.map((u) => {
      let skillsArr: string[] = [];
      if (typeof u.skills === 'string') {
        try { skillsArr = JSON.parse(u.skills); } catch { skillsArr = []; }
      } else if (Array.isArray(u.skills)) {
        skillsArr = u.skills;
      }

      const openTasksCount = u._count?.assignedTasks ?? 0;
      const teamsCount = u._count?.teamMembers ?? 0;
      let availabilityStatus: 'AVAILABLE' | 'ASSIGNED' | 'BUSY' = 'AVAILABLE';
      let availabilityLabel = 'Available';

      if (openTasksCount > 3) {
        availabilityStatus = 'BUSY';
        availabilityLabel = `Busy (${openTasksCount} tasks)`;
      } else if (openTasksCount > 0 || teamsCount > 1) {
        availabilityStatus = 'ASSIGNED';
        availabilityLabel = openTasksCount > 0 ? `Assigned (${openTasksCount} tasks)` : `Assigned (${teamsCount} teams)`;
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatarUrl,
        role: u.role,
        skills: skillsArr,
        openTasksCount,
        teamsCount,
        availabilityStatus,
        availabilityLabel,
      };
    });

    res.json({ users: formatted });
  } catch (error) {
    console.error('[getAvailableUsers ERROR]', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const createProjectWithTeam = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      title,
      description,
      techStack,
      githubRepo,
      teamName,
      existingTeamId,
      memberIds = [],
      objectives = [],
      startDate,
      endDate,
      milestones = [],
      tasks = [],
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Project title is required.' });
    }
    if (!existingTeamId && (!teamName || !teamName.trim())) {
      return res.status(400).json({ error: 'Team name or existing team selection is required.' });
    }

    const creatorId = authReq.user.id;

    // Ensure creator is included and prevent duplicates
    const rawMemberIds = Array.isArray(memberIds) ? memberIds : [];
    const uniqueMemberIds = Array.from(new Set([creatorId, ...rawMemberIds]));

    // Atomic transaction for Team + Members + Project + Objectives + Calendar Events + Milestones + Tasks + Activity Log
    const result = await prisma.$transaction(async (tx) => {
      let teamIdToUse = existingTeamId;

      if (teamIdToUse) {
        // Verify existing team exists
        const existingTeam = await tx.team.findUnique({
          where: { id: teamIdToUse },
          include: { members: true },
        });
        if (!existingTeam) {
          throw new Error('Selected existing team not found.');
        }

        // Add any missing selected members to this existing team
        const currentMemberUserIds = new Set(existingTeam.members.map((m: any) => m.userId));
        for (const userId of uniqueMemberIds) {
          if (!currentMemberUserIds.has(userId)) {
            await tx.teamMember.create({
              data: {
                userId,
                teamId: teamIdToUse,
                role: userId === creatorId ? 'OWNER' : 'MEMBER',
              },
            });
          }
        }
      } else {
        // Generate unique 8-character invite code for new team
        let inviteCode = '';
        let isUnique = false;
        while (!isUnique) {
          inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
          const existing = await tx.team.findUnique({ where: { inviteCode } });
          if (!existing) isUnique = true;
        }

        // 1. Create the new Team
        const team = await tx.team.create({
          data: {
            name: teamName.trim(),
            inviteCode,
          },
        });
        teamIdToUse = team.id;

        // 2. Add creator as OWNER and other selected members as MEMBER
        for (const userId of uniqueMemberIds) {
          await tx.teamMember.create({
            data: {
              userId,
              teamId: team.id,
              role: userId === creatorId ? 'OWNER' : 'MEMBER',
            },
          });
        }
      }

      // 3. Create the Project
      const parsedTechStack = Array.isArray(techStack) ? techStack : [];
      const parsedObjectives = Array.isArray(objectives) ? objectives : [];
      const parsedStartDate = startDate ? new Date(startDate) : null;
      const parsedEndDate = endDate ? new Date(endDate) : null;

      const project = await tx.project.create({
        data: {
          title: title.trim(),
          description: description?.trim() || '',
          objectives: JSON.stringify(parsedObjectives),
          techStack: parsedTechStack,
          githubRepo: githubRepo?.trim() || null,
          startDate: parsedStartDate,
          endDate: parsedEndDate,
          teamId: teamIdToUse,
          healthScore: 100,
          status: 'HEALTHY',
        },
      });

      // 4. Auto-create calendar events if dates provided
      if (parsedStartDate) {
        try {
          const startEvent = await tx.calendarEvent.create({
            data: {
              projectId: project.id,
              title: `${project.title} (Project Start)`,
              date: parsedStartDate,
              type: 'project_start',
              description: `Project kicked off: ${project.title}`,
            },
          });
          await tx.project.update({
            where: { id: project.id },
            data: { startEventId: startEvent.id },
          });
        } catch {
          // Non-fatal if table not initialized
        }
      }

      if (parsedEndDate) {
        try {
          const endEvent = await tx.calendarEvent.create({
            data: {
              projectId: project.id,
              title: `${project.title} (Project Deadline)`,
              date: parsedEndDate,
              type: 'project_deadline',
              description: `Project delivery deadline: ${project.title}`,
            },
          });
          await tx.project.update({
            where: { id: project.id },
            data: { endEventId: endEvent.id },
          });
        } catch {
          // Non-fatal
        }
      }

      // 5. Create Milestones and nested Tasks if supplied
      const milestoneMap = new Map<string, string>(); // title/key -> milestoneId
      const createdMilestones = [];
      const createdTasks = [];

      if (Array.isArray(milestones) && milestones.length > 0) {
        for (const ms of milestones) {
          if (!ms.title || !ms.title.trim()) continue;
          const msDueDate = ms.dueDate ? new Date(ms.dueDate) : parsedEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          const milestone = await tx.milestone.create({
            data: {
              projectId: project.id,
              title: ms.title.trim(),
              description: ms.description?.trim() || '',
              dueDate: msDueDate,
              status: 'PENDING',
            },
          });
          createdMilestones.push(milestone);
          milestoneMap.set(ms.title.trim().toLowerCase(), milestone.id);

          // If milestone has nested tasks
          if (Array.isArray(ms.tasks) && ms.tasks.length > 0) {
            for (const t of ms.tasks) {
              if (!t.title || !t.title.trim()) continue;
              const taskDueDate = t.dueDate ? new Date(t.dueDate) : msDueDate;
              const taskPriority = ['HIGH', 'MEDIUM', 'LOW'].includes((t.priority || '').toUpperCase())
                ? t.priority.toUpperCase()
                : 'MEDIUM';
              const assignedUserId = t.assigneeId && uniqueMemberIds.includes(t.assigneeId) ? t.assigneeId : null;

              const task = await tx.task.create({
                data: {
                  title: t.title.trim(),
                  description: t.description?.trim() || '',
                  priority: taskPriority,
                  status: 'TODO',
                  projectId: project.id,
                  milestoneId: milestone.id,
                  assigneeId: assignedUserId,
                  dueDate: taskDueDate,
                },
              });
              createdTasks.push(task);
            }
          }
        }
      }

      // 6. Create standalone tasks if passed separately
      if (Array.isArray(tasks) && tasks.length > 0) {
        for (const t of tasks) {
          if (!t.title || !t.title.trim()) continue;
          let milestoneId: string | null = null;
          if (t.milestoneTitle) {
            milestoneId = milestoneMap.get(t.milestoneTitle.trim().toLowerCase()) || null;
          } else if (typeof t.milestoneIndex === 'number' && createdMilestones[t.milestoneIndex]) {
            milestoneId = createdMilestones[t.milestoneIndex].id;
          }

          const taskDueDate = t.dueDate ? new Date(t.dueDate) : parsedEndDate;
          const taskPriority = ['HIGH', 'MEDIUM', 'LOW'].includes((t.priority || '').toUpperCase())
            ? t.priority.toUpperCase()
            : 'MEDIUM';
          const assignedUserId = t.assigneeId && uniqueMemberIds.includes(t.assigneeId) ? t.assigneeId : null;

          const task = await tx.task.create({
            data: {
              title: t.title.trim(),
              description: t.description?.trim() || '',
              priority: taskPriority,
              status: 'TODO',
              projectId: project.id,
              milestoneId,
              assigneeId: assignedUserId,
              dueDate: taskDueDate,
            },
          });
          createdTasks.push(task);
        }
      }

      // 7. Activity log
      await tx.activityLog.create({
        data: {
          userId: creatorId,
          projectId: project.id,
          action: 'CREATED_PROJECT',
          metadata: JSON.stringify({
            title: project.title,
            membersCount: uniqueMemberIds.length,
            milestonesCount: createdMilestones.length,
            tasksCount: createdTasks.length,
          }),
        },
      });

      // Fetch team with populated members
      const teamWithMembers = await tx.team.findUnique({
        where: { id: teamIdToUse },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true, avatarUrl: true, skills: true },
              },
            },
          },
        },
      });

      // Fetch newly created project with relations
      const fullProject = await tx.project.findUnique({
        where: { id: project.id },
        include: {
          milestones: { include: { tasks: true } },
          tasks: { include: { assignee: true } },
        },
      });

      return { project: fullProject, team: teamWithMembers };
    });

    res.status(201).json({
      message: 'Project and team created successfully',
      project: result.project,
      team: result.team
    });
  } catch (error: any) {
    console.error('[createProjectWithTeam ERROR]', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};

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

export const getMyProjects = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const projects = await prisma.project.findMany({
      where: {
        team: {
          members: {
            some: {
              userId: authReq.user.id
            }
          }
        }
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            members: {
              select: {
                role: true,
                user: {
                  select: { id: true, name: true, email: true, avatarUrl: true }
                }
              }
            }
          }
        },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            assigneeId: true
          }
        },
        milestones: {
          select: {
            id: true,
            title: true,
            dueDate: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ projects });
  } catch (error) {
    console.error('[getMyProjects ERROR]', error);
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
        documents: {
          include: {
            versions: {
              orderBy: { version: 'desc' }
            },
            uploadedBy: { select: { id: true, name: true } }
          },
          orderBy: { createdAt: 'desc' }
        },
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
    const healthResult = await recalculateProjectHealth(projectId);
    if (healthResult) {
      project.healthScore = healthResult.healthScore;
      project.status = healthResult.status;
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
        vercelProjectId: true,
        renderServiceId: true,
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
    // NOTE: healthScore and status are computed fields — intentionally excluded
    // from client-controlled updates so callers cannot tamper with the health model.
    const { title, description, objectives, githubRepo } = req.body;

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

export const updateProjectDeploySettings = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.params;
    // Only the two per-project provider ids may be written here. Account-level
    // API tokens (VERCEL_API_TOKEN / RENDER_API_KEY) can never be set via this
    // endpoint — they stay in backend env.
    const { vercelProjectId, renderServiceId } = req.body;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Any team member may configure deployment ids for their project (they do
    // not reveal provider tokens — only target service ids).
    const membership = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId: authReq.user.id, teamId: project.teamId } }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this project.' });
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        vercelProjectId:
          vercelProjectId !== undefined
            ? (typeof vercelProjectId === 'string' && vercelProjectId.trim() ? vercelProjectId.trim() : null)
            : project.vercelProjectId,
        renderServiceId:
          renderServiceId !== undefined
            ? (typeof renderServiceId === 'string' && renderServiceId.trim() ? renderServiceId.trim() : null)
            : project.renderServiceId,
      }
    });

    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId,
        action: 'UPDATED_DEPLOY_SETTINGS',
        metadata: JSON.stringify({
          vercelConfigured: !!updatedProject.vercelProjectId,
          renderConfigured: !!updatedProject.renderServiceId
        })
      }
    });

    res.json({ message: 'Deployment settings updated successfully', project: updatedProject });
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

    // Trigger project health recalculation
    void recalculateProjectHealth(projectId);

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
        title: title !== undefined ? title : milestone.title,
        description: description !== undefined ? description : milestone.description,
        dueDate: dueDate ? new Date(dueDate) : milestone.dueDate,
        status: status !== undefined ? status : milestone.status
      }
    });

    // Trigger project health recalculation
    void recalculateProjectHealth(milestone.projectId);

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
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { projectId } = req.params;

    // Verify the user is a member of the team that owns this project
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { teamId: true },
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
    let path = fullPath
      ? fullPath
          .trim()
          .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
          .replace(/\/+$/, '')
          .replace(/\.git$/i, '')
      : '';

    if (path && (!owner || !repoName)) {
      const parts = path.split('/').filter(Boolean);
      owner = parts[0] || '';
      repoName = parts[1] || '';
    } else if (owner && repoName) {
      path = `${owner}/${repoName}`.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
    }

    if (path) {
      const parts = path.split('/').filter(Boolean);
      owner = parts[0] || '';
      repoName = parts[1] || '';
      path = owner && repoName ? `${owner}/${repoName}` : '';
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
