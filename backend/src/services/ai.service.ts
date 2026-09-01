import { AIRouterService } from './aiRouter.service';

export interface PlannerOutput {
  title: string;
  totalTime: string;
  phases: { phase: string; duration: string; tasks: string[] }[];
  milestones: { title: string; description: string; daysFromStart: number }[];
  deliverables: string[];
  dependencies: string[];
  techSuggestions: string[];
  teamDistribution: { roleName: string; recommendedMemberCount: number }[];
  risks: string[];
  suggestions: string[];
}

export interface RequirementOutput {
  title: string;
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  userStories: { role: string; feature: string; benefit: string }[];
  acceptanceCriteria: string[];
  missingRequirements: string[];
  estimatedCompletionTime: string;
  suggestedImprovements: string[];
  riskAreas: { area: string; description: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }[];
}

export interface RiskAnalysisOutput {
  projectName: string;
  overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  delayProbability: number;
  riskCategories: {
    technicalRisks: { risk: string; impact: string; mitigation: string; severity: string }[];
    timelineRisks: { risk: string; impact: string; mitigation: string; severity: string }[];
    securityRisks: { risk: string; impact: string; mitigation: string; severity: string }[];
    budgetRisks: { risk: string; impact: string; mitigation: string; severity: string }[];
    teamRisks: { risk: string; impact: string; mitigation: string; severity: string }[];
  };
  reasons: string[];
  recommendations: string[];
}

export class AIService {
  // 1. AI PLANNER
  static async planProject(
    title: string,
    objectives: string[],
    teamSize: number,
    deadline: string,
    userId?: string
  ): Promise<PlannerOutput> {
    const prompt = `
You are an expert AI software architect and project manager.
Analyze the following project details and generate a complete, professional project plan:

Project Title: "${title}"
Objectives: ${objectives.length > 0 ? objectives.join(', ') : 'Not explicitly specified'}
Team Size: ${teamSize} members
Target Deadline: ${deadline || '14 weeks'}

Generate a JSON object matching EXACTLY this TypeScript structure:
{
  "title": "AI Roadmap for ${title}",
  "totalTime": "${deadline || '14 weeks'}",
  "phases": [
    { "phase": "Phase Name", "duration": "Duration", "tasks": ["Task 1", "Task 2"] }
  ],
  "milestones": [
    { "title": "Milestone Title", "description": "Milestone Description", "daysFromStart": 14 }
  ],
  "deliverables": ["Deliverable 1", "Deliverable 2"],
  "dependencies": ["Dependency 1", "Dependency 2"],
  "techSuggestions": ["Tech 1", "Tech 2"],
  "teamDistribution": [
    { "roleName": "Role Name", "recommendedMemberCount": 2 }
  ],
  "risks": ["Risk 1", "Risk 2"],
  "suggestions": ["Suggestion 1", "Suggestion 2"]
}
`;

    const res = await AIRouterService.generateJSON<PlannerOutput>(
      prompt,
      () => this.generateDynamicPlan(title, objectives, teamSize, deadline),
      { feature: 'planner', ...(userId ? { userId } : {}) }
    );
    return res.data;
  }

  // 2. REQUIREMENT ANALYZER
  static async analyzeRequirements(documentText: string, userId?: string): Promise<RequirementOutput> {
    const prompt = `
You are a senior software requirement engineer.
Analyze the following project proposal/requirement document:

Document Content:
"""
${documentText.substring(0, 5000)}
"""

Extract and analyze requirements. Generate a JSON object matching EXACTLY this TypeScript structure:
{
  "title": "Requirement Analysis",
  "functionalRequirements": ["Functional Requirement 1", "Functional Requirement 2"],
  "nonFunctionalRequirements": ["Non-Functional Requirement 1", "Non-Functional Requirement 2"],
  "userStories": [
    { "role": "User Role", "feature": "Feature description", "benefit": "Business benefit" }
  ],
  "acceptanceCriteria": ["Criteria 1", "Criteria 2"],
  "missingRequirements": ["Missing Requirement 1", "Missing Requirement 2"],
  "estimatedCompletionTime": "Estimated duration (e.g. 10 weeks)",
  "suggestedImprovements": ["Improvement 1", "Improvement 2"],
  "riskAreas": [
    { "area": "Risk Area Name", "description": "Detailed risk description", "severity": "HIGH" }
  ]
}
`;

    const res = await AIRouterService.generateJSON<RequirementOutput>(
      prompt,
      () => this.generateDynamicRequirementAnalysis(documentText),
      { feature: 'analyzer', ...(userId ? { userId } : {}) }
    );
    return res.data;
  }

