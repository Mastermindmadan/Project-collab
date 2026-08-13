import { useState, useEffect } from 'react';
import api from '../utils/api';
import { GitCommit, CheckSquare, GitPullRequest, Loader2 } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  createdAt: string;
  metadata?: string;
}

const typeConfig: Record<string, { icon: any; color: string; bg: string }> = {
  COMMIT_PUSHED: { icon: GitCommit, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  TASK_CREATED: { icon: CheckSquare, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  TASK_COMPLETED: { icon: CheckSquare, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  TASK_VERIFIED: { icon: CheckSquare, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  TASK_UPDATED: { icon: CheckSquare, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  PR_OPENED: { icon: GitPullRequest, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  PR_MERGED: { icon: GitPullRequest, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  GITHUB_CONNECTED: { icon: GitCommit, color: 'text-primary', bg: 'bg-primary/10' },
  PROJECT_CREATED: { icon: CheckSquare, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  PROJECT_UPDATED: { icon: CheckSquare, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  COMMENT_ADDED: { icon: CheckSquare, color: 'text-slate-400', bg: 'bg-slate-500/10' },
};

export default function ActivityFeed({ projectId, limit = 20 }: { projectId: string; limit?: number }) {
  const [events, setEvents] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/github/activity/${projectId}`, { params: { limit } });
      setEvents(res.data.events || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading activity...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground text-sm">
        No activity yet. Sync GitHub or complete tasks to see events here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((ev) => {
        const cfg = typeConfig[ev.type] || { icon: CheckSquare, color: 'text-slate-400', bg: 'bg-slate-500/10' };
        const Icon = cfg.icon;
        return (
          <div key={ev.id} className="flex items-start gap-3 p-3 glass-card rounded-xl">
            <div className={`p-2 rounded-lg ${cfg.bg} ${cfg.color} flex-shrink-0`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{ev.title}</p>
              {ev.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                {new Date(ev.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
