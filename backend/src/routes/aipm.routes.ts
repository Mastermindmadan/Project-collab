import { Router } from 'express';
import prisma from '../utils/prisma';
import { authenticateJWT, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { AIRouterService } from '../services/aiRouter.service';
import { geminiRateLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();
router.use(authenticateJWT);

// Typed alias for new models until `prisma generate` is run after schema migration
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ─── Helper: parse skill list from User.skills JSON string ────────────────────
function parseSkills(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

// ─── Helper: suggest an assignee from team members based on skills ─────────────
function suggestAssignee(
  taskSkills: string[],
  members: Array<{ id: string; name: string; skills: string[]; avatarUrl?: string | null }>,
): string | null {
  if (!taskSkills.length || !members.length) return null;
  let best: string | null = null;
  let bestScore = -1;
  for (const m of members) {
    const score = taskSkills.filter((s) =>
      m.skills.map((ms) => ms.toLowerCase()).includes(s.toLowerCase()),
    ).length;
    if (score > bestScore) { bestScore = score; best = m.id; }
  }
  return bestScore > 0 ? best : null;
}

// ─── 1. List conversations ────────────────────────────────────────────────────
router.get('/conversations', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const conversations = await db.aIConversation.findMany({
      where: { userId: authReq.user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    res.json({ conversations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── 2. Get single conversation with all messages ─────────────────────────────
router.get('/conversations/:id', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const conv = await db.aIConversation.findFirst({
      where: { id: req.params.id, userId: authReq.user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
    res.json({ conversation: conv });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── 3. Create conversation + generate initial plan ───────────────────────────
router.post('/conversations', geminiRateLimiter, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

  const { idea, techStack, teamSize, duration, teamId } = req.body;
  if (!idea) return res.status(400).json({ error: 'Project idea is required.' });

  // Fetch team members if teamId provided (for skill context)
  let memberContext = '';
  if (teamId) {
    try {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          members: {
            select: { user: { select: { name: true, skills: true } } },
          },
        },
      });
      if (team) {
        const memberList = team.members
          .map((m) => `${m.user.name} (skills: ${parseSkills(m.user.skills).join(', ') || 'unspecified'})`)
          .join('; ');
        memberContext = `\nExisting team members: ${memberList}`;
      }
    } catch { /* non-critical */ }
  }

  const userMessage = `
Project Idea: ${idea}
Tech Stack: ${techStack || 'Not specified'}
Team Size: ${teamSize || 'Not specified'}
Duration: ${duration || 'Not specified'}${memberContext}
  `.trim();

  const prompt = `
You are an expert AI Project Manager and Software Architect.
A user wants to build the following project:

${userMessage}

Generate a complete, professional project plan as a JSON object matching EXACTLY this structure:
{
  "projectTitle": "string",
  "summary": "2-3 sentence project overview",
  "architecture": {
    "overview": "brief architecture description",
    "components": ["component1", "component2"],
    "techStack": ["tech1", "tech2"]
  },
  "milestones": [
    {
      "title": "Milestone title",
      "description": "What gets delivered",
      "weekNumber": 2,
      "tasks": [
        {
          "title": "Task title",
          "description": "Detailed task description",
          "priority": "HIGH|MEDIUM|LOW",
          "estimatedHours": 8,
          "suggestedSkills": ["React", "TypeScript"]
        }
      ]
    }
  ],
  "timeline": [
    { "week": 1, "focus": "What the team works on this week", "deliverables": ["item1"] }
  ],
  "risks": ["Risk 1", "Risk 2"],
  "successCriteria": ["Criterion 1", "Criterion 2"]
}

Rules:
- Generate 3-6 milestones appropriate for the duration.
- Each milestone must have 2-6 tasks.
- Tasks must have realistic estimated hours.
- suggestedSkills must use common skill names (React, Node.js, PostgreSQL, etc.).
- priority must be exactly HIGH, MEDIUM, or LOW.
- weekNumber must be a positive integer within the project duration.
  `;

  try {
    const resObj = await AIRouterService.generateJSON<any>(
      prompt,
      () => buildFallbackPlan(idea, techStack, teamSize, duration),
      { feature: 'aipm', userId: authReq.user.id }
    );
    const plan = resObj.data;

    const title = plan.projectTitle || idea.slice(0, 60);

    const conversation = await db.aIConversation.create({
      data: {
        userId: authReq.user.id,
        title,
        messages: {
          create: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: `Here is your complete project plan for **${title}**.`, planData: JSON.stringify(plan) },
          ],
        },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    res.status(201).json({ conversation, plan, provider: resObj.provider });
  } catch (e: any) {
    console.error('AIPM initial plan error:', e);
    if (e.message?.startsWith('RATE_LIMIT_EXCEEDED')) {
      return res.status(429).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Failed to generate plan' });
  }
});

// ─── 4. Add a follow-up message (regenerate / ask questions) ──────────────────
router.post('/conversations/:id/messages', geminiRateLimiter, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required.' });

  try {
    const conv = await db.aIConversation.findFirst({
      where: { id: req.params.id, userId: authReq.user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });

    // Build context from previous messages trimmed to last 6 + compressed summary
    const trimmedContextPrompt = AIRouterService.buildTrimmedConversationPrompt(
      conv.messages.map((m: any) => ({ role: m.role, content: m.content })),
      content
    );

    const prompt = `
You are an expert AI Project Manager continuing a conversation.
${trimmedContextPrompt}

If the user is asking for plan changes, generate an updated JSON plan with the same structure as before.
If it's a general question, respond with a JSON object: { "response": "your answer", "plan": null }
Otherwise include the updated plan: { "response": "summary of changes", "plan": { ...full plan object... } }
    `;

    const resObj = await AIRouterService.generateJSON<{ response: string; plan: any }>(
      prompt,
      () => ({ response: 'I have noted your changes. The plan has been updated accordingly.', plan: null }),
      { feature: 'aipm', userId: authReq.user.id }
    );
    const result = resObj.data;

    // Save user message
    await db.aIMessage.create({
      data: { conversationId: conv.id, role: 'user', content },
    });

    // Save assistant message
    const assistantMsg = await db.aIMessage.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        content: result.response || 'Plan updated.',
        planData: result.plan ? JSON.stringify(result.plan) : null,
      },
    });

    // Update conversation timestamp
    await db.aIConversation.update({
      where: { id: conv.id },
      data: { updatedAt: new Date() },
    });

    res.json({ message: assistantMsg, plan: result.plan, provider: resObj.provider });
  } catch (e: any) {
    console.error('AIPM follow-up message error:', e);
    if (e.message?.startsWith('RATE_LIMIT_EXCEEDED')) {
      return res.status(429).json({ error: e.message });
    }
    res.status(500).json({ error: e.message || 'Failed to process message' });
  }
});

// ─── 5. Create full project board from plan ───────────────────────────────────
router.post('/create-board', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

  const { teamId, plan, conversationId } = req.body;
  if (!teamId || !plan) return res.status(400).json({ error: 'teamId and plan are required.' });

  // Verify membership
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: authReq.user.id, teamId } },
  });
  if (!membership) return res.status(403).json({ error: 'Not a member of this team.' });

  // Fetch team members for skill-based suggestions
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        select: {
          user: { select: { id: true, name: true, avatarUrl: true, skills: true } },
        },
      },
    },
  });
  const members = (team?.members || []).map((m) => ({
    id: m.user.id,
    name: m.user.name,
    avatarUrl: m.user.avatarUrl,
    skills: parseSkills(m.user.skills),
  }));

  try {
    // 1. Create project
    const project = await prisma.project.create({
      data: {
        title: plan.projectTitle || 'AI Generated Project',
        description: plan.summary || '',
        objectives: JSON.stringify(plan.successCriteria || []),
        teamId,
        status: 'HEALTHY',
        healthScore: 100,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: authReq.user.id,
        projectId: project.id,
        action: 'CREATED_PROJECT',
        metadata: JSON.stringify({ title: project.title, source: 'AI_PROJECT_MANAGER' }),
      },
    });

    // 2. Create milestones and their tasks
    const createdMilestones = [];
    const createdTasks: Array<{
      id: string; title: string; description: string | null; priority: string;
      status: string; milestoneId: string | null; milestoneTitle: string;
      estimatedHours: number; suggestedSkills: string[]; suggestedAssigneeId: string | null;
      suggestedAssigneeName: string | null; assigneeId: string | null;
    }> = [];

    // Calculate due dates from weekNumber
    const now = new Date();
    for (const ms of plan.milestones || []) {
      const weekNum = Number(ms.weekNumber) || 1;
      const dueDate = new Date(now.getTime() + weekNum * 7 * 24 * 60 * 60 * 1000);

      const milestone = await prisma.milestone.create({
        data: {
          projectId: project.id,
          title: ms.title || 'Milestone',
          description: ms.description || '',
          dueDate,
          status: 'PENDING',
        },
      });
      createdMilestones.push(milestone);

      for (const t of ms.tasks || []) {
        const suggestedSkills: string[] = Array.isArray(t.suggestedSkills) ? t.suggestedSkills : [];
        const suggestedAssigneeId = suggestAssignee(suggestedSkills, members);
        const suggestedAssigneeName = suggestedAssigneeId
          ? members.find((m) => m.id === suggestedAssigneeId)?.name || null
          : null;

        const task = await prisma.task.create({
          data: {
            title: t.title || 'Task',
            description: t.description || '',
            priority: ['HIGH', 'MEDIUM', 'LOW'].includes((t.priority || '').toUpperCase())
              ? t.priority.toUpperCase()
              : 'MEDIUM',
            status: 'TODO',
            projectId: project.id,
            milestoneId: milestone.id,
            dueDate,
          },
        });

        createdTasks.push({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
          milestoneId: milestone.id,
          milestoneTitle: milestone.title,
          estimatedHours: Number(t.estimatedHours) || 0,
          suggestedSkills,
          suggestedAssigneeId,
          suggestedAssigneeName,
          assigneeId: null,
        });
      }
    }

    // 3. Optionally link conversation
    if (conversationId) {
      await db.aIConversation.updateMany({
        where: { id: conversationId, userId: authReq.user.id },
        data: { updatedAt: new Date() },
      });
    }

    res.status(201).json({
      project,
      milestones: createdMilestones,
      tasks: createdTasks,
      members,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed to create project board.' });
  }
});

// ─── 6. Bulk assign tasks ─────────────────────────────────────────────────────
router.post('/assign', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });

  const { assignments } = req.body as {
    assignments: Array<{ taskId: string; assigneeId: string | null }>;
  };
  if (!Array.isArray(assignments)) return res.status(400).json({ error: 'assignments array required.' });

  try {
    const updated = await Promise.all(
      assignments.map(async ({ taskId, assigneeId }) => {
        const task = await prisma.task.update({
          where: { id: taskId },
          data: { assigneeId: assigneeId || null },
          include: {
            assignee: { select: { id: true, name: true, avatarUrl: true } },
            project: { select: { title: true } },
          },
        });

        // Notify assignee
        if (assigneeId && assigneeId !== authReq.user!.id) {
          try {
            const { sendNotificationToUser } = await import('../utils/socket');
            const notif = await prisma.notification.create({
              data: {
                userId: assigneeId,
                title: 'Task Assigned',
                message: `You have been assigned: "${task.title}" in project "${task.project.title}"`,
              },
            });
            sendNotificationToUser(assigneeId, notif);
          } catch { /* non-critical */ }
        }

        return task;
      }),
    );

    res.json({ updated });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed to assign tasks.' });
  }
});