  // 3. AI RISK DETECTION ENGINE
  static async analyzeProjectRisk(
    projectName: string,
    description: string,
    teamSize?: number,
    deadline?: string,
    userId?: string
  ): Promise<RiskAnalysisOutput> {
    const prompt = `
You are a risk management AI for software projects.
Analyze the risk profile for this project:

Project Name: "${projectName}"
Description: "${description}"
Team Size: ${teamSize || 4}
Deadline: ${deadline || '12 weeks'}

Generate a JSON object matching EXACTLY this structure:
{
  "projectName": "${projectName}",
  "overallRiskLevel": "HIGH", // "LOW", "MEDIUM", "HIGH", or "CRITICAL"
  "delayProbability": 68,
  "riskCategories": {
    "technicalRisks": [
      { "risk": "Risk name", "impact": "Impact desc", "mitigation": "Mitigation strategy", "severity": "HIGH" }
    ],
    "timelineRisks": [
      { "risk": "Risk name", "impact": "Impact desc", "mitigation": "Mitigation strategy", "severity": "MEDIUM" }
    ],
    "securityRisks": [
      { "risk": "Risk name", "impact": "Impact desc", "mitigation": "Mitigation strategy", "severity": "HIGH" }
    ],
    "budgetRisks": [
      { "risk": "Risk name", "impact": "Impact desc", "mitigation": "Mitigation strategy", "severity": "LOW" }
    ],
    "teamRisks": [
      { "risk": "Risk name", "impact": "Impact desc", "mitigation": "Mitigation strategy", "severity": "MEDIUM" }
    ]
  },
  "reasons": ["Key Reason 1", "Key Reason 2"],
  "recommendations": ["Action 1", "Action 2"]
}
`;

    const res = await AIRouterService.generateJSON<RiskAnalysisOutput>(
      prompt,
      () => this.generateDynamicRiskAnalysis(projectName, description, teamSize, deadline),
      { feature: 'risk', ...(userId ? { userId } : {}) }
    );
    return res.data;
  }

  // 4. DELAY PREDICTION
  static async predictDelay(tasks: any[], milestones: any[], commitCount: number) {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const pendingTasks = totalTasks - completedTasks;
    const now = new Date();
    const overdueMilestones = milestones.filter(m => m.status !== 'COMPLETED' && new Date(m.dueDate) < now);

    let delayProbability = 15;
    const reasons: string[] = [];

    if (overdueMilestones.length > 0) {
      delayProbability += overdueMilestones.length * 20;
      reasons.push(`${overdueMilestones.length} milestone(s) are past their target deadlines.`);
    }

    const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
    if (totalTasks > 0 && completionRate < 0.4) {
      delayProbability += 25;
      reasons.push(`Low task completion rate (${Math.round(completionRate * 100)}% completed out of ${totalTasks} tasks).`);
    }

    if (commitCount < 10) {
      delayProbability += 15;
      reasons.push(`Low GitHub repository commit activity detected (${commitCount} total commits).`);
    }

    delayProbability = Math.min(Math.max(delayProbability, 8), 95);
    const riskLevel = delayProbability > 65 ? 'HIGH' : delayProbability > 35 ? 'MEDIUM' : 'LOW';

    return {
      delayProbability,
      riskLevel,
      reasons: reasons.length > 0 ? reasons : ['Project velocity is currently aligned with schedule.']
    };
  }

  // 5. SPRINT SUMMARY
  static async generateSprintSummary(
    completedTasks: string[],
    pendingTasks: string[],
    commitStats: string,
    blockages: string[],
    userId?: string
  ) {
    const prompt = `
You are an Agile Sprint Analyst AI.
Summarize the current sprint performance:

Completed Tasks: ${completedTasks.length > 0 ? completedTasks.join(', ') : 'None'}
Pending Tasks: ${pendingTasks.length > 0 ? pendingTasks.join(', ') : 'None'}
Commit Stats: ${commitStats}
Blockages: ${blockages.length > 0 ? blockages.join(', ') : 'None'}

Return a JSON object:
{
  "workCompleted": ["Summary of completed item 1"],
  "pendingWork": ["Summary of pending item 1"],
  "delayRisks": ["Risk or blockage 1"],
  "productivityIndex": 85
}
`;

    const res = await AIRouterService.generateJSON(
      prompt,
      () => ({
        workCompleted: completedTasks.length > 0 ? completedTasks : ['Initial authentication module', 'Database schema setup'],
        pendingWork: pendingTasks.length > 0 ? pendingTasks : ['Web socket implementation', 'Unit test coverage'],
        delayRisks: blockages.length > 0 ? blockages : ['No active sprint blockages detected'],
        productivityIndex: Math.floor(Math.random() * 20) + 75,
      }),
      { feature: 'general', ...(userId ? { userId } : {}) }
    );
    return res.data;
  }

