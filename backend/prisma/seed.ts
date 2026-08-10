/**
 * ProjectCollab AI — Database Seed Script (SQLite Compatible)
 * ==========================================================
 * Creates realistic demo data so you can explore the full platform immediately.
 *
 * Run with:  npx ts-node prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const TaskStatus = { TODO: 'TODO', IN_PROGRESS: 'IN_PROGRESS', REVIEW: 'REVIEW', COMPLETED: 'COMPLETED' };
const TaskPriority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };
const MilestoneStatus = { PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED' };
const ProjectStatus = { HEALTHY: 'HEALTHY', ATTENTION: 'ATTENTION', RISK: 'RISK' };
const MemberRole = { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' };

const prisma = new PrismaClient();
const hash = (pw: string) => bcrypt.hashSync(pw, 10);

async function main() {
  console.log('🌱 Starting ProjectCollab AI seed...\n');

  // ─── Clean slate ─────────────────────────────────────────────────────────────
  console.log('🗑  Wiping existing data...');
  await prisma.$transaction([
    prisma.subtask.deleteMany(),
    prisma.taskComment.deleteMany(),
    prisma.task.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.activityLog.deleteMany(),
    prisma.meeting.deleteMany(),
    prisma.message.deleteMany(),
    prisma.document.deleteMany(),
    prisma.gitAnalytics.deleteMany(),
    prisma.project.deleteMany(),
    prisma.teamMember.deleteMany(),
    prisma.team.deleteMany(),
    prisma.token.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log('✅ Wiped.\n');

  // ─── Users ───────────────────────────────────────────────────────────────────
  console.log('👤 Creating users...');
  const [rohan, priya, arjun, sneha, kavya] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Rohan Sharma',
        email: 'rohan@university.edu',
        passwordHash: hash('password123'),
        role: 'STUDENT',
        skills: JSON.stringify(['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker']),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Priya Mehta',
        email: 'priya@university.edu',
        passwordHash: hash('password123'),
        role: 'STUDENT',
        skills: JSON.stringify(['UI/UX Design', 'Figma', 'React', 'CSS', 'Python']),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Arjun Verma',
        email: 'arjun@university.edu',
        passwordHash: hash('password123'),
        role: 'STUDENT',
        skills: JSON.stringify(['Python', 'Machine Learning', 'FastAPI', 'MongoDB', 'Docker']),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Sneha Kapoor',
        email: 'sneha@university.edu',
        passwordHash: hash('password123'),
        role: 'STUDENT',
        skills: JSON.stringify(['Java', 'Spring Boot', 'PostgreSQL', 'AWS', 'Redis']),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Kavya Reddy',
        email: 'kavya@university.edu',
        passwordHash: hash('password123'),
        role: 'STUDENT',
        skills: JSON.stringify(['Flutter', 'Dart', 'Firebase', 'GraphQL', 'Kubernetes']),
      },
    }),
  ]);

  const users = [rohan, priya, arjun, sneha, kavya];
  console.log(`  ✅ Created ${users.length} users`);
  console.log(`  📧 Login: any email above, password: password123\n`);

  // ─── Teams ────────────────────────────────────────────────────────────────────
  console.log('👥 Creating teams...');
  const [teamPCai, teamML] = await Promise.all([
    prisma.team.create({
      data: {
        name: 'ProjectCollab AI Dev',
        inviteCode: 'PCAI-2024-ALPHA',
        members: {
          create: [
            { userId: rohan.id, role: MemberRole.OWNER },
            { userId: priya.id, role: MemberRole.ADMIN },
            { userId: arjun.id, role: MemberRole.MEMBER },
            { userId: sneha.id, role: MemberRole.MEMBER },
          ],
        },
      },
    }),
    prisma.team.create({
      data: {
        name: 'ML Research Collective',
        inviteCode: 'MLRC-BETA-2024',
        members: {
          create: [
            { userId: arjun.id, role: MemberRole.OWNER },
            { userId: kavya.id, role: MemberRole.ADMIN },
            { userId: rohan.id, role: MemberRole.MEMBER },
            { userId: sneha.id, role: MemberRole.MEMBER },
          ],
        },
      },
    }),
  ]);
  console.log('  ✅ Created 2 teams\n');

  // ─── Projects ─────────────────────────────────────────────────────────────────
  console.log('📁 Creating projects...');
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 86400000);

  const [projPC, projCampus, projML, projStudy] = await Promise.all([
    prisma.project.create({
      data: {
        title: 'ProjectCollab AI Platform',
        description: 'An AI-powered academic project collaboration platform with real-time communication, intelligent task management, and GitHub integration for university students.',
        objectives: JSON.stringify([
          'Build a full-stack web application with React + Node.js',
          'Integrate AI for project planning and risk detection',
          'Implement real-time team communication with Socket.io',
          'Connect GitHub API for commit tracking and analytics',
          'Deploy on cloud with CI/CD pipeline',
        ]),
        status: ProjectStatus.HEALTHY,
        healthScore: 82,
        githubRepo: 'team-projectcollab/projectcollab-ai',
        teamId: teamPCai.id,
      },
    }),
    prisma.project.create({
      data: {
        title: 'Campus Event Management App',
        description: 'A mobile-first application for discovering, registering, and managing campus events. Features QR check-ins, push notifications, and event analytics dashboard.',
        objectives: JSON.stringify([
          'Develop cross-platform mobile app with Flutter',
          'Build event registration and QR check-in system',
          'Implement push notifications and real-time updates',
          'Create admin dashboard for event organizers',
        ]),
        status: ProjectStatus.ATTENTION,
        healthScore: 48,
        teamId: teamPCai.id,
      },
    }),
    prisma.project.create({
      data: {
        title: 'ML Sentiment Analysis Engine',
        description: 'A machine learning pipeline for real-time sentiment analysis of academic paper abstracts and course feedback. Uses BERT-based models fine-tuned on academic text.',
        objectives: JSON.stringify([
          'Fine-tune BERT model on academic dataset',
          'Build FastAPI inference endpoint',
          'Create visualization dashboard for sentiment trends',
          'Achieve 90%+ accuracy on test set',
        ]),
        status: ProjectStatus.HEALTHY,
        healthScore: 91,
        githubRepo: 'ml-research/sentiment-engine',
        teamId: teamML.id,
      },
    }),
    prisma.project.create({
      data: {
        title: 'Smart Study Group Finder',
        description: 'An AI-driven matching system that connects students with compatible study partners based on subjects, schedule availability, and learning style preferences.',
        objectives: JSON.stringify([
          'Build recommendation algorithm using collaborative filtering',
          'Create student profile and matching system',
          'Develop chat and scheduling features',
          'Integrate university course catalog API',
        ]),
        status: ProjectStatus.RISK,
        healthScore: 34,
        teamId: teamML.id,
      },
    }),
  ]);

  const projects = [projPC, projCampus, projML, projStudy];
  console.log(`  ✅ Created ${projects.length} projects\n`);

  // ─── Milestones ───────────────────────────────────────────────────────────────
  console.log('🏁 Creating milestones...');

  const [ms1, ms2, ms3, ms4, ms5] = await Promise.all([
    prisma.milestone.create({ data: { projectId: projPC.id, title: 'Authentication & User Management', description: 'Complete JWT auth, registration, login, profile endpoints', dueDate: days(-5), status: MilestoneStatus.COMPLETED } }),
    prisma.milestone.create({ data: { projectId: projPC.id, title: 'Team & Project Workspaces', description: 'Team creation, invite system, project CRUD, milestone management', dueDate: days(3), status: MilestoneStatus.IN_PROGRESS } }),
    prisma.milestone.create({ data: { projectId: projPC.id, title: 'Task Board & Real-time Chat', description: 'Kanban board, drag-and-drop, Socket.io integration', dueDate: days(14), status: MilestoneStatus.PENDING } }),
    prisma.milestone.create({ data: { projectId: projML.id, title: 'Data Collection & Preprocessing', description: 'Gather 50K academic abstracts, clean and tokenize data', dueDate: days(-10), status: MilestoneStatus.COMPLETED } }),
    prisma.milestone.create({ data: { projectId: projML.id, title: 'Model Fine-tuning & Evaluation', description: 'Fine-tune BERT, achieve 90%+ accuracy, generate confusion matrix', dueDate: days(7), status: MilestoneStatus.IN_PROGRESS } }),
  ]);
  console.log('  ✅ Created 5 milestones\n');

  // ─── Tasks ────────────────────────────────────────────────────────────────────
  console.log('✅ Creating tasks...');

  const pcTasks = await Promise.all([
    prisma.task.create({ data: { title: 'Initialize monorepo project structure', description: 'Set up frontend (Vite+React+TS) and backend (Node+Express+Prisma) in a monorepo', status: TaskStatus.COMPLETED, priority: TaskPriority.HIGH, dueDate: days(-20), projectId: projPC.id, assigneeId: rohan.id, milestoneId: ms1.id } }),
    prisma.task.create({ data: { title: 'Design and implement Prisma database schema', description: 'Write schema.prisma with all required models: User, Team, Project, Task, Milestone, etc.', status: TaskStatus.COMPLETED, priority: TaskPriority.HIGH, dueDate: days(-18), projectId: projPC.id, assigneeId: rohan.id, milestoneId: ms1.id } }),
    prisma.task.create({ data: { title: 'Implement JWT authentication system', description: 'Build register/login/refresh endpoints with bcrypt hashing and JWT token rotation', status: TaskStatus.COMPLETED, priority: TaskPriority.HIGH, dueDate: days(-10), projectId: projPC.id, assigneeId: sneha.id, milestoneId: ms1.id } }),
    prisma.task.create({ data: { title: 'Build Login and Register UI screens', description: 'Premium glassmorphism auth pages with form validation and error handling', status: TaskStatus.COMPLETED, priority: TaskPriority.MEDIUM, dueDate: days(-8), projectId: projPC.id, assigneeId: priya.id, milestoneId: ms1.id } }),
    prisma.task.create({ data: { title: 'Implement Team invitation system with QR codes', description: 'QR code generation for team invites, unique invite codes, shareable invite links', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, dueDate: days(2), projectId: projPC.id, assigneeId: arjun.id, milestoneId: ms2.id } }),
    prisma.task.create({ data: { title: 'Build Kanban Board with drag-and-drop', description: 'Interactive task board using @hello-pangea/dnd, column status updates, task cards with subtasks', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, dueDate: days(4), projectId: projPC.id, assigneeId: priya.id, milestoneId: ms3.id } }),
    prisma.task.create({ data: { title: 'Connect GitHub API for commit analytics', description: 'Fetch commits, contributors, and branch data from GitHub REST API v3', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.MEDIUM, dueDate: days(6), projectId: projPC.id, assigneeId: rohan.id, milestoneId: ms3.id } }),
    prisma.task.create({ data: { title: 'Project workspace creation and management API', description: 'CRUD endpoints for projects, milestones, objectives, and team assignment', status: TaskStatus.REVIEW, priority: TaskPriority.HIGH, dueDate: days(1), projectId: projPC.id, assigneeId: sneha.id, milestoneId: ms2.id } }),
    prisma.task.create({ data: { title: 'Design system: glassmorphism UI components', description: 'Glass card, glass panel, glow effects, color tokens, typography system', status: TaskStatus.REVIEW, priority: TaskPriority.MEDIUM, dueDate: days(0), projectId: projPC.id, assigneeId: priya.id, milestoneId: ms2.id } }),
    prisma.task.create({ data: { title: 'Socket.io real-time team chat integration', description: 'Setup Socket.io server and client for channel-based messaging with typing indicators', status: TaskStatus.TODO, priority: TaskPriority.HIGH, dueDate: days(12), projectId: projPC.id, assigneeId: arjun.id, milestoneId: ms3.id } }),
    prisma.task.create({ data: { title: 'AI Sprint Planner: OpenAI GPT-4 integration', description: 'Connect OpenAI GPT-4 API to generate project roadmaps, sprint summaries, and risk reports', status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, dueDate: days(15), projectId: projPC.id, assigneeId: rohan.id, milestoneId: ms3.id } }),
    prisma.task.create({ data: { title: 'Set up CI/CD pipeline with GitHub Actions', description: 'Automated testing and deployment to Railway (backend) and Vercel (frontend) on main branch push', status: TaskStatus.TODO, priority: TaskPriority.LOW, dueDate: days(20), projectId: projPC.id, assigneeId: sneha.id } }),
  ]);

  const campusTasks = await Promise.all([
    prisma.task.create({ data: { title: 'Flutter project setup and navigation', description: 'Initialize Flutter project with go_router, material theme, and dependency injection', status: TaskStatus.COMPLETED, priority: TaskPriority.HIGH, dueDate: days(-15), projectId: projCampus.id, assigneeId: kavya.id } }),
    prisma.task.create({ data: { title: 'Event listing and filter UI', description: 'Browse events page with category filters, date picker, and search', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, dueDate: days(3), projectId: projCampus.id, assigneeId: priya.id } }),
    prisma.task.create({ data: { title: 'QR code check-in system', description: 'Generate unique QR codes per registration, scanner integration with camera plugin', status: TaskStatus.TODO, priority: TaskPriority.HIGH, dueDate: days(10), projectId: projCampus.id, assigneeId: kavya.id } }),
    prisma.task.create({ data: { title: 'Push notification implementation', description: 'Firebase Cloud Messaging integration for event reminders and updates', status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, dueDate: days(14), projectId: projCampus.id, assigneeId: arjun.id } }),
    prisma.task.create({ data: { title: 'Backend event management API', description: 'REST API for event CRUD, registration, attendance tracking with Express.js', status: TaskStatus.TODO, priority: TaskPriority.HIGH, dueDate: days(7), projectId: projCampus.id, assigneeId: sneha.id } }),
  ]);

  const mlTasks = await Promise.all([
    prisma.task.create({ data: { title: 'Collect and preprocess academic abstracts dataset', description: 'Scrape 50K abstracts from ArXiv, clean text, remove duplicates, tokenize with BERT tokenizer', status: TaskStatus.COMPLETED, priority: TaskPriority.HIGH, dueDate: days(-12), projectId: projML.id, assigneeId: arjun.id, milestoneId: ms4.id } }),
    prisma.task.create({ data: { title: 'Fine-tune BERT model on sentiment labels', description: 'Transfer learning from bert-base-uncased, 3-class sentiment (positive/neutral/negative)', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, dueDate: days(5), projectId: projML.id, assigneeId: arjun.id, milestoneId: ms5.id } }),
    prisma.task.create({ data: { title: 'Build FastAPI inference endpoint', description: 'REST API wrapping the trained model for real-time predictions with confidence scores', status: TaskStatus.REVIEW, priority: TaskPriority.MEDIUM, dueDate: days(2), projectId: projML.id, assigneeId: sneha.id, milestoneId: ms5.id } }),
    prisma.task.create({ data: { title: 'Create analytics dashboard with D3.js charts', description: 'Visualize sentiment trends over time, word clouds, distribution charts', status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, dueDate: days(12), projectId: projML.id, assigneeId: kavya.id } }),
  ]);

  const studyTasks = await Promise.all([
    prisma.task.create({ data: { title: 'Design student profile schema', description: 'Fields: subjects, learning style, schedule, expertise level, location preference', status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, dueDate: days(1), projectId: projStudy.id, assigneeId: rohan.id } }),
    prisma.task.create({ data: { title: 'Build collaborative filtering algorithm', description: 'User-based CF using cosine similarity on subject/schedule vectors', status: TaskStatus.TODO, priority: TaskPriority.HIGH, dueDate: days(8), projectId: projStudy.id, assigneeId: arjun.id } }),
    prisma.task.create({ data: { title: 'Design matching UI wireframes', description: 'Swipe-based matching interface with detailed profile cards', status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, dueDate: days(6), projectId: projStudy.id, assigneeId: priya.id } }),
  ]);

  const allTasks = [...pcTasks, ...campusTasks, ...mlTasks, ...studyTasks];
  console.log(`  ✅ Created ${allTasks.length} tasks\n`);

  // ─── Subtasks ─────────────────────────────────────────────────────────────────
  console.log('📋 Creating subtasks...');
  const kanbanTask = pcTasks[5];
  const jwtTask = pcTasks[2];
  const bertTask = mlTasks[1];

  await Promise.all([
    prisma.subtask.create({ data: { taskId: kanbanTask.id, title: 'Set up drag-and-drop library', isCompleted: true } }),
    prisma.subtask.create({ data: { taskId: kanbanTask.id, title: 'Create DragDropContext with 4 columns', isCompleted: true } }),
    prisma.subtask.create({ data: { taskId: kanbanTask.id, title: 'Implement onDragEnd handler with status sync', isCompleted: false } }),
    prisma.subtask.create({ data: { taskId: kanbanTask.id, title: 'Add task card details modal with comments', isCompleted: false } }),
    prisma.subtask.create({ data: { taskId: kanbanTask.id, title: 'Connect to backend Task CRUD APIs', isCompleted: false } }),
    prisma.subtask.create({ data: { taskId: jwtTask.id, title: 'Install jsonwebtoken and bcrypt', isCompleted: true } }),
    prisma.subtask.create({ data: { taskId: jwtTask.id, title: 'Build register endpoint with hashed password', isCompleted: true } }),
    prisma.subtask.create({ data: { taskId: jwtTask.id, title: 'Build login endpoint with token generation', isCompleted: true } }),
    prisma.subtask.create({ data: { taskId: jwtTask.id, title: 'Implement refresh token rotation', isCompleted: true } }),
    prisma.subtask.create({ data: { taskId: bertTask.id, title: 'Load dataset with HuggingFace datasets library', isCompleted: true } }),
    prisma.subtask.create({ data: { taskId: bertTask.id, title: 'Configure TrainingArguments for 3 epochs', isCompleted: true } }),
    prisma.subtask.create({ data: { taskId: bertTask.id, title: 'Run training on GPU cluster', isCompleted: false } }),
    prisma.subtask.create({ data: { taskId: bertTask.id, title: 'Evaluate on held-out test set', isCompleted: false } }),
    prisma.subtask.create({ data: { taskId: bertTask.id, title: 'Export model to ONNX for inference', isCompleted: false } }),
  ]);
  console.log('  ✅ Created subtasks\n');

  // ─── Task Comments ────────────────────────────────────────────────────────────
  console.log('💬 Creating task comments...');
  await Promise.all([
    prisma.taskComment.create({ data: { taskId: kanbanTask.id, userId: priya.id, content: "I've started on the DragDropContext setup. The board layout is ready. Should have a working prototype by tomorrow!", createdAt: days(-3) } }),
    prisma.taskComment.create({ data: { taskId: kanbanTask.id, userId: rohan.id, content: "Great! Make sure the column IDs match our TaskStatus enum exactly: TODO, IN_PROGRESS, REVIEW, COMPLETED.", createdAt: days(-2) } }),
    prisma.taskComment.create({ data: { taskId: kanbanTask.id, userId: arjun.id, content: "Should we also add an Urgent label/filter on the cards? It would help prioritize tasks visually.", createdAt: days(-1) } }),
    prisma.taskComment.create({ data: { taskId: kanbanTask.id, userId: priya.id, content: "Good idea! I'll add priority color indicators — red dot for HIGH, amber for MEDIUM, slate for LOW.", createdAt: days(0) } }),
    prisma.taskComment.create({ data: { taskId: jwtTask.id, userId: sneha.id, content: "All subtasks completed. The refresh token rotation is working correctly — old tokens are invalidated in the Token table on each refresh.", createdAt: days(-8) } }),
    prisma.taskComment.create({ data: { taskId: jwtTask.id, userId: rohan.id, content: "Excellent work! Tested all edge cases — expired tokens, invalid signatures, and reused refresh tokens all return proper 401/403 errors.", createdAt: days(-7) } }),
    prisma.taskComment.create({ data: { taskId: bertTask.id, userId: arjun.id, content: "Training is going well on the GPU cluster. Current epoch 2/3, validation accuracy is at 87.3%. Should hit our 90% target by epoch 3.", createdAt: days(-1) } }),
    prisma.taskComment.create({ data: { taskId: bertTask.id, userId: kavya.id, content: "That's great progress! Once the model is done, I can start on the D3.js visualization dashboard. Just send me the inference API spec.", createdAt: days(0) } }),
  ]);
  console.log('  ✅ Created task comments\n');

  // ─── Activity Logs ────────────────────────────────────────────────────────────
  console.log('📊 Creating activity logs...');
  await Promise.all([
    prisma.activityLog.create({ data: { userId: rohan.id, projectId: projPC.id, action: 'CREATED_PROJECT', metadata: JSON.stringify({ title: 'ProjectCollab AI Platform' }), createdAt: days(-20) } }),
    prisma.activityLog.create({ data: { userId: rohan.id, projectId: projPC.id, action: 'COMPLETED_TASK', metadata: JSON.stringify({ title: 'Initialize monorepo project structure' }), createdAt: days(-19) } }),
    prisma.activityLog.create({ data: { userId: sneha.id, projectId: projPC.id, action: 'COMPLETED_TASK', metadata: JSON.stringify({ title: 'Implement JWT authentication system' }), createdAt: days(-8) } }),
    prisma.activityLog.create({ data: { userId: priya.id, projectId: projPC.id, action: 'UPDATED_TASK_STATUS', metadata: JSON.stringify({ title: 'Build Kanban Board', from: 'TODO', to: 'IN_PROGRESS' }), createdAt: days(-3) } }),
    prisma.activityLog.create({ data: { userId: arjun.id, projectId: projPC.id, action: 'CREATED_TASK', metadata: JSON.stringify({ title: 'Connect GitHub API for commit analytics' }), createdAt: days(-2) } }),
    prisma.activityLog.create({ data: { userId: sneha.id, projectId: projPC.id, action: 'UPDATED_TASK_STATUS', metadata: JSON.stringify({ title: 'Project workspace API', from: 'IN_PROGRESS', to: 'REVIEW' }), createdAt: days(-1) } }),
    prisma.activityLog.create({ data: { userId: arjun.id, projectId: projML.id, action: 'CREATED_PROJECT', metadata: JSON.stringify({ title: 'ML Sentiment Analysis Engine' }), createdAt: days(-15) } }),
    prisma.activityLog.create({ data: { userId: arjun.id, projectId: projML.id, action: 'COMPLETED_TASK', metadata: JSON.stringify({ title: 'Collect and preprocess academic abstracts dataset' }), createdAt: days(-10) } }),
    prisma.activityLog.create({ data: { userId: sneha.id, projectId: projML.id, action: 'UPDATED_TASK_STATUS', metadata: JSON.stringify({ title: 'FastAPI inference endpoint', from: 'IN_PROGRESS', to: 'REVIEW' }), createdAt: days(-1) } }),
  ]);
  console.log('  ✅ Created activity logs\n');

  // ─── Notifications ────────────────────────────────────────────────────────────
  console.log('🔔 Creating notifications...');
  await Promise.all([
    prisma.notification.create({ data: { userId: rohan.id, title: 'Task Assigned to You', message: 'Arjun assigned you "Connect GitHub API for commit analytics" in ProjectCollab AI Platform.', isRead: false } }),
    prisma.notification.create({ data: { userId: rohan.id, title: 'AI Risk Alert', message: 'Campus Event App health dropped to 48%. 3 tasks overdue. Run the AI Sprint Planner for recovery suggestions.', isRead: false } }),
    prisma.notification.create({ data: { userId: rohan.id, title: 'Deadline Approaching', message: '"Implement Team invitation system" is due in 2 days. 2 subtasks still pending.', isRead: true } }),
    prisma.notification.create({ data: { userId: priya.id, title: 'Task Assigned to You', message: 'Rohan assigned you "Build Kanban Board with drag-and-drop" in ProjectCollab AI Platform.', isRead: false } }),
    prisma.notification.create({ data: { userId: priya.id, title: 'Code Review Requested', message: 'Sneha moved "Design system: glassmorphism UI components" to In Review. Please review.', isRead: false } }),
    prisma.notification.create({ data: { userId: priya.id, title: 'New Comment on Your Task', message: 'Arjun commented on "Build Kanban Board": "Should we add an Urgent label filter on the cards?"', isRead: true } }),
    prisma.notification.create({ data: { userId: arjun.id, title: 'Task Assigned to You', message: 'Rohan assigned you "Socket.io real-time team chat integration" in ProjectCollab AI Platform.', isRead: false } }),
    prisma.notification.create({ data: { userId: arjun.id, title: 'Milestone Due Soon', message: '"Model Fine-tuning & Evaluation" milestone is due in 7 days. 2 tasks still in progress.', isRead: false } }),
    prisma.notification.create({ data: { userId: sneha.id, title: 'Task Moved to Review', message: 'Your task "FastAPI inference endpoint" has been moved to Code Review by the team lead.', isRead: false } }),
    prisma.notification.create({ data: { userId: sneha.id, title: 'Task Assigned to You', message: 'Rohan assigned you "Set up CI/CD pipeline with GitHub Actions" in ProjectCollab AI Platform.', isRead: true } }),
    prisma.notification.create({ data: { userId: kavya.id, title: 'Task Assigned to You', message: 'Arjun assigned you "Create analytics dashboard with D3.js charts" in ML Sentiment Engine.', isRead: false } }),
    prisma.notification.create({ data: { userId: kavya.id, title: 'Sprint Velocity Drop', message: 'Smart Study Group Finder sprint velocity is 45% below target this week. Action needed.', isRead: false } }),
  ]);
  console.log('  ✅ Created 12 notifications\n');

  // ─── Meetings ─────────────────────────────────────────────────────────────────
  console.log('📅 Creating meetings...');
  const todayAt = (hour: number) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  await Promise.all([
    prisma.meeting.create({ data: { projectId: projPC.id, title: 'Daily Standup', dateTime: todayAt(9), link: 'https://meet.google.com/pcai-standup-daily', createdBy: rohan.id } }),
    prisma.meeting.create({ data: { projectId: projPC.id, title: 'Authentication Module Code Review', dateTime: todayAt(14), link: 'https://meet.google.com/pcai-auth-review-2024', createdBy: rohan.id } }),
    prisma.meeting.create({ data: { projectId: projPC.id, title: 'Sprint 4 Planning Session', dateTime: days(3), link: 'https://meet.google.com/pcai-sprint4-planning', createdBy: rohan.id } }),
    prisma.meeting.create({ data: { projectId: projPC.id, title: 'Kanban Board Design Review', dateTime: days(5), link: 'https://meet.google.com/pcai-kanban-review', createdBy: priya.id } }),
    prisma.meeting.create({ data: { projectId: projML.id, title: 'ML Model Training Progress Check', dateTime: days(2), link: 'https://meet.google.com/ml-training-progress', createdBy: arjun.id } }),
    prisma.meeting.create({ data: { projectId: projML.id, title: 'Final Model Demo & Evaluation', dateTime: days(9), link: 'https://meet.google.com/ml-final-demo-2024', createdBy: arjun.id } }),
    prisma.meeting.create({ data: { projectId: projCampus.id, title: 'Campus App Retrospective', dateTime: days(4), link: 'https://meet.google.com/campus-retro-q3', createdBy: kavya.id } }),
  ]);
  console.log('  ✅ Created 7 meetings\n');

  // ─── Git Analytics ────────────────────────────────────────────────────────────
  console.log('🔀 Creating Git analytics...');
  await Promise.all([
    prisma.gitAnalytics.create({
      data: {
        projectId: projPC.id,
        commitsCount: 127,
        lastCommitTime: days(0),
        contributionData: JSON.stringify({
          'rohan@university.edu': { commits: 52, additions: 18420, deletions: 4210, percentage: 41 },
          'priya@university.edu': { commits: 34, additions: 12840, deletions: 2180, percentage: 27 },
          'arjun@university.edu': { commits: 28, additions: 8640, deletions: 1840, percentage: 22 },
          'sneha@university.edu': { commits: 13, additions: 3200, deletions: 520, percentage: 10 },
        }),
      },
    }),
    prisma.gitAnalytics.create({
      data: {
        projectId: projML.id,
        commitsCount: 68,
        lastCommitTime: days(-1),
        contributionData: JSON.stringify({
          'arjun@university.edu': { commits: 42, additions: 12400, deletions: 2800, percentage: 62 },
          'sneha@university.edu': { commits: 16, additions: 4200, deletions: 680, percentage: 24 },
          'kavya@university.edu': { commits: 10, additions: 2800, deletions: 360, percentage: 14 },
        }),
      },
    }),
  ]);
  console.log('  ✅ Created Git analytics\n');

  // ─── Chat Messages ─────────────────────────────────────────────────────────────
  console.log('💬 Creating team chat messages...');
  if (false) { // Demo chat messages are intentionally disabled; chats begin empty.
    await Promise.all([
    prisma.message.create({
      data: {
        content: 'Hey team! Just pushed the updated authentication flow. Can someone review the PR?',
        senderId: priya.id,
        teamId: teamPCai.id,
        projectId: projPC.id,
        createdAt: days(-1),
      },
    }),
    prisma.message.create({
      data: {
        content: "I'll take a look now. Is the endpoint documentation updated too?",
        senderId: arjun.id,
        teamId: teamPCai.id,
        projectId: projPC.id,
        createdAt: days(-1),
      },
    }),
    prisma.message.create({
      data: {
        content: "Yes, I've updated the API docs. All endpoints are documented with request/response examples.",
        senderId: rohan.id,
        teamId: teamPCai.id,
        projectId: projPC.id,
        createdAt: days(-1),
      },
    }),
    prisma.message.create({
      data: {
        content: "Great work! Also, let's schedule the code review session for tomorrow at 2 PM. Does that work for everyone?",
        senderId: sneha.id,
        teamId: teamPCai.id,
        projectId: projPC.id,
        createdAt: days(-1),
      },
    }),
    prisma.message.create({
      data: {
        content: '2 PM works for me! Should we use the Google Meet link in the meetings section?',
        senderId: priya.id,
        teamId: teamPCai.id,
        projectId: projPC.id,
        createdAt: days(0),
      },
    }),
    prisma.message.create({
      data: {
        content: "Perfect! Also wanted to mention — the AI planner gave us an interesting insight on dependency risks.",
        senderId: kavya.id,
        teamId: teamML.id,
        projectId: projML.id,
        createdAt: days(0),
      },
    }),
    ]);
  }
  console.log('  ✅ Created team chat messages\n');

  // ─── Done ─────────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('🎉 Seed completed successfully!\n');
  console.log('📊 What was created:');
  console.log(`   👤 Users:         ${users.length}`);
  console.log(`   👥 Teams:         2`);
  console.log(`   📁 Projects:      ${projects.length}`);
  console.log(`   🏁 Milestones:    5`);
  console.log(`   ✅ Tasks:         ${allTasks.length}`);
  console.log(`   📅 Meetings:      7 (2 today)`);
  console.log(`   🔔 Notifications: 12`);
  console.log('');
  console.log('🔐 Login credentials (all same password):');
  console.log('   rohan@university.edu   → password123  (Team Owner)');
  console.log('   priya@university.edu   → password123  (Team Admin)');
  console.log('   arjun@university.edu   → password123  (ML Team Owner)');
  console.log('   sneha@university.edu   → password123  (Member)');
  console.log('   kavya@university.edu   → password123  (Member)');
  console.log('═══════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
