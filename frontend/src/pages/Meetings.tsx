import { useState, useEffect } from 'react';
import { Calendar, Plus, Clock, Video, ExternalLink, MoreVertical, Loader2, X, AlertCircle } from 'lucide-react';
import api from '../utils/api';

interface Meeting {
  id: string;
  title: string;
  dateTime: string;
  link: string;
  projectId: string;
  project?: { title: string };
  createdBy: string;
}

const typeConfig = {
  standup: { label: 'Standup', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', dot: 'bg-blue-500' },
  review: { label: 'Code Review', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', dot: 'bg-purple-500' },
  planning: { label: 'Sprint Planning', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-500' },
  demo: { label: 'Project Demo', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-500' },
};

// Guess meeting type from title
function guessType(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes('standup') || lower.includes('daily')) return 'standup';
  if (lower.includes('review') || lower.includes('code')) return 'review';
  if (lower.includes('planning') || lower.includes('sprint') || lower.includes('grooming')) return 'planning';
  if (lower.includes('demo') || lower.includes('presentation')) return 'demo';
  return 'planning';
}

export default function Meetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newLink, setNewLink] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [teamsRes] = await Promise.all([
        api.get('/teams/my-teams'),
      ]);

      const teams = teamsRes.data.teams || [];
      const allProjects: any[] = [];
      const allMeetings: Meeting[] = [];

      teams.forEach((t: any) => {
        if (t.projects) {
          t.projects.forEach((p: any) => {
            allProjects.push(p);
            if (p.meetings) {
              p.meetings.forEach((m: Meeting) => {
                allMeetings.push({ ...m, project: { title: p.title } });
              });
            }
          });
        }
      });

      setProjects(allProjects);
      if (allProjects.length > 0 && !newProjectId) {
        setNewProjectId(allProjects[0].id);
      }

      // Sort meetings by dateTime ascending
      allMeetings.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
      setMeetings(allMeetings);
    } catch (err) {
      console.error('Error loading meetings', err);
      setError('Failed to load meetings data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newDate || !newTime || !newLink || !newProjectId) {
      setError('All fields are required.');
      return;
    }

    try {
      setSaving(true);
      const combinedDateTime = new Date(`${newDate}T${newTime}:00`).toISOString();
      await api.post('/misc/meetings', {
        projectId: newProjectId,
        title: newTitle,
        dateTime: combinedDateTime,
        link: newLink,
      });

      // Reset form and reload
      setNewTitle('');
      setNewDate('');
      setNewTime('');
      setNewLink('');
      setShowNewModal(false);
      await loadData();
    } catch (err: any) {
      console.error('Failed to create meeting', err);
      setError(err.response?.data?.error || 'Failed to schedule meeting.');
    } finally {
      setSaving(false);
    }
  };

  const now = new Date();
  const today = meetings.filter((m) => {
    const d = new Date(m.dateTime);
    return d.toDateString() === now.toDateString();
  });
  const upcoming = meetings.filter((m) => {
    const d = new Date(m.dateTime);
    return d > now && d.toDateString() !== now.toDateString();
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (d.toDateString() === now.toDateString()) return 'Today';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Meeting Scheduler
          </p>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Meetings</h1>
          <p className="text-slate-500 text-sm mt-1">{meetings.length} scheduled · {today.length} today</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" /> Schedule Meeting
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {loading ? (
        <div className="glass-panel rounded-2xl p-16 flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-sm text-slate-400">Loading scheduled meetings...</p>
        </div>
      ) : (
        <>
          {/* Today's Meetings */}
          {today.length > 0 && (
            <div>
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Today
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {today.map((meeting) => {
                  const type = guessType(meeting.title);
                  const config = typeConfig[type];
                  return (
                    <div key={meeting.id} className="glass-panel rounded-2xl p-6 border-l-4 border-l-primary relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 -translate-y-10 translate-x-10" />
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs font-medium mb-2 ${config.bg} ${config.color}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                            {config.label}
                          </div>
                          <h3 className="text-base font-bold text-white">{meeting.title}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">{meeting.project?.title || 'General'}</p>
                        </div>
                        <button className="p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-slate-800 transition-all">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {formatTime(meeting.dateTime)}
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500">
                          Scheduled meeting
                        </div>
                        <a
                          href={meeting.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition-all"
                        >
                          <Video className="w-3.5 h-3.5" /> Join Now
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Upcoming Meetings
              </h2>
              <div className="glass-panel rounded-2xl p-6">
                <div className="space-y-3">
                  {upcoming.map((meeting) => {
                    const type = guessType(meeting.title);
                    const config = typeConfig[type];
                    return (
                      <div key={meeting.id} className="flex items-center gap-4 p-4 glass-card rounded-xl hover:border-slate-600 transition-all group">
                        <div className={`w-1 h-12 rounded-full flex-shrink-0 ${config.dot}`} />
                        <div className="text-center w-14 flex-shrink-0">
                          <p className="text-xs font-bold text-white">{formatDate(meeting.dateTime)}</p>
                          <p className="text-xs text-slate-600">{formatTime(meeting.dateTime)}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{meeting.title}</p>
                          <p className="text-xs text-slate-500">{meeting.project?.title || 'General'}</p>
                        </div>
                        <div className={`px-2 py-0.5 rounded-lg border text-xs ${config.bg} ${config.color}`}>
                          {config.label}
                        </div>
                        <a
                          href={meeting.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl text-slate-600 hover:text-white hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {meetings.length === 0 && (
            <div className="glass-panel rounded-2xl p-16 text-center">
              <Calendar className="w-16 h-16 text-slate-700 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">No Meetings Scheduled</h3>
              <p className="text-slate-500 text-sm mb-6">Schedule your first meeting to coordinate with your team.</p>
              <button
                onClick={() => setShowNewModal(true)}
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all"
              >
                <Plus className="w-4 h-4 inline mr-1.5" /> Schedule First Meeting
              </button>
            </div>
          )}
        </>
      )}

      {/* New Meeting Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 w-full max-w-lg border-slate-700 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Schedule New Meeting</h2>
              <button onClick={() => { setShowNewModal(false); setError(''); }} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Meeting Title</label>
                <input
                  type="text"
                  placeholder="e.g. Sprint Review Session"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white focus:border-primary/50 outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Time</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white focus:border-primary/50 outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Google Meet / Zoom Link</label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/..."
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Project</label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-sm text-white outline-none focus:border-primary/50 transition-all cursor-pointer"
                  required
                >
                  {projects.length === 0 && <option value="">No projects available</option>}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-950">{p.title}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => { setShowNewModal(false); setError(''); }}
                  className="flex-1 py-2.5 border border-slate-700 text-slate-400 text-sm rounded-xl hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Schedule Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
