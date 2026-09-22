import { create } from 'zustand';
import api from '../utils/api';

export interface ProjectBrief {
  id: string;
  title: string;
  description?: string;
  status: 'HEALTHY' | 'ATTENTION' | 'RISK';
  healthScore: number;
  teamId: string;
  teamName: string;
  membersCount?: number;
  tasksCount?: number;
  completedTasksCount?: number;
  githubRepo?: string | null;
  createdAt?: string;
}

interface ProjectState {
  activeProjectId: string | null;
  activeProject: ProjectBrief | null;
  userProjects: ProjectBrief[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchUserProjects: () => Promise<ProjectBrief[]>;
  setActiveProjectId: (id: string | null) => void;
  setActiveProject: (project: ProjectBrief | null) => void;
  switchProject: (projectId: string) => void;
}

const STORAGE_KEY = 'pcai-active-project-id';

export const useProjectStore = create<ProjectState>((set, get) => ({
  activeProjectId: localStorage.getItem(STORAGE_KEY) || null,
  activeProject: null,
  userProjects: [],
  loading: false,
  error: null,

  fetchUserProjects: async () => {
    try {
      set({ loading: true, error: null });
      const res = await api.get('/projects/my-projects');
      const rawProjects = res.data.projects || [];

      const formatted: ProjectBrief[] = rawProjects.map((p: any) => {
        const tasks = p.tasks || [];
        const completedTasks = tasks.filter((t: any) => t.status === 'COMPLETED').length;
        const membersCount = p.team?.members?.length || 0;

        return {
          id: p.id,
          title: p.title,
          description: p.description,
          status: p.status || 'HEALTHY',
          healthScore: typeof p.healthScore === 'number' ? p.healthScore : 100,
          teamId: p.teamId,
          teamName: p.team?.name || 'Workspace Team',
          membersCount,
          tasksCount: tasks.length,
          completedTasksCount: completedTasks,
          githubRepo: p.githubRepo,
          createdAt: p.createdAt,
        };
      });

      const currentActiveId = get().activeProjectId;
      let matchingActive = formatted.find(p => p.id === currentActiveId) || null;

      // If active project not found or none selected yet, default to first project
      if (!matchingActive && formatted.length > 0) {
        matchingActive = formatted[0];
        localStorage.setItem(STORAGE_KEY, matchingActive.id);
      } else if (formatted.length === 0) {
        matchingActive = null;
        localStorage.removeItem(STORAGE_KEY);
      }

      set({
        userProjects: formatted,
        activeProjectId: matchingActive ? matchingActive.id : null,
        activeProject: matchingActive,
        loading: false,
      });

      return formatted;
    } catch (err: any) {
      console.error('[fetchUserProjects error]', err);
      set({ loading: false, error: err.message || 'Failed to fetch projects' });
      return [];
    }
  },

  setActiveProjectId: (id: string | null) => {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
      const found = get().userProjects.find(p => p.id === id) || null;
      set({ activeProjectId: id, activeProject: found });
    } else {
      localStorage.removeItem(STORAGE_KEY);
      set({ activeProjectId: null, activeProject: null });
    }
  },

  setActiveProject: (project: ProjectBrief | null) => {
    if (project) {
      localStorage.setItem(STORAGE_KEY, project.id);
      set({ activeProjectId: project.id, activeProject: project });
    } else {
      localStorage.removeItem(STORAGE_KEY);
      set({ activeProjectId: null, activeProject: null });
    }
  },

  switchProject: (projectId: string) => {
    const found = get().userProjects.find(p => p.id === projectId) || null;
    localStorage.setItem(STORAGE_KEY, projectId);
    set({ activeProjectId: projectId, activeProject: found });
  },
}));
