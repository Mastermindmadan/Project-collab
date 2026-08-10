import { Filter, X } from 'lucide-react';

export interface FilterState {
  status: string;
  priority: string;
  assigneeId: string;
  projectId: string;
  dueDateFrom: string;
  dueDateTo: string;
}

interface FiltersProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  projects?: Array<{ id: string; title: string }>;
  members?: Array<{ id: string; name: string }>;
  showStatus?: boolean;
  showPriority?: boolean;
  showAssignee?: boolean;
  showProject?: boolean;
  showDueDate?: boolean;
  statusOptions?: string[];
}

const DEFAULT_STATUS = ['TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED'];

export default function Filters({
  filters, onChange, projects = [], members = [],
  showStatus = true, showPriority = true, showAssignee = false,
  showProject = false, showDueDate = true,
  statusOptions = DEFAULT_STATUS,
}: FiltersProps) {
  const set = (key: keyof FilterState, val: string) => onChange({ ...filters, [key]: val });
  const reset = () => onChange({ status: '', priority: '', assigneeId: '', projectId: '', dueDateFrom: '', dueDateTo: '' });

  const hasActive = Object.values(filters).some(v => v !== '');

  const selectCls = 'glass-input text-sm text-foreground py-1.5 rounded-xl cursor-pointer outline-none';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
        <Filter className="w-3.5 h-3.5" />
        Filter:
      </div>

      {showStatus && (
        <select value={filters.status} onChange={e => set('status', e.target.value)} className={selectCls}>
          <option value="">All Status</option>
          {statusOptions.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      )}

      {showPriority && (
        <select value={filters.priority} onChange={e => set('priority', e.target.value)} className={selectCls}>
          <option value="">All Priority</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      )}

      {showAssignee && members.length > 0 && (
        <select value={filters.assigneeId} onChange={e => set('assigneeId', e.target.value)} className={selectCls}>
          <option value="">All Assignees</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}

      {showProject && projects.length > 0 && (
        <select value={filters.projectId} onChange={e => set('projectId', e.target.value)} className={selectCls}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      )}

      {showDueDate && (
        <>
          <input type="date" value={filters.dueDateFrom} onChange={e => set('dueDateFrom', e.target.value)}
            className={`${selectCls} px-2`} title="Due from" />
          <span className="text-xs text-muted-foreground">–</span>
          <input type="date" value={filters.dueDateTo} onChange={e => set('dueDateTo', e.target.value)}
            className={`${selectCls} px-2`} title="Due until" />
        </>
      )}

      {hasActive && (
        <button onClick={reset} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-colors">
          <X className="w-3 h-3" /> Clear
        </button>
      )}
    </div>
  );
}