// ─── 7. Delete conversation ───────────────────────────────────────────────────
router.delete('/conversations/:id', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await db.aIConversation.deleteMany({
      where: { id: req.params.id, userId: authReq.user.id },
    });
    res.json({ message: 'Conversation deleted.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── Fallback plan generator (when Gemini is unavailable) ────────────────────
function buildFallbackPlan(idea: string, techStack?: string, teamSize?: string, duration?: string): any {
  const title = idea.length > 60 ? idea.slice(0, 57) + '...' : idea;
  return {
    projectTitle: title,
    summary: `A software project to build ${idea}. The team will deliver an MVP within the specified timeline using modern best practices.`,
    architecture: {
      overview: 'Monolithic web application with REST API backend and reactive frontend.',
      components: ['Frontend SPA', 'REST API Backend', 'PostgreSQL Database', 'Authentication Service'],
      techStack: techStack ? techStack.split(',').map((s) => s.trim()) : ['React', 'Node.js', 'PostgreSQL'],
    },
    milestones: [
      {
        title: 'Project Setup & Architecture',
        description: 'Initialize project structure, CI/CD, and core architecture.',
        weekNumber: 1,
        tasks: [
          { title: 'Repository setup and CI/CD pipeline', description: 'Set up Git repository, configure CI/CD, establish branching strategy.', priority: 'HIGH', estimatedHours: 4, suggestedSkills: ['Git', 'Docker'] },
          { title: 'Database schema design', description: 'Design and implement the core database schema.', priority: 'HIGH', estimatedHours: 6, suggestedSkills: ['PostgreSQL'] },
          { title: 'Authentication module', description: 'Implement JWT-based auth with register/login endpoints.', priority: 'HIGH', estimatedHours: 8, suggestedSkills: ['Node.js', 'TypeScript'] },
        ],
      },
      {
        title: 'Core Feature Development',
        description: 'Build the primary application features.',
        weekNumber: 3,
        tasks: [
          { title: 'Core API endpoints', description: 'Implement all primary REST API endpoints.', priority: 'HIGH', estimatedHours: 16, suggestedSkills: ['Node.js', 'TypeScript'] },
          { title: 'Frontend UI components', description: 'Build reusable UI components and page layouts.', priority: 'MEDIUM', estimatedHours: 12, suggestedSkills: ['React', 'TypeScript'] },
          { title: 'State management integration', description: 'Set up global state management and API integration.', priority: 'MEDIUM', estimatedHours: 8, suggestedSkills: ['React'] },
        ],
      },
      {
        title: 'Testing & Deployment',
        description: 'Test all features and deploy to production.',
        weekNumber: 5,
        tasks: [
          { title: 'Unit and integration testing', description: 'Write comprehensive test suite for all modules.', priority: 'HIGH', estimatedHours: 12, suggestedSkills: ['TypeScript'] },
          { title: 'Performance optimization', description: 'Profile and optimize critical code paths.', priority: 'MEDIUM', estimatedHours: 6, suggestedSkills: ['Node.js'] },
          { title: 'Production deployment', description: 'Deploy to production environment with monitoring.', priority: 'HIGH', estimatedHours: 4, suggestedSkills: ['Docker', 'AWS'] },
        ],
      },
    ],
    timeline: [
      { week: 1, focus: 'Project setup and architecture', deliverables: ['Repository', 'Database schema', 'Auth module'] },
      { week: 2, focus: 'Core backend APIs', deliverables: ['REST endpoints', 'Data models'] },
      { week: 3, focus: 'Frontend development', deliverables: ['UI components', 'Pages'] },
      { week: 4, focus: 'Integration and testing', deliverables: ['Test suite', 'Bug fixes'] },
      { week: 5, focus: 'Deployment', deliverables: ['Production deployment', 'Documentation'] },
    ],
    risks: ['Scope creep from unclear requirements', 'Third-party API limitations', 'Team availability constraints'],
    successCriteria: ['Core features fully functional', 'Test coverage above 70%', 'Deployed to production', 'Documentation complete'],
  };
}

export default router;
