import { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';
import { useProjectStore } from '../store/project.store';
import {
  CheckSquare, Plus, Search, Filter, Clock, User,
  MoreVertical, Loader2, X, MessageSquare, Send, Trash2, ShieldAlert, CheckCircle, AlertCircle, Target,
  ArrowRight, FolderOpen
} from 'lucide-react';

type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
type Status = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';

interface UserBrief {
  id: string;
  name: string;
  avatarUrl?: string;
  email?: string;
}

interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  dueDate?: string | null;
  assigneeId?: string | null;
  assignee?: UserBrief | null;
  milestoneId?: string | null;
  oldSubtasks: Subtask[];
  comments: Comment[];
  githubVerified?: boolean;
}

interface Column {
  id: Status;
  title: string;
  color: string;
  tasks: Task[];
}

const priorityConfig: Record<Priority, { label: string; color: string; dot: string }> = {
  HIGH: { label: 'High', color: 'text-red-400', dot: 'bg-red-500' },
  MEDIUM: { label: 'Medium', color: 'text-amber-400', dot: 'bg-amber-500' },
  LOW: { label: 'Low', color: 'text-slate-450', dot: 'bg-slate-500' },
};

const columnBorders: Record<Status, string> = {
  TODO: 'border-slate-700',
  IN_PROGRESS: 'border-blue-500',
  REVIEW: 'border-purple-500',
  COMPLETED: 'border-emerald-500',
};

const columnTitles: Record<Status, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  REVIEW: 'In Review',
  COMPLETED: 'Done',
};

const avatarColors = ['bg-blue-600', 'bg-purple-600', 'bg-emerald-600', 'bg-amber-600', 'bg-red-600'];
const getAvatarColor = (text: string) => avatarColors[text.charCodeAt(0) % avatarColors.length];

interface TaskBoardProps {
  defaultView?: 'PROJECT_KANBAN' | 'MY_TASKS';
}