  // 6. HEALTH SCORE COMPUTATION
  static computeHealthScore(taskCompletionRate: number, commitFreq: number, chatActivityCount: number, overdueCount: number) {
    const taskScore = taskCompletionRate * 100 * 0.40;
    const commitRatio = Math.min(commitFreq / 15, 1);
    const commitScore = commitRatio * 100 * 0.30;
    const chatRatio = Math.min(chatActivityCount / 10, 1);
    const chatScore = chatRatio * 100 * 0.15;
    const overduePenalty = Math.min(overdueCount * 8, 15);
    const baselineScore = taskScore + commitScore + chatScore;
    const healthScore = Math.max(Math.min(Math.round(baselineScore - overduePenalty), 100), 10);

    let status: 'HEALTHY' | 'ATTENTION' | 'RISK' = 'HEALTHY';
    if (healthScore < 50) {
      status = 'RISK';
    } else if (healthScore < 75) {
      status = 'ATTENTION';
    }

    return {
      score: healthScore,
      status,
      metrics: {
        taskCompletionRate: Math.round(taskCompletionRate * 100),
        commitFreq,
        chatActivityCount,
        overdueCount
      }
    };
  }

  // --- DYNAMIC FALLBACK ENGINE ---(Produces unique, contextual outputs when inputs change) ---

  private static generateDynamicPlan(
    title: string,
    objectives: string[],
    teamSize: number,
    deadline: string
  ): PlannerOutput {
    const lowerTitle = title.toLowerCase();
    const isMobile = lowerTitle.includes('mobile') || lowerTitle.includes('app') || lowerTitle.includes('flutter') || lowerTitle.includes('ios');
    const isAI = lowerTitle.includes('ai') || lowerTitle.includes('ml') || lowerTitle.includes('model') || lowerTitle.includes('gpt');
    const isWeb = lowerTitle.includes('web') || lowerTitle.includes('dashboard') || lowerTitle.includes('portal') || lowerTitle.includes('system');
    const isSecurity = lowerTitle.includes('sec') || lowerTitle.includes('auth') || lowerTitle.includes('crypto');

    const phases = [
      {
        phase: 'Phase 1: Discovery & Architecture',
        duration: '2 weeks',
        tasks: [
          `Define scope for ${title}`,
          'Map system architecture & database schema',
          'Create high-fidelity wireframes and Figma specs',
          'Setup Git environment and CI/CD pipelines'
        ]
      },
      {
        phase: 'Phase 2: Core Infrastructure & API',
        duration: '4 weeks',
        tasks: [
          'Develop authentication & RBAC authorization',
          'Implement core database REST endpoints',
          isSecurity ? 'Configure AES-256 encryption & token rotation' : 'Integrate input validation schemas (Zod/Joi)',
          'Setup automated unit & integration testing'
        ]
      },
      {
        phase: 'Phase 3: Feature Engineering & UI',
        duration: '4 weeks',
        tasks: [
          isMobile ? 'Build responsive mobile views and navigation stack' : 'Develop glassmorphic interactive web components',
          isAI ? 'Connect LLM service endpoints with streaming handlers' : 'Build real-time updates & notification triggers',
          'Integrate state management store (Zustand/Redux)',
          'Optimize user interaction latency & responsiveness'
        ]
      },
      {
        phase: 'Phase 4: Integration, QA & Launch',
        duration: '3 weeks',
        tasks: [
          'Perform end-to-end integration testing',
          'Conduct security vulnerability scan & audit',
          'Configure cloud production deployment (Vercel/AWS)',
          'Deliver user documentation & final presentation'
        ]
      }
    ];

    const milestones = [
      { title: 'Project Initialization & Spec Sign-off', description: 'Architecture blueprints and database schema finalized.', daysFromStart: 10 },
      { title: 'Core API & Auth Layer Complete', description: 'Secure authentication endpoints and database operational.', daysFromStart: 25 },
      { title: 'UI Dashboard & Feature MVP', description: 'Primary interactive features ready for internal testing.', daysFromStart: 50 },
      { title: 'Final QA & Production Release', description: 'Performance optimized, security verified, deployed live.', daysFromStart: 85 }
    ];

    const techSuggestions = [
      isMobile ? 'React Native / Expo' : 'React 18 + Vite',
      'TypeScript 5',
      'Tailwind CSS v3',
      'Node.js + Express API',
      'Prisma ORM with PostgreSQL',
      isAI ? 'Google Gemini API / OpenAI API' : 'Socket.io (Realtime Data)',
      'Docker & GitHub Actions CI/CD'
    ];

    const teamDistribution = [
      { roleName: 'Lead Full-Stack / DB Architect', recommendedMemberCount: 1 },
      { roleName: 'Frontend & UI Developer', recommendedMemberCount: Math.max(1, Math.floor(teamSize / 2)) },
      { roleName: isAI ? 'AI / ML Engineer' : 'Backend & API Developer', recommendedMemberCount: 1 },
      { roleName: 'QA & DevOps Specialist', recommendedMemberCount: Math.max(1, teamSize - 3) }
    ];

    return {
      title: `AI Strategic Plan: ${title}`,
      totalTime: deadline || '14 weeks',
      phases,
      milestones,
      deliverables: [
        'Production Deployment URL',
        'Complete Source Code Repository',
        'API & Architecture Documentation',
        'Automated Test Suite'
      ],
      dependencies: [
        'PostgreSQL Database Instance',
        'Cloud Hosting Platform (Vercel/Railway)',
        isAI ? 'Google Gemini API Key' : 'Third-party Service API Credentials'
      ],
      techSuggestions,
      teamDistribution,
      risks: [
        `Tight schedule for ${deadline || '14 weeks'} duration with ${teamSize} members`,
        isAI ? 'LLM API rate limits and response formatting constraints' : 'Third-party API integration bottlenecks',
        'Key member availability during evaluation milestones'
      ],
      suggestions: [
        'Prioritize authentication and database core in Sprint 1',
        'Implement automated CI builds on every pull request',
        'Hold bi-weekly demo check-ins with stakeholders'
      ]
    };
  }

