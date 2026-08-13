import axios from 'axios';
import prisma from '../utils/prisma';
import { GeminiService } from './gemini.service';

const TASK_CODE_PATTERN = /#([A-Z]+-\d+)/g;

export interface SyncResult {
  commitsInserted: number;
  commitsSkipped: number;
  tasksVerified: number;
  lastSync: Date;
}

export async function syncProjectGitHub(projectId: string): Promise<SyncResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { tasks: true, repositories: true },
  });

  if (!project || !project.githubRepo) {
    throw new Error('Project or GitHub repo not found');
  }

  const [commits, contributors, pullRequests] = await Promise.all([
    fetchCommits(project.githubRepo),
    fetchContributors(project.githubRepo),
    fetchPullRequests(project.githubRepo),
  ]);

  let commitsInserted = 0;
  let commitsSkipped = 0;

  for (const c of commits) {
    const existing = await prisma.gitCommit.findUnique({
      where: { sha: c.sha },
    });

    if (existing) {
      commitsSkipped++;
      continue;
    }

    await prisma.gitCommit.create({
      data: {
        projectId,
        sha: c.sha,
        message: c.message,
        author: c.author,
        authorEmail: c.authorEmail,
        commitUrl: c.commitUrl,
        committedAt: new Date(c.date),
        additions: c.additions,
        deletions: c.deletions,
      },
    });

    commitsInserted++;
  }

  const taskVerifications = await verifyTasksFromCommits(projectId, commits, project.tasks);

  const analytics = computeAnalytics(commits, contributors, pullRequests);
  const contributionJson = JSON.stringify(analytics.authorSplit);

  await prisma.gitAnalytics.upsert({
    where: { projectId },
    update: {
      commitsCount: analytics.totalCommits,
      lastCommitTime: commits[0] ? new Date(commits[0].date) : undefined,
      contributionData: contributionJson,
    },
    create: {
      projectId,
      commitsCount: analytics.totalCommits,
      lastCommitTime: commits[0] ? new Date(commits[0].date) : undefined,
      contributionData: contributionJson,
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { lastGitSync: new Date() },
  });

  await createActivityEvents(projectId, commitsInserted, taskVerifications, pullRequests.length);

  return {
    commitsInserted,
    commitsSkipped,
    tasksVerified: taskVerifications,
    lastSync: new Date(),
  };
}

async function fetchCommits(repoPath: string) {
  try {
    const headers = await getHeaders();
    const res = await axios.get(`https://api.github.com/repos/${repoPath}/commits?per_page=50`, { headers, timeout: 10000 });
    return res.data.map((c: any) => ({
      sha: c.sha,
      message: c.commit?.message?.split('\n')[0] || 'Update codebase',
      author: c.commit?.author?.name || c.author?.login || 'Developer',
      authorEmail: c.commit?.author?.email || '',
      commitUrl: c.html_url || '',
      date: c.commit?.author?.date || new Date().toISOString(),
      additions: null,
      deletions: null,
    }));
  } catch {
    return [];
  }
}

async function fetchContributors(repoPath: string) {
  try {
    const headers = await getHeaders();
    const res = await axios.get(`https://api.github.com/repos/${repoPath}/contributors?per_page=20`, { headers, timeout: 10000 });
    return res.data.map((c: any) => ({
      name: c.login,
      commits: c.contributions,
    }));
  } catch {
    return [];
  }
}

async function fetchPullRequests(repoPath: string) {
  try {
    const headers = await getHeaders();
    const res = await axios.get(`https://api.github.com/repos/${repoPath}/pulls?state=all&per_page=20`, { headers, timeout: 10000 });
    return res.data.map((pr: any) => ({
      id: pr.number,
      title: pr.title,
      author: pr.user?.login || 'Contributor',
      status: pr.merged_at ? 'MERGED' : pr.state === 'open' ? 'OPEN' : 'CLOSED',
      date: pr.created_at,
    }));
  } catch {
    return [];
  }
}

async function verifyTasksFromCommits(projectId: string, commits: any[], tasks: any[]): Promise<number> {
  const taskMap = new Map<string, any>();
  for (const t of tasks) {
    const codeMatch = t.title.match(TASK_CODE_PATTERN);
    if (codeMatch) {
      taskMap.set(codeMatch[1].toUpperCase(), t);
    }
  }

  let verifiedCount = 0;

  for (const c of commits) {
    const matches = c.message.matchAll(TASK_CODE_PATTERN);
    for (const m of matches) {
      const code = m[1].toUpperCase();
      const task = taskMap.get(code);
      if (!task) continue;

      const alreadyLinked = await prisma.taskCommitLink.findFirst({
        where: { taskId: task.id, commit: { sha: c.sha } },
      });

      if (alreadyLinked) continue;

      const commit = await prisma.gitCommit.findUnique({
        where: { sha: c.sha },
      });

      if (!commit) continue;

      await prisma.taskCommitLink.create({
        data: { taskId: task.id, commitId: commit.id },
      });

      if (!task.githubVerified) {
        await prisma.task.update({
          where: { id: task.id },
          data: { githubVerified: true },
        });
        verifiedCount++;
      }
    }
  }

  return verifiedCount;
}

function computeAnalytics(commits: any[], contributors: any[], pullRequests: any[]) {
  const totalCommits = commits.length;
  const authorSplit = contributors.map((c: any) => ({
    name: c.name,
    commits: c.commits,
    percentage: totalCommits > 0 ? Math.round((c.commits / totalCommits) * 100) : 0,
  }));

  return {
    totalCommits,
    activeBranches: 0,
    openPullRequests: pullRequests.filter(p => p.status === 'OPEN').length,
    contributorsCount: contributors.length,
    authorSplit,
  };
}

async function createActivityEvents(projectId: string, commitsInserted: number, tasksVerified: number, prCount: number) {
  const events: any[] = [];

  if (commitsInserted > 0) {
    events.push({
      projectId,
      type: 'COMMIT_PUSHED',
      title: `${commitsInserted} new commit${commitsInserted > 1 ? 's' : ''} synced`,
      description: 'GitHub repository has been synced',
      metadata: JSON.stringify({ count: commitsInserted }),
    });
  }

  if (tasksVerified > 0) {
    events.push({
      projectId,
      type: 'TASK_VERIFIED',
      title: `${tasksVerified} task${tasksVerified > 1 ? 's' : ''} verified by GitHub`,
      description: 'Tasks linked to commit messages',
      metadata: JSON.stringify({ count: tasksVerified }),
    });
  }

  if (prCount > 0) {
    events.push({
      projectId,
      type: 'PR_OPENED',
      title: `${prCount} pull request${prCount > 1 ? 's' : ''} found`,
      description: 'Pull requests synced from GitHub',
      metadata: JSON.stringify({ count: prCount }),
    });
  }

  if (events.length > 0) {
    await prisma.activityEvent.createMany({ data: events });
  }
}

async function getHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { 'User-Agent': 'ProjectCollab-AI-App' };
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'ProjectCollab-AI-App',
  };
}