export default function TaskBoard({ defaultView }: TaskBoardProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Database / Project scoping
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => searchParams.get('project') || '');
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<any | null>(null);

  // Kanban columns state (All 4 columns)
  const [columns, setColumns] = useState<Column[]>([
    { id: 'TODO', title: 'To Do', color: columnBorders.TODO, tasks: [] },
    { id: 'IN_PROGRESS', title: 'In Progress', color: columnBorders.IN_PROGRESS, tasks: [] },
    { id: 'REVIEW', title: 'In Review', color: columnBorders.REVIEW, tasks: [] },
    { id: 'COMPLETED', title: 'Done', color: columnBorders.COMPLETED, tasks: [] },
  ]);

  // Dual View Mode: Global assigned tasks vs Project Kanban board
  const isMyTasksRoute = location.pathname === '/my-tasks' || defaultView === 'MY_TASKS' || searchParams.get('view') === 'my-tasks';
  const [viewMode, setViewMode] = useState<'PROJECT_KANBAN' | 'MY_TASKS'>(() => isMyTasksRoute ? 'MY_TASKS' : 'PROJECT_KANBAN');
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [myTasksLoading, setMyTasksLoading] = useState(false);
  const [myTasksStatusFilter, setMyTasksStatusFilter] = useState<string>('ALL');
  const { activeProjectId, switchProject } = useProjectStore();

  useEffect(() => {
    if (location.pathname === '/my-tasks' || defaultView === 'MY_TASKS' || searchParams.get('view') === 'my-tasks') {
      setViewMode('MY_TASKS');
    } else if (location.pathname === '/tasks') {
      setViewMode('PROJECT_KANBAN');
    }
  }, [location.pathname, defaultView, searchParams]);

  // Milestone lookup map
  const milestoneMap = useMemo(() => {
    const map = new Map<string, string>();
    if (selectedProjectDetails?.milestones) {
      selectedProjectDetails.milestones.forEach((m: any) => {
        map.set(m.id, m.title);
      });
    }
    return map;
  }, [selectedProjectDetails]);

  // Loading and alerts
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Search/Filters
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  // Task Details Modal
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [subtaskInput, setSubtaskInput] = useState('');

  // Create Task Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPriority, setCreatePriority] = useState<Priority>('LOW');
  const [createStatus, setCreateStatus] = useState<Status>('TODO');
  const [createAssigneeId, setCreateAssigneeId] = useState('');
  const [createMilestoneId, setCreateMilestoneId] = useState('');
  const [createDueDate, setCreateDueDate] = useState('');

  // Load user's assigned tasks across all projects
  const loadMyTasks = async () => {
    try {
      setMyTasksLoading(true);
      const res = await api.get('/tasks/my-tasks');
      setMyTasks(res.data.tasks || []);
    } catch (err) {
      console.error('Failed to load my tasks', err);
    } finally {
      setMyTasksLoading(false);
    }
  };

  const handleMyTaskStatusChange = async (taskId: string, newStatus: Status) => {
    try {
      setActionLoading(true);
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      setMyTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      showToast(`Task status updated to ${newStatus}`);
      if (selectedProjectId) {
        await loadProjectTasks(selectedProjectId);
      }
    } catch (err) {
      console.error('Failed to update task status', err);
      showToast('Failed to update task status', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Load user's projects first
  const loadProjects = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/teams/my-teams');
      const teams = res.data.teams || [];
      const allProjects: any[] = [];
      teams.forEach((t: any) => {
        if (t.projects) {
          t.projects.forEach((p: any) => {
            allProjects.push({ ...p, teamMembers: t.members });
          });
        }
      });

      setProjects(allProjects);
      const urlProjectId = searchParams.get('project');
      const storeProjectId = activeProjectId;
      const targetId = (urlProjectId && allProjects.some((p) => p.id === urlProjectId))
        ? urlProjectId
        : (storeProjectId && allProjects.some((p) => p.id === storeProjectId))
        ? storeProjectId
        : allProjects[0]?.id;

      if (targetId) {
        setSelectedProjectId(targetId);
        switchProject(targetId);
        if (urlProjectId !== targetId) {
          setSearchParams({ project: targetId }, { replace: true });
        }
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch project listings.');
      setLoading(false);
    }
  };

  // Load project's tasks and build board
  const loadProjectTasks = async (projectId: string) => {
    if (!projectId) return;
    try {
      setLoading(true);
      const res = await api.get(`/projects/${projectId}`);
      const project = res.data.project;
      setSelectedProjectDetails(project);

      // Distribute tasks to columns
      const dbTasks: Task[] = project.tasks || [];
      
      const newCols = columns.map(col => {
        const filtered = dbTasks.filter(t => t.status === col.id);
        return {
          ...col,
          tasks: filtered
        };
      });

      setColumns(newCols);
    } catch (err) {
      console.error(err);
      setError('Failed to load project task board details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    loadMyTasks();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectTasks(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Handle local drag drop and call API to sync status
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Local shift for fluid UI transition
    const sourceColIndex = columns.findIndex(c => c.id === source.droppableId);
    const destColIndex = columns.findIndex(c => c.id === destination.droppableId);

    const sourceCol = columns[sourceColIndex];
    const destCol = columns[destColIndex];

    const sourceTasks = [...sourceCol.tasks];
    const destTasks = source.droppableId === destination.droppableId ? sourceTasks : [...destCol.tasks];

    const [removed] = sourceTasks.splice(source.index, 1);
    
    // Update the task status to destination column id
    const updatedTask = { ...removed, status: destination.droppableId as Status };
    
    destTasks.splice(destination.index, 0, updatedTask);

    const newColumns = [...columns];
    newColumns[sourceColIndex] = { ...sourceCol, tasks: sourceTasks };
    newColumns[destColIndex] = { ...destCol, tasks: destTasks };
    setColumns(newColumns);

    // Persist to backend database
    try {
      await api.put(`/tasks/${draggableId}`, { status: destination.droppableId as Status });
    } catch (err) {
      console.error('Failed to update task status in database', err);
      // Revert in case of failure
      if (selectedProjectId) {
        loadProjectTasks(selectedProjectId);
      }
    }
  };

  // Add Task handler
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim() || !selectedProjectId) return;

    try {
      setActionLoading(true);
      await api.post('/tasks/create', {
        title: createTitle,
        description: createDesc,
        status: createStatus,
        priority: createPriority,
        projectId: selectedProjectId,
        assigneeId: createAssigneeId || null,
        milestoneId: createMilestoneId || null,
        dueDate: createDueDate || null
      });

      setShowCreateModal(false);
      setCreateTitle('');
      setCreateDesc('');
      setCreatePriority('LOW');
      setCreateAssigneeId('');
      setCreateMilestoneId('');
      setCreateDueDate('');

      // Find assignee name to mention in the toast
      const assignedUser = projectMembers.find((m: any) => m.user.id === createAssigneeId);
      if (assignedUser) {
        showToast(`✅ Task "${createTitle}" created and assigned to ${assignedUser.user.name}!`);
      } else {
        showToast(`✅ Task "${createTitle}" created successfully!`);
      }

      // Refresh task board
      await loadProjectTasks(selectedProjectId);
    } catch (err) {
      console.error(err);
      showToast('Failed to create project task.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Task handler
  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    // Immediate optimistic removal
    setColumns(prev => prev.map(col => ({
      ...col,
      tasks: col.tasks.filter(t => t.id !== taskId)
    })));
    setActiveTask(null);
    try {
      setActionLoading(true);
      await api.delete(`/tasks/${taskId}`);
      showToast('Task deleted successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to delete task.');
    } finally {
      setActionLoading(false);
      if (selectedProjectId) loadProjectTasks(selectedProjectId);
    }
  };

  // Subtask management
  const handleCreateSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask || !subtaskInput.trim()) return;

    try {
      setActionLoading(true);
      const res = await api.post('/tasks/subtask', {
        taskId: activeTask.id,
        title: subtaskInput.trim()
      });

      const newSubtask = res.data.subtask;
      const updatedSubtasks = [...(activeTask.oldSubtasks || []), newSubtask];

      const updatedTask = { ...activeTask, oldSubtasks: updatedSubtasks };
      setActiveTask(updatedTask);
      setSubtaskInput('');

      // Refresh project tasks to update board progress
      await loadProjectTasks(selectedProjectId);
    } catch (err) {
      console.error(err);
      alert('Failed to add subtask checklist item.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: string, currentCompleted: boolean) => {
    if (!activeTask) return;
    try {
      setActionLoading(true);
      const res = await api.put(`/tasks/subtask/${subtaskId}`, {
        isCompleted: !currentCompleted
      });

      const updated = res.data.subtask;
      const updatedSubtasks = activeTask.oldSubtasks.map(s => s.id === subtaskId ? updated : s);

      const updatedTask = { ...activeTask, oldSubtasks: updatedSubtasks };
      setActiveTask(updatedTask);

      await loadProjectTasks(selectedProjectId);
    } catch (err) {
      console.error(err);
      alert('Failed to check off subtask.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    if (!activeTask) return;
    try {
      setActionLoading(true);
      await api.delete(`/tasks/subtask/${subtaskId}`);
      const updatedSubtasks = activeTask.oldSubtasks.filter(s => s.id !== subtaskId);
      const updatedTask = { ...activeTask, oldSubtasks: updatedSubtasks };
      setActiveTask(updatedTask);
      showToast('Subtask deleted');
      await loadProjectTasks(selectedProjectId);
    } catch (err) {
      console.error(err);
      showToast('Failed to delete subtask item.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateActiveTaskField = async (field: keyof Task | 'assigneeId', value: any) => {
    if (!activeTask) return;
    const previousTask = { ...activeTask };
    let updatedTask = { ...activeTask, [field]: value };
    if (field === 'assigneeId') {
      const assignedMember = projectMembers.find((m: any) => m.user.id === value);
      updatedTask = {
        ...updatedTask,
        assigneeId: value || null,
        assignee: assignedMember ? { id: assignedMember.user.id, name: assignedMember.user.name, email: assignedMember.user.email } : null
      };
    }
    setActiveTask(updatedTask);

    try {
      await api.put(`/tasks/${activeTask.id}`, { [field]: value });
      showToast('Task updated');
      if (selectedProjectId) {
        await loadProjectTasks(selectedProjectId);
      }
    } catch (err) {
      console.error(err);
      setActiveTask(previousTask);
      showToast('Failed to update task', 'error');
    }
  };

  // Comments management
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask || !commentInput.trim()) return;

    try {
      setActionLoading(true);
      const res = await api.post('/tasks/comment', {
        taskId: activeTask.id,
        content: commentInput.trim()
      });

      const newComment = res.data.comment;
      const updatedComments = [...(activeTask.comments || []), newComment];

      const updatedTask = { ...activeTask, comments: updatedComments };
      setActiveTask(updatedTask);
      setCommentInput('');

      await loadProjectTasks(selectedProjectId);
    } catch (err) {
      console.error(err);
      alert('Failed to publish comment.');
    } finally {
      setActionLoading(false);
    }
  };

  // Filter tasks in columns based on search and filters
  const filteredColumns = useMemo(() => {
    return columns.map(col => {
      const filtered = col.tasks.filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) ||
          (t.description || '').toLowerCase().includes(search.toLowerCase());
        const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
        return matchesSearch && matchesPriority;
      });
      return {
        ...col,
        tasks: filtered
      };
    });
  }, [columns, search, priorityFilter]);

  // Project team members list
  const projectMembers = selectedProjectDetails?.team?.members || [];

  // Current user and their role on this project (for status-change permission)
  const currentUserId = useAuthStore((s) => s.user?.id);
  const currentUserRole = projectMembers.find((m: any) => m.user.id === currentUserId)?.role;
  const canUserChangeStatus = (task: Task) =>
    task.assigneeId === currentUserId || currentUserRole === 'ADMIN' || currentUserRole === 'OWNER';

  const filteredMyTasks = useMemo(() => {
    return myTasks.filter((t: any) => {
      const matchesSearch =
        (t.title || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.project?.title || '').toLowerCase().includes(search.toLowerCase());
      const matchesPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;
      const matchesStatus = myTasksStatusFilter === 'ALL' || t.status === myTasksStatusFilter;
      return matchesSearch && matchesPriority && matchesStatus;
    });
  }, [myTasks, search, priorityFilter, myTasksStatusFilter]);

  return (
    <div className="space-y-8">
      {/* Global Toast Notification */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border animate-fade-in text-sm font-semibold transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
              : 'bg-red-950/90 border-red-500/30 text-red-300'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-slate-400 text-sm mb-1 flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5" /> Workspace Taskboard
          </p>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Tasks</h1>
          <p className="text-slate-500 text-sm mt-1">Manage, allocate, and cycle project tasks inside drag-and-drop columns.</p>
        </div>

        {/* Project Selector dropdown */}
        <div className="flex flex-wrap gap-2 items-center">
          {projects.length > 0 && (
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setSearchParams({ project: e.target.value });
              }}
              className="px-3.5 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl focus:border-primary/50 outline-none text-xs text-white transition-all cursor-pointer font-semibold min-w-[140px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-950">{p.title}</option>
              ))}
            </select>
          )}

          {selectedProjectId && (
            <button
              onClick={() => {
                setCreateStatus('TODO');
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Task
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="p-1 hover:text-white">✕</button>
        </div>
      )}

      {loading ? (
        <div className="glass-panel rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm text-slate-400">Loading task workspaces...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-panel rounded-2xl p-16 text-center">
          <ShieldAlert className="w-16 h-16 text-slate-700 mx-auto mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-white mb-1 font-sans">No Project Workspaces Found</h3>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
            You haven't created any projects yet. Create a project first, then assign tasks here.
          </p>
          <Link
            to="/projects"
            className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-xl transition-all inline-flex items-center justify-center"
          >
            Create Project Workspace
          </Link>
        </div>
      ) : (
        <>
          {/* Dual Context Toggle Bar */}
          <div className="flex items-center p-1 rounded-2xl bg-secondary/50 border border-border w-fit shadow-sm mb-2">
            <button
              onClick={() => setViewMode('PROJECT_KANBAN')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'PROJECT_KANBAN'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" /> Project Board {selectedProjectDetails ? `(${selectedProjectDetails.title})` : ''}
            </button>
            <button
              onClick={() => {
                setViewMode('MY_TASKS');
                loadMyTasks();
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'MY_TASKS'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <User className="w-3.5 h-3.5" /> All My Assigned Tasks ({myTasks.length})
            </button>
          </div>

          {viewMode === 'MY_TASKS' ? (
            /* Global My Assigned Tasks View */
            <div className="space-y-4">
              {/* Filters for My Tasks */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search assigned tasks by title, description or project..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 mr-1.5 flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5" /> Status:
                  </span>
                  {['ALL', 'TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED'].map((st) => (
                    <button
                      key={st}
                      onClick={() => setMyTasksStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        myTasksStatusFilter === st
                          ? 'bg-slate-800 border-slate-700 text-white'
                          : 'bg-slate-900/30 border-slate-900 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {st === 'ALL' ? 'All' : st === 'IN_PROGRESS' ? 'In Progress' : st.charAt(0) + st.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 mr-1.5">Priority:</span>
                  {['ALL', 'LOW', 'MEDIUM', 'HIGH'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriorityFilter(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        priorityFilter === p
                          ? 'bg-slate-800 border-slate-700 text-white'
                          : 'bg-slate-900/30 border-slate-900 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {p === 'ALL' ? 'All' : p.charAt(0) + p.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tasks List */}
              {myTasksLoading ? (
                <div className="glass-panel rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs text-slate-400">Loading your assigned tasks...</p>
                </div>
              ) : filteredMyTasks.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center">
                  <CheckSquare className="w-12 h-12 text-emerald-500/40 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-white mb-1">No Assigned Tasks Match</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    No tasks assigned to your account match the current filters. Switch back to the Project Board to create and claim tasks.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredMyTasks.map((t: any) => {
                    const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED';
                    const prio = priorityConfig[t.priority as Priority] || priorityConfig.LOW;

                    return (
                      <div
                        key={t.id}
                        className="glass-card rounded-2xl p-4 border border-border hover:border-primary/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                      >
                        <div
                          className="flex items-start gap-3.5 flex-1 min-w-0 cursor-pointer"
                          onClick={() => setActiveTask(t)}
                        >
                          <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${prio.dot}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                {t.title}
                              </h4>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (t.projectId) {
                                    switchProject(t.projectId);
                                    setSelectedProjectId(t.projectId);
                                    setSearchParams({ project: t.projectId });
                                    setViewMode('PROJECT_KANBAN');
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-secondary text-primary hover:bg-primary/20 text-[10px] font-bold cursor-pointer transition-colors"
                              >
                                <FolderOpen className="w-3 h-3" /> {t.project?.title || 'Project'} →
                              </span>
                              {t.milestone && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Target className="w-3 h-3 text-secondary-foreground" /> {t.milestone.title}
                                </span>
                              )}
                            </div>
                            {t.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{t.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0 justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border/50">
                          {t.dueDate && (
                            <span className={`text-xs font-semibold flex items-center gap-1 ${isOverdue ? 'text-red-400 font-bold' : 'text-muted-foreground'}`}>
                              <Clock className="w-3.5 h-3.5" />
                              {new Date(t.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                          )}

                          <select
                            value={t.status}
                            onChange={(e) => handleMyTaskStatusChange(t.id, e.target.value as Status)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-xl border focus:outline-none cursor-pointer ${
                              t.status === 'COMPLETED' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
                              t.status === 'IN_PROGRESS' ? 'bg-blue-500/15 border-blue-500/30 text-blue-400' :
                              t.status === 'REVIEW' ? 'bg-purple-500/15 border-purple-500/30 text-purple-400' :
                              'bg-slate-800 border-slate-700 text-slate-300'
                            }`}
                          >
                            <option value="TODO" className="bg-slate-900 text-slate-200">To Do</option>
                            <option value="IN_PROGRESS" className="bg-slate-900 text-blue-300">In Progress</option>
                            <option value="REVIEW" className="bg-slate-900 text-purple-300">In Review</option>
                            <option value="COMPLETED" className="bg-slate-900 text-emerald-300">Done</option>
                          </select>

                          <button
                            onClick={() => setActiveTask(t)}
                            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                            title="View Details"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Kanban Board Mode */
            <>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter tasks by title or assignee..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 mr-1.5 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Filter Priority:
              </span>
              {['ALL', 'LOW', 'MEDIUM', 'HIGH'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    priorityFilter === p
                      ? 'bg-slate-800 border-slate-750 text-white'
                      : 'bg-slate-900/30 border-slate-900 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {p === 'ALL' ? 'All' : p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            <div className="ml-auto text-xs text-slate-550 font-mono">
              {columns.reduce((acc, c) => acc + c.tasks.length, 0)} Tasks Tracked
            </div>
          </div>

          {/* Kanban drag context */}
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-5 overflow-x-auto pb-6" style={{ minHeight: '520px', scrollbarWidth: 'thin' }}>
              {filteredColumns.map((column) => (
                <div key={column.id} className="flex flex-col flex-shrink-0 w-[82vw] sm:w-64 md:w-68 lg:w-72 xl:w-auto xl:flex-1 min-w-[240px] max-w-[360px]">
                  {/* Column Header */}
                  <div className={`flex items-center justify-between mb-4 pb-3 border-b-2 ${column.color}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white tracking-tight">{column.title}</span>
                      <span className="px-2 py-0.5 bg-slate-800 border border-slate-700/50 text-slate-400 text-xs rounded-full font-bold">
                        {column.tasks.length}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setCreateStatus(column.id);
                        setShowCreateModal(true);
                      }}
                      className="p-2 rounded hover:bg-slate-900 text-slate-500 hover:text-white transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Droppable Column container */}
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 flex flex-col gap-3.5 min-h-[440px] p-2 rounded-xl transition-all ${
                          snapshot.isDraggingOver ? 'bg-primary/5 border border-dashed border-primary/25' : ''
                        }`}
                      >
                        {column.tasks.map((task, index) => {
                          const priority = priorityConfig[task.priority] || priorityConfig.LOW;
                          const doneSub = task.oldSubtasks.filter(s => s.isCompleted).length;
                          const totalSub = task.oldSubtasks.length;
                          const canChangeStatus = canUserChangeStatus(task);
                          const milestoneTitle = task.milestoneId ? milestoneMap.get(task.milestoneId) : null;
                          const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';

                          return (
                            <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!canChangeStatus}>
                              {(dragProv, dragSnap) => (
                                <div
                                  ref={dragProv.innerRef}
                                  {...dragProv.draggableProps}
                                  {...dragProv.dragHandleProps}
                                  onClick={() => setActiveTask(task)}
                                  title={canChangeStatus ? undefined : 'Only the assignee or project admins can change this task\'s status'}
                                  className={`glass-card rounded-xl p-4 transition-all ${
                                    canChangeStatus ? 'cursor-grab active:cursor-grabbing hover:border-slate-700' : 'cursor-default opacity-80'
                                  } ${
                                    dragSnap.isDragging ? 'shadow-2xl shadow-primary/20 scale-[1.02] rotate-1 border-primary/45 bg-slate-900' : ''
                                  }`}
                                >
                                  {/* Priority indicator & badges */}
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-1.5">
                                      <div className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                                      <span className={`text-[10px] font-bold uppercase tracking-wider ${priority.color}`}>
                                        {priority.label}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {isOverdue && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-bold rounded">
                                          <AlertCircle className="w-2.5 h-2.5" /> Overdue
                                        </span>
                                      )}
                                      {task.githubVerified && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-[10px] font-bold rounded">
                                          <CheckCircle className="w-2.5 h-2.5" /> GitHub
                                        </span>
                                      )}
                                      <button className="p-1 rounded text-slate-655 hover:text-white">
                                        <MoreVertical className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Milestone badge */}
                                  {milestoneTitle && (
                                    <div className="mb-2">
                                      <span className="inline-flex items-center gap-1 text-[10px] text-primary/90 font-medium px-2 py-0.5 rounded bg-primary/10 border border-primary/20 truncate max-w-full">
                                        <Target className="w-2.5 h-2.5 flex-shrink-0" />
                                        <span className="truncate">{milestoneTitle}</span>
                                      </span>
                                    </div>
                                  )}

                                  {/* Title */}
                                  <p className="text-xs font-bold text-white mb-2 leading-relaxed truncate">{task.title}</p>
                                  {task.description && (
                                    <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed mb-3">{task.description}</p>
                                  )}

                                  {/* Checklist progress */}
                                  {totalSub > 0 && (
                                    <div className="mb-3 space-y-1">
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-slate-600 font-medium">Subtasks progress</span>
                                        <span className="text-slate-400 font-bold">{doneSub}/{totalSub}</span>
                                      </div>
                                      <div className="w-full bg-slate-950 rounded-full h-1">
                                        <div
                                          className="h-1 rounded-full bg-primary transition-all duration-300"
                                          style={{ width: `${(doneSub / totalSub) * 100}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Task Footer */}
                                  <div className="flex items-center justify-between pt-2 border-t border-slate-900/50 mt-1">
                                    <div className="flex items-center gap-1">
                                      {task.assignee ? (
                                        <div
                                          title={task.assignee.name}
                                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${getAvatarColor(task.assignee.name)}`}
                                        >
                                          {task.assignee.name.charAt(0).toUpperCase()}
                                        </div>
                                      ) : (
                                        <div title="Unassigned" className="w-5 h-5 rounded-full border border-dashed border-slate-800 flex items-center justify-center text-slate-600">
                                          <User className="w-2.5 h-2.5" />
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2.5 text-[10px] text-slate-550">
                                      {task.dueDate && (
                                        <span className={`flex items-center gap-1 ${isOverdue ? 'text-rose-400 font-semibold' : ''}`}>
                                          <Clock className="w-2.5 h-2.5" />
                                          {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                      {task.comments.length > 0 && (
                                        <span className="flex items-center gap-1">
                                          <MessageSquare className="w-2.5 h-2.5" />
                                          {task.comments.length}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
            </>
          )}
        </>
      )}

      {/* CREATE TASK MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-md border-slate-700 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Create Task Card</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1.5 font-semibold">Task Title</label>
                <input
                  type="text"
                  placeholder="e.g. Implement refresh tokens flow"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white focus:border-primary/50 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1.5 font-semibold">Description</label>
                <textarea
                  placeholder="Describe the task completion parameters..."
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white focus:border-primary/50 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">Priority</label>
                  <select
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.target.value as Priority)}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl focus:border-primary/50 outline-none text-white cursor-pointer"
                  >
                    <option value="LOW" className="bg-slate-950">Low Priority</option>
                    <option value="MEDIUM" className="bg-slate-950">Medium Priority</option>
                    <option value="HIGH" className="bg-slate-950">High Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">Stage Column</label>
                  <select
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as Status)}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl focus:border-primary/50 outline-none text-white cursor-pointer"
                  >
                    <option value="TODO" className="bg-slate-950">To Do</option>
                    <option value="IN_PROGRESS" className="bg-slate-950">In Progress</option>
                    <option value="REVIEW" className="bg-slate-950">In Review</option>
                    <option value="COMPLETED" className="bg-slate-950">Completed</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">Assignee</label>
                  <select
                    value={createAssigneeId}
                    onChange={(e) => setCreateAssigneeId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl focus:border-primary/50 outline-none text-white cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {projectMembers.map((m: any) => (
                      <option key={m.user.id} value={m.user.id} className="bg-slate-950">{m.user.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1.5 font-semibold">Due Date</label>
                  <input
                    type="date"
                    value={createDueDate}
                    onChange={(e) => setCreateDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl focus:border-primary/50 outline-none text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-900 mt-5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2 border border-slate-750 text-slate-400 font-bold rounded-xl hover:bg-slate-850"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TASK DETAILS & COLLABORATIVE MODAL */}
      {activeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-3xl border-slate-700 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5 border-b border-slate-900 pb-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-primary" />
                <span className="text-slate-500 text-xs font-mono font-bold">TASK WORKSPACE / {activeTask.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDeleteTask(activeTask.id)}
                  className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-all"
                  title="Delete Task"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setActiveTask(null)} className="p-2 rounded-xl hover:bg-slate-850 text-slate-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
              {/* Left pane: core title, checklist & comments */}
              <div className="md:col-span-8 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{activeTask.title}</h3>
                  <p className="text-xs text-slate-450 leading-relaxed mt-2">{activeTask.description || 'No description provided.'}</p>
                </div>

                {/* Subtask checklist */}
                <div className="space-y-3.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Subtask Checklist</h4>
                  
                  <form onSubmit={handleCreateSubtask} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add subtask check item..."
                      value={subtaskInput}
                      onChange={(e) => setSubtaskInput(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white focus:border-primary/50 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !subtaskInput.trim()}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-slate-750 cursor-pointer"
                    >
                      Add
                    </button>
                  </form>

                  <div className="space-y-2">
                    {activeTask.oldSubtasks && activeTask.oldSubtasks.length > 0 ? (
                      activeTask.oldSubtasks.map((sub) => (
                        <div
                          key={sub.id}
                          onClick={() => handleToggleSubtask(sub.id, sub.isCompleted)}
                          className="group flex items-center justify-between p-3 bg-slate-950/20 border border-slate-900 rounded-xl hover:border-slate-800 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={sub.isCompleted}
                              onChange={() => {}}
                              className="rounded border-slate-800 bg-slate-950 text-primary cursor-pointer focus:ring-0 focus:ring-offset-0"
                            />
                            <span className={`text-xs truncate ${sub.isCompleted ? 'text-slate-550 line-through' : 'text-slate-300'}`}>
                              {sub.title}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSubtask(sub.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-slate-500 p-1 transition-opacity ml-2"
                            title="Delete subtask"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-600">No checklists item allocated yet.</p>
                    )}
                  </div>
                </div>

                {/* Collaborative comments stream */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Comments Feed</h4>
                  
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Write comment notes..."
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      className="flex-1 px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-655 focus:border-primary/50 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !commentInput.trim()}
                      className="p-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl flex items-center justify-center cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>

                  <div className="space-y-3.5 max-h-48 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                    {activeTask.comments && activeTask.comments.length > 0 ? (
                      activeTask.comments.map((comm) => (
                        <div key={comm.id} className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl text-xs space-y-1 hover:border-slate-850 transition-all">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-slate-400">{comm.user.name}</span>
                            <span className="text-slate-600 font-mono">{new Date(comm.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-slate-300 leading-relaxed">{comm.content}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-600">No comments published on task.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right pane: interactive metadata controls */}
              <div className="md:col-span-4 space-y-5">
                <div className="glass-card rounded-2xl p-4 border border-slate-900 space-y-4 text-xs">
                  <div>
                    <label className="text-slate-500 block mb-1.5 font-semibold">Stage Status</label>
                    <select
                      value={activeTask.status}
                      onChange={(e) => handleUpdateActiveTaskField('status', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white focus:border-primary/50 outline-none cursor-pointer"
                    >
                      <option value="TODO">{columnTitles.TODO}</option>
                      <option value="IN_PROGRESS">{columnTitles.IN_PROGRESS}</option>
                      <option value="REVIEW">{columnTitles.REVIEW}</option>
                      <option value="COMPLETED">{columnTitles.COMPLETED}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1.5 font-semibold">Priority Level</label>
                    <select
                      value={activeTask.priority}
                      onChange={(e) => handleUpdateActiveTaskField('priority', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-white focus:border-primary/50 outline-none cursor-pointer"
                    >
                      <option value="LOW">Low Priority</option>
                      <option value="MEDIUM">Medium Priority</option>
                      <option value="HIGH">High Priority</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1.5 font-semibold">Task Due Date</label>
                    <input
                      type="date"
                      value={activeTask.dueDate ? activeTask.dueDate.split('T')[0] : ''}
                      onChange={(e) => handleUpdateActiveTaskField('dueDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:border-primary/50 outline-none cursor-pointer font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-500 block mb-1.5 font-semibold">Assignee Allocation</label>
                    <select
                      value={activeTask.assigneeId || ''}
                      onChange={(e) => handleUpdateActiveTaskField('assigneeId', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:border-primary/50 outline-none cursor-pointer"
                    >
                      <option value="">Unassigned</option>
                      {projectMembers.map((m: any) => (
                        <option key={m.user.id} value={m.user.id}>
                          {m.user.name} ({m.role})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
