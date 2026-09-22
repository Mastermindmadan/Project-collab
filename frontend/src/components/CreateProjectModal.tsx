import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Plus, Search, Users, Loader2, AlertCircle,
  Crown, Check, ShieldCheck, Tag
} from 'lucide-react';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';

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

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newProject: any) => void;
}

const COMMON_TECH_SUGGESTIONS = [
  'React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Python',
  'Next.js', 'TailwindCSS', 'Express', 'Docker', 'Prisma'
];

export default function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const currentUser = useAuthStore((s) => s.user);

  // Form states
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [techInput, setTechInput] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [teamName, setTeamName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [objectiveInput, setObjectiveInput] = useState('');

  // Available users list & search
  const [availableUsers, setAvailableUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // Submission & Validation states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState<{
    projectName?: string;
    teamName?: string;
    members?: string;
  }>({});

  // Fetch users when modal opens and ensure creator is selected
  useEffect(() => {
    if (!isOpen) return;

    setErrorMessage('');
    setValidationErrors({});

    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        const res = await api.get('/projects/available-users');
        const users: UserItem[] = res.data.users || [];
        setAvailableUsers(users);

        // Current user should always be selected as creator
        if (currentUser?.id) {
          setSelectedMemberIds((prev) =>
            prev.includes(currentUser.id) ? prev : [currentUser.id, ...prev]
          );
        }
      } catch (err) {
        console.error('Failed to load registered users:', err);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [isOpen, currentUser?.id]);

  // Ensure current user is in selected members whenever current user changes
  useEffect(() => {
    if (currentUser?.id && !selectedMemberIds.includes(currentUser.id)) {
      setSelectedMemberIds((prev) => [currentUser.id, ...prev]);
    }
  }, [currentUser?.id, selectedMemberIds]);

  // Filtered users based on search
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return availableUsers;
    return availableUsers.filter((u) => {
      const nameMatch = u.name?.toLowerCase().includes(q);
      const emailMatch = u.email?.toLowerCase().includes(q);
      const skillsMatch = Array.isArray(u.skills) && u.skills.some((s) => s.toLowerCase().includes(q));
      return nameMatch || emailMatch || skillsMatch;
    });
  }, [availableUsers, userSearch]);

  // Selected users details map
  const selectedUsersList = useMemo(() => {
    return availableUsers.filter((u) => selectedMemberIds.includes(u.id));
  }, [availableUsers, selectedMemberIds]);

  // Toggle member selection (creator cannot be toggled off)
  const toggleMember = (userId: string) => {
    if (userId === currentUser?.id) return; // Creator cannot be removed

    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );

    if (validationErrors.members) {
      setValidationErrors((v) => ({ ...v, members: undefined }));
    }
  };

  // Tech stack handling
  const handleAddTech = (tech: string) => {
    const trimmed = tech.trim();
    if (!trimmed) return;
    if (!techStack.includes(trimmed)) {
      setTechStack((prev) => [...prev, trimmed]);
    }
    setTechInput('');
  };

  const handleRemoveTech = (techToRemove: string) => {
    setTechStack((prev) => prev.filter((t) => t !== techToRemove));
  };

  // Objectives handling
  const handleAddObjective = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = objectiveInput.trim();
    if (!trimmed) return;
    if (!objectives.includes(trimmed)) {
      setObjectives((prev) => [...prev, trimmed]);
    }
    setObjectiveInput('');
  };

  const handleRemoveObjective = (objToRemove: string) => {
    setObjectives((prev) => prev.filter((o) => o !== objToRemove));
  };

  // Validate form
  const validateForm = () => {
    const errors: { projectName?: string; teamName?: string; members?: string } = {};

    if (!projectName.trim()) {
      errors.projectName = 'Project name is required.';
    }
    if (!teamName.trim()) {
      errors.teamName = 'Team name is required.';
    }
    if (selectedMemberIds.length === 0) {
      errors.members = 'At least one team member is required.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!validateForm()) return;

    try {
      setIsSubmitting(true);

      const payload = {
        title: projectName.trim(),
        description: description.trim(),
        techStack,
        githubRepo: githubRepo.trim() || null,
        teamName: teamName.trim(),
        memberIds: selectedMemberIds,
        objectives,
      };

      const res = await api.post('/projects/create-with-team', payload);
      const createdProject = res.data.project;

      // Reset form state on successful creation
      setProjectName('');
      setDescription('');
      setTechStack([]);
      setTechInput('');
      setGithubRepo('');
      setTeamName('');
      setObjectives([]);
      setObjectiveInput('');
      setSelectedMemberIds(currentUser?.id ? [currentUser.id] : []);

      onSuccess(createdProject);
    } catch (err: any) {
      console.error('Project creation error:', err);
      setErrorMessage(
        err.response?.data?.error ||
        err.message ||
        'Failed to create project and team. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-2xl border-slate-700 shadow-2xl animate-fade-in my-8 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" /> Create New Project
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Launch a project workspace with its dedicated collaboration team.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto pr-1 space-y-6 flex-1 py-4">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* 1. PROJECT DETAILS SECTION */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Project Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. AI-Powered Course Helper"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value);
                  if (validationErrors.projectName) {
                    setValidationErrors((v) => ({ ...v, projectName: undefined }));
                  }
                }}
                className={`w-full px-4 py-2.5 bg-slate-950/60 border ${
                  validationErrors.projectName ? 'border-rose-500/60 ring-1 ring-rose-500/30' : 'border-slate-800'
                } rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all font-medium`}
              />
              {validationErrors.projectName && (
                <p className="text-[11px] text-rose-400 mt-1 font-medium">{validationErrors.projectName}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Description
              </label>
              <textarea
                placeholder="Summarize the core targets of this academic project module..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all resize-none leading-relaxed font-normal"
              />
            </div>

            {/* Technology Stack with tag input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Technology Stack</span>
                <span className="text-[10px] text-slate-500 font-normal">Press Enter to add tag</span>
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="e.g. React, Node.js, Python, PostgreSQL"
                  value={techInput}
                  onChange={(e) => setTechInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTech(techInput);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => handleAddTech(techInput)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-755 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-all cursor-pointer"
                >
                  Add
                </button>
              </div>

              {/* Selected tech chips */}
              {techStack.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {techStack.map((tech) => (
                    <span
                      key={tech}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium"
                    >
                      <Tag className="w-3 h-3 text-primary/70" />
                      {tech}
                      <button
                        type="button"
                        onClick={() => handleRemoveTech(tech)}
                        className="hover:text-white ml-0.5 text-primary/70 cursor-pointer"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Popular tech suggestions */}
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-[10px] text-slate-500 mr-1 font-medium">Suggestions:</span>
                {COMMON_TECH_SUGGESTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleAddTech(t)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Repository (Optional)
              </label>
              <input
                type="text"
                placeholder="owner/repo (e.g. facebook/react)"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all font-mono"
              />
            </div>
          </div>

          {/* 2. PROJECT TEAM SECTION */}
          <div className="pt-5 border-t border-slate-850 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Project Team</h3>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Team Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. ProjectCollab Development Team"
                value={teamName}
                onChange={(e) => {
                  setTeamName(e.target.value);
                  if (validationErrors.teamName) {
                    setValidationErrors((v) => ({ ...v, teamName: undefined }));
                  }
                }}
                className={`w-full px-4 py-2.5 bg-slate-950/60 border ${
                  validationErrors.teamName ? 'border-rose-500/60 ring-1 ring-rose-500/30' : 'border-slate-800'
                } rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all font-medium`}
              />
              {validationErrors.teamName && (
                <p className="text-[11px] text-rose-400 mt-1 font-medium">{validationErrors.teamName}</p>
              )}
            </div>

            {/* Member Selector Component */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300">
                  Select Team Members <span className="text-rose-400">*</span>
                </label>
                <span className="text-xs text-primary font-semibold">
                  {selectedMemberIds.length} {selectedMemberIds.length === 1 ? 'member' : 'members'} selected
                </span>
              </div>

              {/* Selected member chips bar */}
              {selectedUsersList.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2.5 mb-3 bg-slate-950/40 border border-slate-855 rounded-xl">
                  {selectedUsersList.map((u) => {
                    const isCreator = u.id === currentUser?.id;
                    return (
                      <div
                        key={u.id}
                        className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs ${
                          isCreator
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium truncate max-w-[120px]">{u.name}</span>
                        {isCreator ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] uppercase font-bold text-amber-400 px-1 py-0.2 bg-amber-500/20 rounded">
                            <Crown className="w-2.5 h-2.5" /> Owner
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleMember(u.id)}
                            className="text-slate-400 hover:text-white ml-0.5 font-bold cursor-pointer"
                            title="Remove member"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Search input */}
              <div className="relative mb-2">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search members by name, email, or skill..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all"
                />
              </div>

              {/* Member checklist box */}
              <div className="border border-slate-800 rounded-xl bg-slate-950/40 divide-y divide-slate-850/60 max-h-48 overflow-y-auto">
                {loadingUsers ? (
                  <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading registered users...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No users matching "{userSearch}"
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const isCreator = u.id === currentUser?.id;
                    const isSelected = selectedMemberIds.includes(u.id);

                    return (
                      <div
                        key={u.id}
                        onClick={() => toggleMember(u.id)}
                        className={`flex items-center justify-between p-2.5 px-3 transition-colors cursor-pointer ${
                          isSelected ? 'bg-primary/5' : 'hover:bg-slate-900/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Custom Checkbox */}
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                              isSelected
                                ? isCreator
                                  ? 'bg-amber-500 border-amber-500 text-slate-950'
                                  : 'bg-primary border-primary text-primary-foreground'
                                : 'border-slate-700 bg-slate-900'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>

                          {/* Avatar */}
                          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 flex-shrink-0">
                            {u.name.charAt(0).toUpperCase()}
                          </div>

                          {/* Name and email */}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                              {u.name}
                              {isCreator && (
                                <span className="text-[10px] text-amber-400 font-extrabold flex items-center gap-0.5 px-1 py-0.2 bg-amber-500/10 rounded">
                                  <Crown className="w-2.5 h-2.5" /> Project Owner
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                          </div>
                        </div>

                        {/* Role / Skills / Availability pill */}
                        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                          {u.availabilityStatus && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium border ${
                                u.availabilityStatus === 'AVAILABLE'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : u.availabilityStatus === 'BUSY'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  u.availabilityStatus === 'AVAILABLE'
                                    ? 'bg-emerald-400'
                                    : u.availabilityStatus === 'BUSY'
                                    ? 'bg-rose-400'
                                    : 'bg-amber-400'
                                }`}
                              />
                              {u.availabilityLabel || (u.availabilityStatus === 'AVAILABLE' ? 'Available' : 'Assigned')}
                            </span>
                          )}
                          {Array.isArray(u.skills) && u.skills.slice(0, 2).map((s) => (
                            <span key={s} className="hidden sm:inline-block text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 font-mono">
                              {s}
                            </span>
                          ))}
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-850 px-2 py-0.5 rounded">
                            {isCreator ? 'Owner' : (u.role || 'Member')}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {validationErrors.members && (
                <p className="text-[11px] text-rose-400 mt-1 font-medium">{validationErrors.members}</p>
              )}
            </div>
          </div>

          {/* 3. PROJECT CORE OBJECTIVES SECTION */}
          <div className="pt-5 border-t border-slate-850 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Project Core Objectives</h3>
            </div>
            <p className="text-xs text-slate-400">
              Define target outcomes, key milestones, or project goals.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Implement user authentication and role management"
                value={objectiveInput}
                onChange={(e) => setObjectiveInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddObjective();
                  }
                }}
                className="flex-1 px-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => handleAddObjective()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer"
              >
                Add
              </button>
            </div>

            {objectives.length > 0 && (
              <div className="space-y-1.5 p-3 bg-slate-950/30 border border-slate-850 rounded-xl">
                {objectives.map((obj, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 text-xs text-slate-300">
                    <span className="flex items-start gap-2">
                      <span className="text-primary font-bold mt-0.5">•</span>
                      <span>{obj}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveObjective(obj)}
                      className="text-slate-500 hover:text-rose-400 font-bold ml-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-800 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 border border-slate-700 text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-primary/20 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating Project...
                </>
              ) : (
                'Create Project'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
