import prisma from './prisma';

/**
 * Calculates and persists real-time health score & status for a project.
 * 
 * Formula:
 * - When 0 tasks exist: 100% base health (minus any overdue penalties).
 * - When tasks exist:
 *   - Task Completion Rate (50% weight)
 *   - Git Commit Activity (30% weight, max 15 commits baseline)
 *   - Team Chat Communication (20% weight, max 10 messages baseline)
 * - Overdue penalty: -10 points per overdue task/milestone (capped at -30 points max).
 * - Score < 50 => 'RISK', 50..74 => 'ATTENTION', >= 75 => 'HEALTHY'
 */
export async function recalculateProjectHealth(projectId: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: { select: { status: true, dueDate: true } },
        milestones: { select: { status: true, dueDate: true } },
        gitAnalytics: { select: { commitsCount: true } }
      }
    });

    if (!project) return null;

    const totalTasks = project.tasks.length;
    const completedTasks = project.tasks.filter(t => t.status === 'COMPLETED').length;

    const commitsCount = project.gitAnalytics?.commitsCount || 0;

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

    let baseScore = 100;
    if (totalTasks > 0) {
      const taskCompletionRate = completedTasks / totalTasks;
      const taskScore = taskCompletionRate * 100 * 0.50;
      const commitRatio = Math.min(commitsCount / 15, 1);
      const commitScore = commitRatio * 100 * 0.30;
      const chatRatio = Math.min(chatActivityCount / 10, 1);
      const chatScore = chatRatio * 100 * 0.20;

      baseScore = Math.round(taskScore + commitScore + chatScore);
    }

    const overduePenalty = Math.min(overdueCount * 10, 30);
    const healthScore = Math.max(Math.min(baseScore - overduePenalty, 100), 10);

    let status: 'HEALTHY' | 'ATTENTION' | 'RISK' = 'HEALTHY';
    if (healthScore < 50) {
      status = 'RISK';
    } else if (healthScore < 75) {
      status = 'ATTENTION';
    }

    if (project.healthScore !== healthScore || project.status !== status) {
      await prisma.project.update({
        where: { id: projectId },
        data: { healthScore, status }
      });
    }

    return { healthScore, status };
  } catch (err) {
    console.error(`[ProjectHealth] Error recalculating health for ${projectId}:`, err);
    return null;
  }
}