  private static generateDynamicRequirementAnalysis(text: string): RequirementOutput {
    const wordCount = text.split(/\s+/).length;
    const lower = text.toLowerCase();

    const isSecurity = lower.includes('security') || lower.includes('auth') || lower.includes('password') || lower.includes('token');
    const isData = lower.includes('data') || lower.includes('analytic') || lower.includes('chart') || lower.includes('report');
    const isRealtime = lower.includes('chat') || lower.includes('live') || lower.includes('socket') || lower.includes('realtime');

    const functionalRequirements = [
      'User Authentication & Multi-Account Session Management',
      'Interactive Workspace Dashboard with Real-Time Updates',
      isRealtime ? 'WebSocket-driven Real-Time Team Communication' : 'Role-Based Access Control (RBAC) & Team Management',
      isData ? 'Automated Analytics & Health Score Calculation' : 'Task Creation, Assignment & Kanban Drag-and-Drop Board',
      'Exportable Activity Reports and Integration Logging'
    ];

    const nonFunctionalRequirements = [
      'Sub-200ms API response time for read queries',
      '99.9% application uptime and error resiliency',
      'TLS/SSL encrypted transport with JWT token authorization',
      'Mobile-responsive UI with dark mode support'
    ];

    const userStories = [
      {
        role: 'Team Leader',
        feature: 'View project risk alerts and delay predictions',
        benefit: 'Prevent deadline slips before they impact project launch'
      },
      {
        role: 'Software Developer',
        feature: 'Sync GitHub commits and pull requests with task boards',
        benefit: 'Keep code updates and project task statuses in sync'
      },
      {
        role: 'Academic Assessor',
        feature: 'Generate automated project requirement and progress reports',
        benefit: 'Evaluate team contributions and technical completeness easily'
      }
    ];

    const missingRequirements = [];
    if (!isSecurity) {
      missingRequirements.push('Specific token rotation & session expiry policies');
    }
    if (!isData) {
      missingRequirements.push('Data retention & backup archiving strategies');
    }
    missingRequirements.push('End-to-end integration test suite specification');
    missingRequirements.push('Disaster recovery & database failover protocol');

    return {
      title: 'AI Requirement Analysis Summary',
      functionalRequirements,
      nonFunctionalRequirements,
      userStories,
      acceptanceCriteria: [
        'All endpoints require valid JWT authentication header',
        'Database operations complete without data loss or unhandled rejections',
        'UI components pass responsive layout checks across desktop and mobile viewports',
        'Codebase builds with zero TypeScript compilation errors'
      ],
      missingRequirements,
      estimatedCompletionTime: `${Math.min(Math.max(Math.floor(wordCount / 50) + 8, 6), 16)} weeks`,
      suggestedImprovements: [
        'Incorporate automated input validation schemas on all POST/PUT routes',
        'Implement central error logging middleware for backend exception monitoring',
        'Add end-to-end smoke tests using Playwright/Cypress'
      ],
      riskAreas: [
        {
          area: 'Scope Creep',
          description: 'Loose specifications may lead to uncontrolled feature expansion.',
          severity: wordCount < 100 ? 'HIGH' : 'MEDIUM'
        },
        {
          area: 'Security Architecture',
          description: isSecurity ? 'Standard security mentioned; requires strict JWT refresh handling.' : 'Missing explicit security parameters.',
          severity: isSecurity ? 'LOW' : 'HIGH'
        }
      ]
    };
  }

