import cron from 'node-cron';
import prisma from '../utils/prisma';
import { sendNotificationToUser } from '../utils/socket';
import { syncProjectGitHub } from './githubSync.service';

export async function checkDeadlineReminders() {
  try {
    const now = new Date();
    const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // 1. Check tasks due within the next 0-48 hours.
    const upcomingTasks = await prisma.task.findMany({
      where: {
        status: { not: 'COMPLETED' },
        dueDate: {
          gte: now,
          lte: fortyEightHoursFromNow,
        },
        assigneeId: { not: null },
      },
      include: {
        project: true,
      },
    });

    for (const task of upcomingTasks) {
      if (!task.assigneeId) continue;

      const tag = `[TaskID:${task.id}]`;
      const existingNotif = await prisma.notification.findFirst({
        where: {
          userId: task.assigneeId,
          message: { contains: tag },
        },
      });

      if (!existingNotif) {
        const dueDateFormatted = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'soon';
        const notif = await prisma.notification.create({
          data: {
            userId: task.assigneeId,
            title: `⏰ Task Deadline Reminder`,
            message: `Task "${task.title}" in project "${task.project.title}" is due on ${dueDateFormatted}. ${tag}`,
          },
        });
        sendNotificationToUser(task.assigneeId, notif);
      }
    }

    // 2. Check Milestones due within 24-48 hours
    const upcomingMilestones = await prisma.milestone.findMany({
      where: {
        status: { not: 'COMPLETED' },
        dueDate: {
          gte: now,
          lte: fortyEightHoursFromNow,
        },
      },
      include: {
        project: {
          include: {
            team: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    });

    for (const milestone of upcomingMilestones) {
      const tag = `[MilestoneID:${milestone.id}]`;
      const members = milestone.project.team.members;

      for (const member of members) {
        const existingNotif = await prisma.notification.findFirst({
          where: {
            userId: member.userId,
            message: { contains: tag },
          },
        });

        if (!existingNotif) {
          const dueDateFormatted = new Date(milestone.dueDate).toLocaleDateString();
          const notif = await prisma.notification.create({
            data: {
              userId: member.userId,
              title: `⏰ Milestone Deadline Reminder`,
              message: `Milestone "${milestone.title}" in project "${milestone.project.title}" is due on ${dueDateFormatted}. ${tag}`,
            },
          });
          sendNotificationToUser(member.userId, notif);
        }
      }
    }
  } catch (error) {
    console.error('Error running deadline reminder cron:', error);
  }
}

export async function purgeExpiredTokens() {
  try {
    const { count } = await prisma.token.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (count > 0) {
      console.log(`🧹 Purged ${count} expired tokens`);
    }
  } catch (error) {
    console.error('Error purging expired tokens:', error);
  }
}

export async function runGitHubSyncCron() {
  try {
    const projects = await prisma.project.findMany({
      where: { githubRepo: { not: null } },
      select: { id: true, githubRepo: true },
    });

    for (const project of projects) {
      if (!project.githubRepo) continue;
      try {
        await syncProjectGitHub(project.id);
        console.log(`🔄 Auto-synced GitHub for project ${project.id}`);
      } catch (err) {
        console.error(`GitHub sync failed for project ${project.id}:`, err);
      }
    }
  } catch (error) {
    console.error('Error running GitHub sync cron:', error);
  }
}

export function startDeadlineReminderCron() {
  console.log('⏰ Initializing deadline reminder cron job...');
  // Run once on startup
  checkDeadlineReminders();
  purgeExpiredTokens();

  // Schedule to run every hour
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Running scheduled deadline reminder check...');
    checkDeadlineReminders();
  });

  // Cleanup auth/reset tokens hourly as well.
  cron.schedule('10 * * * *', () => {
    purgeExpiredTokens();
  });

  // GitHub sync every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    console.log('🔄 Running scheduled GitHub sync...');
    runGitHubSyncCron();
  });
}
