import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, FolderOpen, Users, CheckSquare, FileText, Calendar, Loader2, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import { useNavigate } from 'react-router-dom';

interface SearchResults {
  users: any[];
  projects: any[];
  teams: any[];
  tasks: any[];
  documents: any[];
  meetings: any[];
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

const categoryConfig = [
  { key: 'projects', label: 'Projects', icon: FolderOpen, color: 'text-blue-500', path: (r: any) => `/projects/${r.id}` },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare, color: 'text-amber-500', path: () => '/tasks' },
  { key: 'teams', label: 'Teams', icon: Users, color: 'text-purple-500', path: () => '/teams' },
  { key: 'documents', label: 'Documents', icon: FileText, color: 'text-emerald-500', path: (r: any) => `/projects/${r.project?.id}` },
  { key: 'meetings', label: 'Meetings', icon: Calendar, color: 'text-rose-500', path: () => '/meetings' },
  { key: 'users', label: 'People', icon: Users, color: 'text-cyan-500', path: () => `/profile` },
];

export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ users: [], projects: [], teams: [], tasks: [], documents: [], meetings: [] });
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults({ users: [], projects: [], teams: [], tasks: [], documents: [], meetings: [] });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults({ users: [], projects: [], teams: [], tasks: [], documents: [], meetings: [] });
      setTotalCount(0);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/search?q=${encodeURIComponent(q)}`);
      setResults(res.data.results);
      setTotalCount(res.data.totalCount);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  const hasResults = totalCount > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Search Panel */}
      <div className="relative w-full max-w-2xl glass-panel rounded-2xl shadow-2xl border border-border overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <Search className="w-5 h-5 text-primary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            placeholder="Search projects, tasks, teams, documents, people..."
            className="flex-1 bg-transparent text-foreground text-base outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 && (
            <div className="px-4 py-8 text-center">
              <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Type at least 2 characters to search</p>
              <p className="text-xs text-muted-foreground mt-1">Searches projects, tasks, teams, documents & more</p>
            </div>
          )}

          {query.length >= 2 && !loading && !hasResults && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No results found for <strong className="text-foreground">"{query}"</strong></p>
            </div>
          )}

          {hasResults && (
            <div className="p-3 space-y-4">
              {categoryConfig.map(cat => {
                const items = results[cat.key as keyof SearchResults];
                if (!items || items.length === 0) return null;
                return (
                  <div key={cat.key}>
                    <div className="flex items-center gap-2 px-2 mb-1">
                      <cat.icon className={`w-3.5 h-3.5 ${cat.color}`} />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{cat.label}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map((item: any) => (
                        <button
                          key={item.id}
                          onClick={() => handleNavigate(cat.path(item))}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-1.5 rounded-lg bg-secondary ${cat.color}`}>
                              <cat.icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {item.title || item.name || `${item.name}`}
                              </p>
                              {item.description && (
                                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                              )}
                              {item.project?.title && (
                                <p className="text-xs text-muted-foreground">in {item.project.title}</p>
                              )}
                              {item.email && (
                                <p className="text-xs text-muted-foreground">{item.email}</p>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>{hasResults ? `${totalCount} results` : 'Start typing to search'}</span>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">↵</kbd>
            <span>to select</span>
            <kbd className="px-1.5 py-0.5 bg-secondary rounded text-xs">Esc</kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
