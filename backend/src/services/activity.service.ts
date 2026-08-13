import prisma from '../utils/prisma';

export async function getProjectActivity(projectId: string, limit = 50) {
  const [activityLogs, activityEvents, gitCommits] = await Promise.all([
    prisma.activityLog.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.activityEvent.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.gitCommit.findMany({
      where: { projectId },
      orderBy: { committedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        sha: true,
        message: true,
        author: true,
        committedAt: true,
        additions: true,
        deletions: true,
        taskLinks: {
          include: {
            task: { select: { id: true, title: true, status: true } },
          },
        },
      },
    }),
  ]);

  const combined = [
    ...activityLogs.map((log: any) => ({
      id: log.id,
      type: mapActionToType(log.action),
      title: log.action.replace(/_/g, ' ').toLowerCase(),
      description: log.metadata || undefined,
      createdAt: log.createdAt,
      user: log.user,
      metadata: log.metadata,
    })),
    ...activityEvents.map((ev: any) => ({
      id: ev.id,
      type: ev.type,
      title: ev.title,
      description: ev.description || undefined,
      createdAt: ev.createdAt,
      user: null,
      metadata: ev.metadata,
    })),
    ...gitCommits.map((commit: any) => ({
      id: `commit-${commit.id}`,
      type: 'COMMIT_PUSHED',
      title: commit.message,
      description: `by ${commit.author}`,
      createdAt: commit.committedAt,
      user: null,
      metadata: JSON.stringify({
        sha: commit.sha,
        additions: commit.additions,
        deletions: commit.deletions,
        linkedTasks: commit.taskLinks.map((tl: any) => tl.task),
      }),
    })),
  ];

  combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return combined.slice(0, limit);
}

function mapActionToType(action: string): string {
  if (action.includes('CREATED_TASK')) return 'TASK_CREATED';
  if (action.includes('COMPLETED_TASK')) return 'TASK_COMPLETED';
  if (action.includes('UPDATED_TASK_STATUS')) return 'TASK_UPDATED';
  if (action.includes('CONNECTED_GITHUB')) return 'GITHUB_CONNECTED';
  if (action.includes('CREATED_PROJECT')) return 'PROJECT_CREATED';
  if (action.includes('UPDATED_PROJECT')) return 'PROJECT_UPDATED';
  if (action.includes('COMMENT')) return 'COMMENT_ADDED';
  return 'OTHER';
}
