import { useState, useEffect, useMemo } from 'react';
import { Calendar as CalIcon, ChevronLeft, ChevronRight, CheckSquare, Video, Flag, Clock, Loader2 } from 'lucide-react';
import api from '../utils/api';
import dayjs from 'dayjs';

interface CalEvent {
  id: string;
  type: 'task' | 'meeting' | 'milestone';
  title: string;
  date: string;
  status?: string;
  priority?: string;
  projectTitle?: string;
  link?: string;
}

const TYPE_CONFIG = {
  task: { icon: CheckSquare, color: 'bg-blue-500/15 text-blue-600 border-blue-200', dot: 'bg-blue-500' },
  meeting: { icon: Video, color: 'bg-purple-500/15 text-purple-600 border-purple-200', dot: 'bg-purple-500' },
  milestone: { icon: Flag, color: 'bg-amber-500/15 text-amber-600 border-amber-200', dot: 'bg-amber-500' },
};

export default function Calendar() {
  const [current, setCurrent] = useState(dayjs());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const teamsRes = await api.get('/teams/my-teams');
        const teams = teamsRes.data.teams || [];
        const allEvents: CalEvent[] = [];

        for (const team of teams) {
          for (const proj of (team.projects || [])) {
            try {
              const pRes = await api.get(`/projects/${proj.id}`);
              const p = pRes.data.project;

              // Tasks with due dates
              (p.tasks || []).forEach((t: any) => {
                if (t.dueDate) allEvents.push({
                  id: t.id, type: 'task', title: t.title,
                  date: dayjs(t.dueDate).format('YYYY-MM-DD'),
                  status: t.status, priority: t.priority,
                  projectTitle: p.title,
                });
              });

              // Milestones
              (p.milestones || []).forEach((m: any) => {
                if (m.dueDate) allEvents.push({
                  id: m.id, type: 'milestone', title: m.title,
                  date: dayjs(m.dueDate).format('YYYY-MM-DD'),
                  status: m.status, projectTitle: p.title,
                });
              });

              // Meetings
              (p.meetings || []).forEach((m: any) => {
                allEvents.push({
                  id: m.id, type: 'meeting', title: m.title,
                  date: dayjs(m.dateTime).format('YYYY-MM-DD'),
                  link: m.link, projectTitle: p.title,
                });
              });
            } catch { /* skip failed project */ }
          }
        }

        setEvents(allEvents);
      } catch (e) {
        console.error('Calendar load error', e);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const startOfMonth = current.startOf('month');
  const endOfMonth = current.endOf('month');
  const startGrid = startOfMonth.startOf('week');
  const endGrid = endOfMonth.endOf('week');

  const days: dayjs.Dayjs[] = [];
  let d = startGrid;
  while (d.isBefore(endGrid) || d.isSame(endGrid, 'day')) {
    days.push(d);
    d = d.add(1, 'day');
  }

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  const selectedEvents = selected ? (eventsByDate[selected] || []) : [];
  const today = dayjs().format('YYYY-MM-DD');

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5"><CalIcon className="w-4 h-4 text-primary" /> Calendar View</p>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Project Calendar</h1>
          <p className="text-muted-foreground text-sm mt-1">Tasks, meetings & milestones across all projects</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrent(c => c.subtract(1, 'month'))} className="p-2 glass-card rounded-xl hover:bg-secondary transition-colors">
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <span className="text-base font-extrabold text-foreground px-3">{current.format('MMMM YYYY')}</span>
          <button onClick={() => setCurrent(c => c.add(1, 'month'))} className="p-2 glass-card rounded-xl hover:bg-secondary transition-colors">
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
          <button onClick={() => { setCurrent(dayjs()); setSelected(today); }} className="px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-xl">Today</button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs font-semibold">
        {Object.entries(TYPE_CONFIG).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${v.dot}`} />
            <span className="text-muted-foreground capitalize">{k}s</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2 glass-panel rounded-3xl p-5">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-center text-xs font-bold text-muted-foreground py-2">{d}</div>
                ))}
              </div>

              {/* Days */}
              <div className="grid grid-cols-7 gap-1">
                {days.map(day => {
                  const key = day.format('YYYY-MM-DD');
                  const dayEvents = eventsByDate[key] || [];
                  const isToday = key === today;
                  const isCurrentMonth = day.month() === current.month();
                  const isSelected = key === selected;

                  return (
                    <button
                      key={key}
                      onClick={() => setSelected(isSelected ? null : key)}
                      className={`relative p-1.5 rounded-xl text-left transition-all min-h-[72px] ${
                        isSelected ? 'bg-primary/15 border border-primary/40' :
                        'hover:bg-secondary border border-transparent'
                      }`}
                    >
                      <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                        isToday ? 'bg-primary text-primary-foreground' :
                        isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/40'
                      }`}>
                        {day.date()}
                      </span>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map(ev => (
                          <div key={ev.id} className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold truncate border ${TYPE_CONFIG[ev.type].color}`}>
                            <div className={`w-1 h-1 rounded-full flex-shrink-0 ${TYPE_CONFIG[ev.type].dot}`} />
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Day Detail Sidebar */}
        <div className="glass-panel rounded-3xl p-5">
          {selected ? (
            <>
              <h3 className="text-base font-extrabold text-foreground mb-4">
                {dayjs(selected).format('ddd, MMM D, YYYY')}
              </h3>
              {selectedEvents.length === 0 ? (
                <div className="text-center py-8">
                  <CalIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No events on this day</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map(ev => {
                    const cfg = TYPE_CONFIG[ev.type];
                    return (
                      <div key={ev.id} className={`p-3 rounded-xl border ${cfg.color}`}>
                        <div className="flex items-start gap-2">
                          <cfg.icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-bold leading-tight">{ev.title}</p>
                            <p className="text-xs mt-0.5 opacity-75">{ev.projectTitle}</p>
                            {ev.status && <span className="text-xs bg-black/10 px-1.5 py-0.5 rounded mt-1 inline-block">{ev.status}</span>}
                            {ev.priority && <span className="text-xs ml-1 bg-black/10 px-1.5 py-0.5 rounded">{ev.priority}</span>}
                            {ev.link && (
                              <a href={ev.link} target="_blank" rel="noreferrer" className="text-xs underline mt-1 block">Join Meeting →</a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">Select a day</p>
              <p className="text-xs text-muted-foreground mt-1">Click any date to see its events</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
