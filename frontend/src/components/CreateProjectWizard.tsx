import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Plus, Search, Loader2, AlertCircle,
  Crown, Check, Sparkles,
  ArrowRight, ArrowLeft, Trash2, Github, Target,
  Clock, Rocket
} from 'lucide-react';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';
import { toast } from 'sonner';

interface UserItem {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: string;
  skills: string[];
  openTasksCount?: number;
  teamsCount?: number;
  availabilityStatus?: 'AVAILABLE' | 'ASSIGNED' | 'BUSY';
  availabilityLabel?: string;
}

interface TeamItem {
  id: string;
  name: string;
  members?: Array<{
    userId: string;
    role: string;
    user: { id: string; name: string; email: string; avatarUrl?: string; skills?: any };
  }>;
}

interface WizardTask {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  assigneeId: string | null;
  dueDate: string;
}

interface WizardMilestone {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  tasks: WizardTask[];
}

interface CreateProjectWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newProject: any) => void;
}

const COMMON_TECH_SUGGESTIONS = [
  'React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Python',
  'Next.js', 'TailwindCSS', 'Express', 'Docker', 'Prisma'
];

const PROJECT_CATEGORIES = [
  'Software Engineering',
  'Full-Stack Web App',
  'Mobile Application',
  'AI / Machine Learning',
  'Cloud & DevOps',
  'Research & Thesis',
];

const MEMBER_ROLES = [
  'Developer',
  'Frontend Lead',
  'Backend Lead',
  'Full-Stack Engineer',
  'UI/UX Designer',
  'QA Tester',
  'DevOps Specialist',
  'Documentation Lead',
];

