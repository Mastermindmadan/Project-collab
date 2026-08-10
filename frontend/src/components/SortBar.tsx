import { ArrowUpDown } from 'lucide-react';

export type SortKey = 'newest' | 'oldest' | 'priority' | 'deadline' | 'alphabetical' | 'updated';

interface SortBarProps {
  value: SortKey;
  onChange: (v: SortKey) => void;
  options?: SortKey[];
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'priority', label: 'Priority' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'alphabetical', label: 'A → Z' },
  { value: 'updated', label: 'Recently Updated' },
];

export function applySort<T extends Record<string, any>>(items: T[], sort: SortKey): T[] {
  return [...items].sort((a, b) => {
    switch (sort) {
      case 'newest': return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case 'oldest': return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      case 'updated': return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
      case 'deadline': return new Date(a.dueDate || a.dateTime || '9999').getTime() - new Date(b.dueDate || b.dateTime || '9999').getTime();
      case 'priority': {
        const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
      }
      case 'alphabetical': return (a.title || a.name || '').localeCompare(b.title || b.name || '');
      default: return 0;
    }
  });
}

export default function SortBar({ value, onChange, options }: SortBarProps) {
  const available = options
    ? SORT_OPTIONS.filter(o => options.includes(o.value))
    : SORT_OPTIONS;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
        <ArrowUpDown className="w-3.5 h-3.5" />
        Sort:
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value as SortKey)}
        className="glass-input text-sm text-foreground py-1.5 rounded-xl cursor-pointer outline-none"
      >
        {available.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