  private static generateDynamicRiskAnalysis(
    projectName: string,
    description: string,
    teamSize: number = 4,
    deadline: string = '12 weeks'
  ): RiskAnalysisOutput {
    const lower = (projectName + ' ' + description).toLowerCase();
    const isAI = lower.includes('ai') || lower.includes('gpt') || lower.includes('gemini');
    const isRealtime = lower.includes('socket') || lower.includes('chat') || lower.includes('stream');

    return {
      projectName,
      overallRiskLevel: teamSize < 3 ? 'HIGH' : 'MEDIUM',
      delayProbability: teamSize < 3 ? 72 : 42,
      riskCategories: {
        technicalRisks: [
          {
            risk: isAI ? 'AI API Rate Limits & Quota Exhaustion' : 'Database Connection Pooling Bottlenecks',
            impact: 'API requests fail or experience high latency during peak traffic.',
            mitigation: 'Implement exponential backoff retry logic and fallback cache layers.',
            severity: 'HIGH'
          },
          {
            risk: isRealtime ? 'WebSocket Connection Drops' : 'Third-Party Integration Failures',
            impact: 'Users lose real-time updates or state synchronizations.',
            mitigation: 'Implement automatic socket reconnection with client heartbeat checks.',
            severity: 'MEDIUM'
          }
        ],
        timelineRisks: [
          {
            risk: `Ambitious Scope for ${deadline} Timeline`,
            impact: 'Key features may be rushed or cut during final testing.',
            mitigation: 'Define a strict Minimum Viable Product (MVP) for Sprint 1 & 2.',
            severity: 'HIGH'
          }
        ],
        securityRisks: [
          {
            risk: 'Exposed API Keys or Weak JWT Signing Keys',
            impact: 'Unauthorized access to backend endpoints or user data.',
            mitigation: 'Store keys in server-side environment variables (.env); never expose on frontend.',
            severity: 'HIGH'
          }
        ],
        budgetRisks: [
          {
            risk: 'Third-Party Cloud Infrastructure Cost Spikes',
            impact: 'Unexpected billing from database or AI services.',
            mitigation: 'Set hard spending limits and usage alerts on cloud developer accounts.',
            severity: 'LOW'
          }
        ],
        teamRisks: [
          {
            risk: `Resource Bottleneck with ${teamSize}-Member Team`,
            impact: 'Single point of failure if a key engineer is absent.',
            mitigation: 'Enforce code reviews and maintain shared documentation for all modules.',
            severity: teamSize < 3 ? 'HIGH' : 'MEDIUM'
          }
        ]
      },
      reasons: [
        `Team size of ${teamSize} requires careful task division to avoid key dependency bottlenecks.`,
        `Project scope includes complex components (${isAI ? 'AI generation' : 'real-time sync'}).`
      ],
      recommendations: [
        'Lock core API contracts early in development',
        'Maintain >80% unit test coverage for core business logic',
        'Set up automated deployment pipelines to test builds continuously'
      ]
    };
  }
}
