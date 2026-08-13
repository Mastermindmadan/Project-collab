import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import prisma from '../utils/prisma';

export async function generateGitHubReport(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      team: { include: { members: { include: { user: { select: { id: true, name: true, email: true, githubUsername: true } } } } } },
      tasks: { include: { assignee: { select: { name: true } }, commitLinks: { include: { commit: true } } } },
      gitAnalytics: true,
      gitCommits: { orderBy: { committedAt: 'desc' }, take: 50 },
      activityEvents: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!project) throw new Error('Project not found');

  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('ProjectCollab AI', 14, y); y += 8;
  doc.setFontSize(14);
  doc.text('GitHub Integration Report', 14, y); y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Project: ${project.title}`, 14, y); y += 5;
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y); y += 10;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Team Members', 14, y); y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const memberRows = project.team.members.map((m: any) => [
    m.user.name,
    m.user.email,
    m.user.githubUsername || 'N/A',
    m.role,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Name', 'Email', 'GitHub', 'Role']],
    body: memberRows,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Commit Summary', 14, y); y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Commits: ${project.gitAnalytics?.commitsCount || 0}`, 14, y); y += 5;
  doc.text(`Last Sync: ${project.lastGitSync ? new Date(project.lastGitSync).toLocaleString() : 'Never'}`, 14, y); y += 10;

  const verifiedTasks = project.tasks.filter((t: any) => t.githubVerified);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Verified Tasks: ${verifiedTasks.length} / ${project.tasks.length}`, 14, y); y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const taskRows = project.tasks.map((t: any) => [
    t.title,
    t.status,
    t.priority,
    t.assignee?.name || 'Unassigned',
    t.githubVerified ? 'Yes' : 'No',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Task', 'Status', 'Priority', 'Assignee', 'GitHub Verified']],
    body: taskRows,
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Contribution Breakdown', 14, y); y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  let contributionData: any = {};
  try {
    contributionData = project.gitAnalytics?.contributionData ? JSON.parse(project.gitAnalytics.contributionData) : {};
  } catch {
    contributionData = {};
  }

  const contributionRows = Object.entries(contributionData).map(([name, data]: [string, any]) => [
    name,
    `${data.commits || 0} commits`,
    `${data.percentage || 0}%`,
  ]);

  if (contributionRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Contributor', 'Commits', 'Share']],
      body: contributionRows,
      theme: 'grid',
      headStyles: { fillColor: [245, 158, 11] },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Recent Commits', 14, y); y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const commitRows = project.gitCommits.slice(0, 20).map((c: any) => [
    c.sha.substring(0, 7),
    c.author,
    new Date(c.committedAt).toLocaleDateString(),
    c.message.substring(0, 50),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['SHA', 'Author', 'Date', 'Message']],
    body: commitRows,
    theme: 'grid',
    headStyles: { fillColor: [139, 92, 246] },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('AI Weekly Summary', 14, y); y += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const totalCommits = project.gitAnalytics?.commitsCount || 0;
  const verifiedCount = verifiedTasks.length;
  const totalTasks = project.tasks.length;
  const completionRate = totalTasks > 0 ? Math.round((verifiedCount / totalTasks) * 100) : 0;

  const summaryText = [
    `The repository has accumulated ${totalCommits} commits.`,
    `${verifiedCount} out of ${totalTasks} tasks have been verified through GitHub commits (${completionRate}% verification rate).`,
    contributionData && Object.keys(contributionData).length > 0
      ? `Top contributor: ${Object.entries(contributionData).sort((a: any, b: any) => (b[1].percentage || 0) - (a[1].percentage || 0))[0]?.[0] || 'N/A'}`
      : 'No contributor data available yet.',
    `Last synced: ${project.lastGitSync ? new Date(project.lastGitSync).toLocaleString() : 'Never'}.`,
  ].join(' ');

  const splitSummary = doc.splitTextToSize(summaryText, 180);
  doc.text(splitSummary, 14, y);

  doc.save(`projectcollab-github-report-${project.title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`);
}