export default function CreateProjectWizard({ isOpen, onClose, onSuccess }: CreateProjectWizardProps) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  // Active step (1 to 8)
  const [currentStep, setCurrentStep] = useState(1);

  // ── Step 1: Basic Information
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Software Engineering');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [techInput, setTechInput] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().split('T')[0];
  });

  // ── Step 2: Team Members
  const [existingTeams, setExistingTeams] = useState<TeamItem[]>([]);
  const [selectedExistingTeamId, setSelectedExistingTeamId] = useState<string>('');
  const [teamName, setTeamName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberRoleMap, setMemberRoleMap] = useState<Record<string, string>>({});
  const [availableUsers, setAvailableUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // ── Step 3: Project Objectives
  const [objectives, setObjectives] = useState<string[]>([
    'Design architecture and database schema',
    'Develop core functional features and REST APIs',
    'Integrate authentication, security, and authorization',
    'Conduct comprehensive testing and deployment',
  ]);
  const [objectiveInput, setObjectiveInput] = useState('');

  // ── Step 4 & 5: AI Plan Generation & Milestones / Tasks
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planGenerated, setPlanGenerated] = useState(false);
  const [milestones, setMilestones] = useState<WizardMilestone[]>([]);

  // ── Step 7: GitHub
  const [githubRepo, setGithubRepo] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ── Load available users and teams on open ──
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');

    // Fetch registered users
    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        const [usersRes, teamsRes] = await Promise.all([
          api.get('/projects/available-users'),
          api.get('/teams/my-teams'),
        ]);

        const users: UserItem[] = usersRes.data.users || [];
        setAvailableUsers(users);

        const teams: TeamItem[] = teamsRes.data.teams || [];
        setExistingTeams(teams);

        // Creator is default selected
        if (currentUser?.id) {
          setSelectedMemberIds((prev) => (prev.includes(currentUser.id) ? prev : [currentUser.id, ...prev]));
          setMemberRoleMap((prev) => ({ ...prev, [currentUser.id]: 'Project Owner' }));
        }
      } catch (err) {
        console.error('Failed to load users/teams for wizard:', err);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();

    // Check if opened from AI Planner with a prepared draft plan
    const draftRaw = localStorage.getItem('pcai_planner_project_draft');
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw);
        if (draft.title) setProjectName(draft.title);
        if (draft.description) setDescription(draft.description);
        if (draft.techStack && Array.isArray(draft.techStack) && draft.techStack.length > 0) {
          setTechStack(draft.techStack);
        }
        if (draft.phases && Array.isArray(draft.phases) && draft.phases.length > 0) {
          const projectStartMs = new Date(startDate).getTime();
          const draftMilestones: WizardMilestone[] = draft.phases.map((p: any, idx: number) => {
            const daysOffset = (idx + 1) * 14;
            const msDue = new Date(projectStartMs + daysOffset * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const tasks: WizardTask[] = (p.tasks || []).map((tTitle: string, tIdx: number) => ({
              id: `task-${idx}-${tIdx}`,
              title: tTitle,
              description: `Implement ${tTitle} according to specifications.`,
              priority: tIdx === 0 ? 'HIGH' : 'MEDIUM',
              assigneeId: currentUser?.id || null,
              dueDate: msDue,
            }));
            return {
              id: `ms-${idx}`,
              title: p.phase || `Milestone ${idx + 1}`,
              description: `Deliverable phase: ${p.phase}`,
              dueDate: msDue,
              tasks: tasks.length > 0 ? tasks : [
                { id: `task-${idx}-0`, title: `Deliver ${p.phase}`, description: '', priority: 'HIGH', assigneeId: currentUser?.id || null, dueDate: msDue }
              ],
            };
          });
          setMilestones(draftMilestones);
        }
        localStorage.removeItem('pcai_planner_project_draft');
      } catch (e) {
        console.error('Failed to parse planner draft', e);
      }
    }
  }, [isOpen, currentUser?.id, startDate]);

  // Keep creator locked in selectedMemberIds
  useEffect(() => {
    if (currentUser?.id && !selectedMemberIds.includes(currentUser.id)) {
      setSelectedMemberIds((prev) => [currentUser.id, ...prev]);
      setMemberRoleMap((prev) => ({ ...prev, [currentUser.id]: 'Project Owner' }));
    }
  }, [currentUser?.id, selectedMemberIds]);

  // When project name changes, suggest team name if empty or default
  useEffect(() => {
    if (projectName.trim() && !teamName) {
      setTeamName(`${projectName.trim()} Team`);
    }
  }, [projectName, teamName]);

  // Handle selecting an existing team
  const handleSelectExistingTeam = (teamId: string) => {
    setSelectedExistingTeamId(teamId);
    if (!teamId) return;

    const matchedTeam = existingTeams.find((t) => t.id === teamId);
    if (matchedTeam) {
      setTeamName(matchedTeam.name);
      const teamMemberIds = (matchedTeam.members || []).map((m) => m.userId || m.user?.id).filter(Boolean);
      // Merge with creator
      const combined = Array.from(new Set([currentUser?.id, ...teamMemberIds].filter(Boolean) as string[]));
      setSelectedMemberIds(combined);
    }
  };

  // Add tech tag
  const addTechTag = (val: string) => {
    const tag = val.trim();
    if (tag && !techStack.includes(tag)) {
      setTechStack((prev) => [...prev, tag]);
    }
    setTechInput('');
  };

  // Add objective
  const addObjective = () => {
    const obj = objectiveInput.trim();
    if (obj && !objectives.includes(obj)) {
      setObjectives((prev) => [...prev, obj]);
    }
    setObjectiveInput('');
  };

  // Toggle member selection
  const toggleMember = (userId: string) => {
    if (userId === currentUser?.id) return; // Creator cannot be removed
    setSelectedMemberIds((prev) => {
      const exists = prev.includes(userId);
      if (exists) {
        return prev.filter((id) => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // Filtered users for step 2 search
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return availableUsers;
    return availableUsers.filter((u) => {
      const matchName = u.name.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      const matchSkills = u.skills.some((s) => s.toLowerCase().includes(q));
      return matchName || matchEmail || matchSkills;
    });
  }, [availableUsers, userSearch]);

  // ── Step 4: AI Plan Generation ──
  const handleGenerateAIPlan = async () => {
    setGeneratingPlan(true);
    setErrorMsg('');
    try {
      const payload = {
        title: projectName || 'Software Engineering Project',
        description: description || 'Academic software development project',
        objectives,
        teamSize: selectedMemberIds.length || 4,
        deadline: `${Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)))} weeks`,
      };

      const res = await api.post('/ai/planner', payload);
      const plan = res.data.plan;

      // Transform plan milestones into WizardMilestones
      const generatedMilestones: WizardMilestone[] = [];
      const projectStartMs = new Date(startDate).getTime();

      if (Array.isArray(plan.milestones) && plan.milestones.length > 0) {
        plan.milestones.forEach((m: any, idx: number) => {
          const daysFromStart = Number(m.daysFromStart) || (idx + 1) * 14;
          const msDueDate = new Date(projectStartMs + daysFromStart * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          // Matching phase tasks if available
          const matchingPhase = plan.phases?.[idx];
          const phaseTasks: string[] = matchingPhase?.tasks || [];

          const wizardTasks: WizardTask[] = phaseTasks.map((tTitle: string, tIdx: number) => {
            // Suggest an assignee from selected members
            const assignee = selectedMemberIds[tIdx % selectedMemberIds.length] || null;
            return {
              id: `task-${idx}-${tIdx}`,
              title: tTitle,
              description: `Implement ${tTitle} according to specifications.`,
              priority: tIdx === 0 ? 'HIGH' : 'MEDIUM',
              assigneeId: assignee,
              dueDate: msDueDate,
            };
          });

          // If no phase tasks, create default tasks
          if (wizardTasks.length === 0) {
            wizardTasks.push({
              id: `task-${idx}-0`,
              title: `Deliver ${m.title}`,
              description: m.description || 'Milestone deliverable task',
              priority: 'HIGH',
              assigneeId: selectedMemberIds[0] || null,
              dueDate: msDueDate,
            });
          }

          generatedMilestones.push({
            id: `ms-${idx}`,
            title: m.title || `Milestone ${idx + 1}`,
            description: m.description || '',
            dueDate: msDueDate,
            tasks: wizardTasks,
          });
        });
      } else {
        // Fallback default milestones
        generatedMilestones.push(
          {
            id: 'ms-0',
            title: 'Project Setup & Architecture',
            description: 'Initialize repository, dependencies, and core models',
            dueDate: new Date(projectStartMs + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            tasks: [
              { id: 't-0-0', title: 'Repository setup and project scaffolding', description: 'Configure linting and CI', priority: 'HIGH', assigneeId: selectedMemberIds[0] || null, dueDate: startDate },
              { id: 't-0-1', title: 'Database schema design & migrations', description: 'Create database tables and relations', priority: 'HIGH', assigneeId: selectedMemberIds[1] || selectedMemberIds[0] || null, dueDate: startDate },
            ],
          },
          {
            id: 'ms-1',
            title: 'Core Feature Development',
            description: 'Implement primary endpoints, controllers, and UI',
            dueDate: new Date(projectStartMs + 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            tasks: [
              { id: 't-1-0', title: 'Backend REST API implementation', description: 'Implement primary business logic', priority: 'HIGH', assigneeId: selectedMemberIds[0] || null, dueDate: endDate },
              { id: 't-1-1', title: 'Frontend UI layout and views', description: 'Build responsive components', priority: 'MEDIUM', assigneeId: selectedMemberIds[1] || null, dueDate: endDate },
            ],
          },
          {
            id: 'ms-2',
            title: 'Final Testing & Deployment',
            description: 'Automated testing, documentation, and live deployment',
            dueDate: endDate,
            tasks: [
              { id: 't-2-0', title: 'End-to-end integration testing', description: 'Verify all flows', priority: 'HIGH', assigneeId: selectedMemberIds[0] || null, dueDate: endDate },
              { id: 't-2-1', title: 'Cloud deployment & documentation', description: 'Deploy application to staging/production', priority: 'MEDIUM', assigneeId: selectedMemberIds[0] || null, dueDate: endDate },
            ],
          }
        );
      }

      setMilestones(generatedMilestones);
      setPlanGenerated(true);
      toast.success('AI Project Plan generated successfully!', {
        description: `${generatedMilestones.length} milestones and ${generatedMilestones.reduce((acc, m) => acc + m.tasks.length, 0)} tasks created.`,
      });
      // Move to review step
      setCurrentStep(5);
    } catch (err: any) {
      console.error('AI planning error:', err);
      setErrorMsg(err.response?.data?.message || 'Could not generate plan with AI. You can add milestones manually.');
      // Initialize with clean default milestones so user can proceed
      if (milestones.length === 0) {
        setMilestones([
          {
            id: 'ms-manual-1',
            title: 'Core Milestone 1',
            description: 'First major project deliverable',
            dueDate: endDate,
            tasks: [
              { id: 't-manual-1', title: 'Initial setup task', description: '', priority: 'HIGH', assigneeId: currentUser?.id || null, dueDate: endDate },
            ],
          },
        ]);
      }
    } finally {
      setGeneratingPlan(false);
    }
  };

  // Add a manual milestone
  const addMilestone = () => {
    const newMs: WizardMilestone = {
      id: `ms-${Date.now()}`,
      title: `Milestone ${milestones.length + 1}`,
      description: 'Milestone deliverable description',
      dueDate: endDate,
      tasks: [
        {
          id: `task-${Date.now()}`,
          title: 'Initial Milestone Task',
          description: '',
          priority: 'MEDIUM',
          assigneeId: selectedMemberIds[0] || null,
          dueDate: endDate,
        },
      ],
    };
    setMilestones((prev) => [...prev, newMs]);
  };

  // Remove a milestone
  const removeMilestone = (msId: string) => {
    setMilestones((prev) => prev.filter((m) => m.id !== msId));
  };

  // Add task to milestone
  const addTaskToMilestone = (msId: string) => {
    setMilestones((prev) =>
      prev.map((ms) => {
        if (ms.id !== msId) return ms;
        const newTask: WizardTask = {
          id: `task-${Date.now()}`,
          title: 'New Task',
          description: '',
          priority: 'MEDIUM',
          assigneeId: selectedMemberIds[0] || null,
          dueDate: ms.dueDate,
        };
        return { ...ms, tasks: [...ms.tasks, newTask] };
      })
    );
  };

  // Remove task from milestone
  const removeTask = (msId: string, taskId: string) => {
    setMilestones((prev) =>
      prev.map((ms) => {
        if (ms.id !== msId) return ms;
        return { ...ms, tasks: ms.tasks.filter((t) => t.id !== taskId) };
      })
    );
  };

  // Update task field
  const updateTask = (msId: string, taskId: string, field: keyof WizardTask, value: any) => {
    setMilestones((prev) =>
      prev.map((ms) => {
        if (ms.id !== msId) return ms;
        return {
          ...ms,
          tasks: ms.tasks.map((t) => (t.id === taskId ? { ...t, [field]: value } : t)),
        };
      })
    );
  };

  // ── Step Navigation & Validation ──
  const handleNext = () => {
    setErrorMsg('');
    if (currentStep === 1) {
      if (!projectName.trim()) {
        setErrorMsg('Please provide a project title.');
        return;
      }
      if (!description.trim()) {
        setErrorMsg('Please enter a project description.');
        return;
      }
      if (!startDate || !endDate) {
        setErrorMsg('Please specify start and completion dates.');
        return;
      }
      if (new Date(endDate) <= new Date(startDate)) {
        setErrorMsg('Expected completion date must be after the start date.');
        return;
      }
    } else if (currentStep === 2) {
      if (!selectedExistingTeamId && !teamName.trim()) {
        setErrorMsg('Please enter a team name for this project.');
        return;
      }
      if (selectedMemberIds.length === 0) {
        setErrorMsg('Please select at least one team member.');
        return;
      }
    } else if (currentStep === 3) {
      if (objectives.length === 0) {
        setErrorMsg('Please define at least one project objective.');
        return;
      }
    }

    setCurrentStep((prev) => Math.min(8, prev + 1));
  };

  const handleBack = () => {
    setErrorMsg('');
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  // ── Final Step 8: Atomic Project Creation ──
  const handleCreateProject = async () => {
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      // Structure payload for atomic backend transaction
      const payload = {
        title: projectName.trim(),
        description: description.trim(),
        techStack,
        githubRepo: githubRepo.trim() || null,
        existingTeamId: selectedExistingTeamId || undefined,
        teamName: teamName.trim(),
        memberIds: selectedMemberIds,
        objectives,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        milestones: milestones.map((ms) => ({
          title: ms.title.trim(),
          description: ms.description.trim(),
          dueDate: new Date(ms.dueDate).toISOString(),
          tasks: ms.tasks.map((t) => ({
            title: t.title.trim(),
            description: t.description.trim(),
            priority: t.priority,
            assigneeId: t.assigneeId,
            dueDate: new Date(t.dueDate).toISOString(),
          })),
        })),
      };

      const res = await api.post('/projects/create-with-team', payload);
      const newProject = res.data.project;

      toast.success('Project Workspace Created!', {
        description: `"${newProject.title}" is ready with all milestones, tasks, and members configured.`,
      });

      if (onSuccess) {
        onSuccess(newProject);
      }
      onClose();

      // Immediately redirect user to the created project workspace
      navigate(`/projects/${newProject.id}`);
    } catch (err: any) {
      console.error('Project creation failed:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to create project workspace. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const totalTasksCount = milestones.reduce((acc, ms) => acc + ms.tasks.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto" onClick={onClose}>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md" />

      <div
        className="relative w-full max-w-4xl glass-panel rounded-3xl border border-slate-800 shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] bg-slate-950/95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Wizard Header */}
        <div className="px-6 py-4 border-b border-slate-850 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Create Project Workspace</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-semibold border border-primary/20">
                  Step {currentStep} of 8
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {currentStep === 1 && 'Basic project info, dates, and technology stack'}
                {currentStep === 2 && 'Assign project members and workspace ownership'}
                {currentStep === 3 && 'Define primary deliverables and objectives'}
                {currentStep === 4 && 'Generate structured plan with Project Intelligence'}
                {currentStep === 5 && 'Review and fine-tune milestones, tasks, and assignments'}
                {currentStep === 6 && 'Review timeline schedule and delivery dates'}
                {currentStep === 7 && 'Connect GitHub repository for codebase tracking'}
                {currentStep === 8 && 'Review project plan summary and create workspace'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator Bar */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-900 bg-slate-950 flex items-center justify-between gap-1 overflow-x-auto">
          {[
            { step: 1, label: 'Info' },
            { step: 2, label: 'Members' },
            { step: 3, label: 'Objectives' },
            { step: 4, label: 'AI Plan' },
            { step: 5, label: 'Tasks' },
            { step: 6, label: 'Timeline' },
            { step: 7, label: 'GitHub' },
            { step: 8, label: 'Review' },
          ].map((s) => {
            const isCompleted = currentStep > s.step;
            const isCurrent = currentStep === s.step;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => {
                  if (isCompleted) setCurrentStep(s.step);
                }}
                disabled={!isCompleted && !isCurrent}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  isCurrent
                    ? 'bg-primary/20 text-primary border border-primary/40 font-bold'
                    : isCompleted
                    ? 'text-slate-300 hover:text-white cursor-pointer'
                    : 'text-slate-600 opacity-50 cursor-not-allowed'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                    isCompleted ? 'bg-emerald-500 text-slate-950 font-bold' : isCurrent ? 'bg-primary text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isCompleted ? '✓' : s.step}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Error Alert Banner */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* ═══════════════════ STEP 1: BASIC INFORMATION ═══════════════════ */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Project Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. ProjectCollab AI Platform"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Project Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="A collaborative engineering and project collaboration platform with task tracking and intelligent project insights..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white focus:border-primary/50 outline-none cursor-pointer"
                  >
                    {PROJECT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat} className="bg-slate-900">{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Start Date <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white focus:border-primary/50 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Target Completion Date <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white focus:border-primary/50 outline-none"
                  />
                </div>
              </div>

              {/* Tech stack */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Technology Stack (Tags)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Type technology and press Enter (e.g. React, Node.js)"
                    value={techInput}
                    onChange={(e) => setTechInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTechTag(techInput);
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => addTechTag(techInput)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl"
                  >
                    Add
                  </button>
                </div>

                {/* Selected chips */}
                {techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {techStack.map((tech) => (
                      <span
                        key={tech}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-primary font-mono"
                      >
                        {tech}
                        <button
                          type="button"
                          onClick={() => setTechStack((prev) => prev.filter((t) => t !== tech))}
                          className="hover:text-red-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Suggestions */}
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
                  <span className="text-slate-500 mr-1">Suggested:</span>
                  {COMMON_TECH_SUGGESTIONS.filter((s) => !techStack.includes(s)).slice(0, 6).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addTechTag(s)}
                      className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════ STEP 2: TEAM MEMBERS ═══════════════════ */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Existing Team Selection (Optional) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Existing Team (Optional)
                  </label>
                  <select
                    value={selectedExistingTeamId}
                    onChange={(e) => handleSelectExistingTeam(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white focus:border-primary/50 outline-none cursor-pointer"
                  >
                    <option value="" className="bg-slate-900">-- Create new dedicated team --</option>
                    {existingTeams.map((t) => (
                      <option key={t.id} value={t.id} className="bg-slate-900">
                        {t.name} ({t.members?.length || 0} members)
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Select an existing team to suggest its members, or leave empty to create a new team.
                  </p>
                </div>

                {/* Team Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Team Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ProjectCollab AI Core Team"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    The name of the collaborative workspace team for this project.
                  </p>
                </div>
              </div>

              {/* Selected Members Chips with Roles */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Selected Project Members ({selectedMemberIds.length})
                </label>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-900/50 border border-slate-800 rounded-2xl min-h-16 items-center">
                  {selectedMemberIds.map((userId) => {
                    const u = availableUsers.find((user) => user.id === userId) || (userId === currentUser?.id ? currentUser : null);
                    const isCreator = userId === currentUser?.id;
                    const assignedRole = memberRoleMap[userId] || (isCreator ? 'Project Owner' : 'Developer');

                    return (
                      <div
                        key={userId}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-850 border border-slate-750 text-xs"
                      >
                        <div className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-[10px]">
                          {u?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-white flex items-center gap-1">
                            {u?.name || 'User'}
                            {isCreator && <Crown className="w-3 h-3 text-amber-400" />}
                          </span>
                          {!isCreator ? (
                            <select
                              value={assignedRole}
                              onChange={(e) => setMemberRoleMap((prev) => ({ ...prev, [userId]: e.target.value }))}
                              className="text-[10px] bg-transparent text-primary outline-none cursor-pointer"
                            >
                              {MEMBER_ROLES.map((r) => (
                                <option key={r} value={r} className="bg-slate-900">{r}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[10px] text-amber-400 font-semibold">Owner</span>
                          )}
                        </div>

                        {!isCreator && (
                          <button
                            type="button"
                            onClick={() => toggleMember(userId)}
                            className="text-slate-400 hover:text-red-400 ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Teammate invitation callout */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-primary/10 border border-primary/20 text-xs">
                <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-white">Need to invite teammates not yet registered?</p>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    You can create the project now and share your team's direct invite link from the <strong>Teams</strong> workspace to onboard teammates in 1 click!
                  </p>
                </div>
              </div>

              {/* Searchable member selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Add Members from Platform
                </label>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by name, email, or skill..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-900/70 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-primary/50 outline-none"
                  />
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                  {loadingUsers ? (
                    <div className="text-center py-6 text-slate-500 text-xs flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading members...
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">No matching users found.</div>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelected = selectedMemberIds.includes(u.id);
                      const isCreator = u.id === currentUser?.id;

                      return (
                        <div
                          key={u.id}
                          onClick={() => toggleMember(u.id)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary/10 border-primary/30 text-white'
                              : 'bg-slate-900/40 border-slate-855 hover:bg-slate-900 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-300">
                              {u.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-xs font-bold flex items-center gap-1.5">
                                {u.name}
                                {isCreator && <span className="text-[10px] text-amber-400 font-semibold">(You)</span>}
                              </p>
                              <p className="text-[11px] text-slate-500">{u.email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Workload / Availability badge */}
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                                u.availabilityStatus === 'AVAILABLE'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : u.availabilityStatus === 'BUSY'
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {u.availabilityLabel || 'Available'}
                            </span>

                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                                isSelected ? 'bg-primary border-primary text-slate-950' : 'border-slate-700'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 font-bold" />}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════ STEP 3: PROJECT OBJECTIVES ═══════════════════ */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Project Objectives & Key Deliverables
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="e.g. Implement automated GitHub webhook syncing"
                    value={objectiveInput}
                    onChange={(e) => setObjectiveInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addObjective())}
                    className="flex-1 px-4 py-2.5 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none"
                  />
                  <button
                    type="button"
                    onClick={addObjective}
                    className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl"
                  >
                    Add Objective
                  </button>
                </div>

                {/* Objectives list */}
                <div className="space-y-2">
                  {objectives.map((obj, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-200"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-mono text-[10px] flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        <span>{obj}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setObjectives((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════ STEP 4: AI PLAN GENERATION ═══════════════════ */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="glass-panel p-6 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent relative overflow-hidden">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-2xl bg-primary/20 text-primary flex-shrink-0">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Generate Project Plan with AI</h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Project Intelligence will analyze your project title, technology stack, {objectives.length} objectives, and team size ({selectedMemberIds.length} members) to generate milestone phases, engineering tasks, priorities, and timeline estimates.
                    </p>

                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase">Project</span>
                        <span className="font-bold text-white truncate block">{projectName || 'Project'}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase">Tech Stack</span>
                        <span className="font-bold text-white truncate block">{techStack.join(', ') || 'Standard'}</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase">Team</span>
                        <span className="font-bold text-white">{selectedMemberIds.length} members</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase">Objectives</span>
                        <span className="font-bold text-white">{objectives.length} defined</span>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3 items-center">
                      <button
                        type="button"
                        disabled={generatingPlan}
                        onClick={handleGenerateAIPlan}
                        className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
                      >
                        {generatingPlan ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Analyzing with AI Engine...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            {planGenerated ? 'Regenerate Plan with AI' : 'Generate Project Plan with AI'}
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (milestones.length === 0) {
                            addMilestone();
                          }
                          setCurrentStep(5);
                        }}
                        className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                      >
                        Skip AI & Add Manually →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════ STEP 5: REVIEW & EDIT MILESTONES & TASKS ═══════════════════ */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Milestones & Task Allocation</h3>
                  <p className="text-xs text-slate-400">
                    {milestones.length} milestone{milestones.length !== 1 ? 's' : ''}, {totalTasksCount} task{totalTasksCount !== 1 ? 's' : ''}. Assign tasks to selected team members.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addMilestone}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Milestone
                </button>
              </div>

              {milestones.length === 0 ? (
                <div className="text-center py-10 glass-panel rounded-2xl border border-slate-850">
                  <Target className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-300">No milestones yet</p>
                  <p className="text-xs text-slate-500 mb-4">Add your first milestone or generate with AI.</p>
                  <button
                    type="button"
                    onClick={addMilestone}
                    className="px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl"
                  >
                    + Add Milestone
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {milestones.map((ms, mIdx) => (
                    <div key={ms.id} className="p-4 rounded-2xl bg-slate-900/60 border border-slate-850 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="w-6 h-6 rounded-lg bg-primary/20 text-primary font-bold text-xs flex items-center justify-center font-mono">
                            {mIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={ms.title}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMilestones((prev) => prev.map((m) => (m.id === ms.id ? { ...m, title: val } : m)));
                            }}
                            className="bg-transparent font-bold text-white text-sm outline-none border-b border-transparent focus:border-primary/50 flex-1"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <input
                              type="date"
                              value={ms.dueDate}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMilestones((prev) => prev.map((m) => (m.id === ms.id ? { ...m, dueDate: val } : m)));
                              }}
                              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 outline-none"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => removeMilestone(ms.id)}
                            className="text-slate-500 hover:text-red-400 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Tasks in this milestone */}
                      <div className="space-y-2 pl-2">
                        {ms.tasks.map((task, _tIdx) => (
                          <div
                            key={task.id}
                            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={task.title}
                                onChange={(e) => updateTask(ms.id, task.id, 'title', e.target.value)}
                                className="w-full bg-transparent font-medium text-white outline-none border-b border-transparent focus:border-primary/40"
                              />
                            </div>

                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                              {/* Priority */}
                              <select
                                value={task.priority}
                                onChange={(e) => updateTask(ms.id, task.id, 'priority', e.target.value)}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold bg-slate-900 cursor-pointer ${
                                  task.priority === 'HIGH'
                                    ? 'border-red-500/30 text-red-400'
                                    : task.priority === 'MEDIUM'
                                    ? 'border-amber-500/30 text-amber-400'
                                    : 'border-slate-700 text-slate-400'
                                }`}
                              >
                                <option value="HIGH">High Priority</option>
                                <option value="MEDIUM">Medium Priority</option>
                                <option value="LOW">Low Priority</option>
                              </select>

                              {/* Member Assignment Dropdown */}
                              <select
                                value={task.assigneeId || ''}
                                onChange={(e) => updateTask(ms.id, task.id, 'assigneeId', e.target.value || null)}
                                className="px-2 py-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 text-[11px] cursor-pointer max-w-[150px]"
                              >
                                <option value="">-- Unassigned --</option>
                                {selectedMemberIds.map((userId) => {
                                  const u = availableUsers.find((user) => user.id === userId) || (userId === currentUser?.id ? currentUser : null);
                                  return (
                                    <option key={userId} value={userId}>
                                      {u?.name || 'Member'}
                                    </option>
                                  );
                                })}
                              </select>

                              <button
                                type="button"
                                onClick={() => removeTask(ms.id, task.id)}
                                className="text-slate-500 hover:text-red-400 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => addTaskToMilestone(ms.id)}
                          className="w-full py-2 border border-dashed border-slate-800 hover:border-slate-700 rounded-xl text-slate-400 hover:text-white text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Add Task to {ms.title}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════ STEP 6: TIMELINE ═══════════════════ */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Visual Delivery Timeline</h3>
                <p className="text-xs text-slate-400">
                  Calculated from your start date ({startDate}) to target completion date ({endDate}).
                </p>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-850 pb-2">
                  <span>Start: <strong className="text-white">{startDate}</strong></span>
                  <span>Target: <strong className="text-white">{endDate}</strong></span>
                </div>

                {milestones.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">No milestones scheduled on the timeline.</p>
                ) : (
                  <div className="space-y-3">
                    {milestones.map((ms, _idx) => {
                      const totalSpanMs = Math.max(1, new Date(endDate).getTime() - new Date(startDate).getTime());
                      const dueMs = new Date(ms.dueDate).getTime() - new Date(startDate).getTime();
                      const pct = Math.min(100, Math.max(10, Math.round((dueMs / totalSpanMs) * 100)));

                      return (
                        <div key={ms.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-200 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-primary" />
                              {ms.title} ({ms.tasks.length} tasks)
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">{ms.dueDate}</span>
                          </div>
                          <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════ STEP 7: GITHUB INTEGRATION ═══════════════════ */}
          {currentStep === 7 && (
            <div className="space-y-4">
              <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-white">
                    <Github className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">GitHub Repository Link</h3>
                    <p className="text-xs text-slate-400">
                      Connect your codebase to enable automated commit analytics, branch monitoring, and task verification.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Repository Identifier (<code className="text-primary font-mono">owner/repo</code>)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. facebook/react or your-org/project-repo"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900/70 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    You can link this now or connect/change repositories at any time from Project Settings.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════ STEP 8: FINAL REVIEW & CREATE ═══════════════════ */}
          {currentStep === 8 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">Review Project Configuration</h3>
                <p className="text-xs text-slate-400">
                  Verify your project parameters before generating the workspace.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-850 space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-bold">Project Name</span>
                  <p className="text-sm font-bold text-white">{projectName}</p>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{description}</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-850 space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-bold">Workspace Team</span>
                  <p className="text-sm font-bold text-white">{teamName}</p>
                  <p className="text-[11px] text-slate-400">{selectedMemberIds.length} members assigned</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-850 space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-bold">Timeline & Schedule</span>
                  <p className="text-xs font-semibold text-white">{startDate} → {endDate}</p>
                  <p className="text-[11px] text-slate-400">{milestones.length} milestones, {totalTasksCount} tasks</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-850 space-y-1">
                  <span className="text-slate-500 text-[10px] uppercase font-bold">Tech & Repository</span>
                  <p className="text-xs font-semibold text-primary">{techStack.join(', ') || 'General'}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{githubRepo || 'No repo linked'}</p>
                </div>
              </div>

              {/* Members Breakdown */}
              <div className="p-3.5 rounded-2xl bg-slate-900/40 border border-slate-850">
                <span className="text-slate-500 text-[10px] uppercase font-bold block mb-2">Team Members ({selectedMemberIds.length})</span>
                <div className="flex flex-wrap gap-2">
                  {selectedMemberIds.map((uid) => {
                    const u = availableUsers.find((user) => user.id === uid) || (uid === currentUser?.id ? currentUser : null);
                    const isOwner = uid === currentUser?.id;
                    return (
                      <span key={uid} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-850 border border-slate-750 text-xs text-slate-200">
                        {u?.name || 'Member'}
                        {isOwner && <Crown className="w-3 h-3 text-amber-400" />}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Navigation */}
        <div className="px-6 py-4 border-t border-slate-850 flex items-center justify-between bg-slate-900/50">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-750 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>

            {currentStep < 8 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
              >
                Next <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCreateProject}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating Project Workspace...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" />
                    Create Project Workspace
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
