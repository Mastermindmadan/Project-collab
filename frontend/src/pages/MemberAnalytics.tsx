import { useState, useEffect } from 'react';
import { Users, CheckSquare, Clock, AlertCircle, Trophy, Loader2, BarChart3, Star } from 'lucide-react';
import api from '../utils/api';
import { ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

interface MemberStat {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  team: string;
  role: string;
  totalTasks: number;
  completed: number;
  inProgress: number;
  overdue: number;
  productivity: number;
}

export default function MemberAnalytics() {
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [members, setMembers] = useState<MemberStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MemberStat | null>(null);

  useEffect(() => {
    api.get('/teams/my-teams').then(res => {
      const ts = res.data.teams || [];
      setTeams(ts);
      if (ts.length > 0) setSelectedTeamId(ts[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    setLoading(true);
    api.get(`/reports/members?teamId=${selectedTeamId}`)
      .then(res => { setMembers(res.data.members || []); setSelected(null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedTeamId]);

  const sorted = [...members].sort((a, b) => b.productivity - a.productivity);

  const chartData = sorted.map(m => ({
    name: m.name.split(' ')[0],
    Completed: m.completed,
    InProgress: m.inProgress,
    Overdue: m.overdue,
  }));

  const productivityBadge = (p: number) => {
    if (p >= 80) return { label: 'Top Performer', color: 'text-emerald-500 bg-emerald-500/10' };
    if (p >= 50) return { label: 'On Track', color: 'text-blue-500 bg-blue-500/10' };
    if (p >= 25) return { label: 'Needs Focus', color: 'text-amber-500 bg-amber-500/10' };
    return { label: 'At Risk', color: 'text-rose-500 bg-rose-500/10' };
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-muted-foreground text-sm flex items-center gap-1.5"><Users className="w-4 h-4 text-primary" /> Team Analytics</p>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Member Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Per-member productivity, task completion, and contribution scores</p>
        </div>
        <select value={selectedTeamId} onChange={e => setSelectedTeamId(e.target.value)} className="glass-input text-sm rounded-xl outline-none text-foreground">
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="glass-panel rounded-2xl p-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <>
          {/* Leaderboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Member Cards */}
            <div className="lg:col-span-1 glass-panel rounded-3xl p-5 space-y-3">
              <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" /> Leaderboard
              </h2>
              {sorted.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No members found</p>
              ) : (
                sorted.map((m, idx) => {
                  const badge = productivityBadge(m.productivity);
                  return (
                    <button key={m.userId} onClick={() => setSelected(m === selected ? null : m)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${selected?.userId === m.userId ? 'bg-primary/10 border border-primary/30' : 'hover:bg-secondary'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold ${idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-secondary text-foreground'}`}>
                        {idx + 1}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center flex-shrink-0">
                        {m.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.role}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-foreground">{m.productivity}%</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Selected Member Detail */}
            <div className="lg:col-span-2 glass-panel rounded-3xl p-5">
              {selected ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary text-xl font-extrabold flex items-center justify-center">
                      {selected.name.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-lg font-extrabold text-foreground">{selected.name}</h2>
                      <p className="text-sm text-muted-foreground">{selected.email} · {selected.role} · {selected.team}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-3xl font-extrabold text-primary">{selected.productivity}%</p>
                      <p className="text-xs text-muted-foreground">Productivity</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Tasks', value: selected.totalTasks, icon: CheckSquare, color: 'text-blue-500' },
                      { label: 'Completed', value: selected.completed, icon: CheckSquare, color: 'text-emerald-500' },
                      { label: 'In Progress', value: selected.inProgress, icon: Clock, color: 'text-amber-500' },
                      { label: 'Overdue', value: selected.overdue, icon: AlertCircle, color: 'text-rose-500' },
                    ].map(s => (
                      <div key={s.label} className="glass-card p-3 rounded-2xl text-center">
                        <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-1`} />
                        <p className="text-xl font-extrabold text-foreground">{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Productivity Bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-foreground">Task Completion Progress</span>
                      <span className="text-primary font-extrabold">{selected.productivity}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-3">
                      <div className="h-3 rounded-full bg-gradient-to-r from-primary to-blue-400 transition-all duration-700"
                        style={{ width: `${selected.productivity}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Star className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="text-base font-bold text-foreground">Select a member</p>
                  <p className="text-sm text-muted-foreground">Click any member to view their detailed stats</p>
                </div>
              )}
            </div>
          </div>

          {/* Team Bar Chart */}
          {chartData.length > 0 && (
            <div className="glass-panel rounded-3xl p-6">
              <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary" /> Team Task Distribution
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground, #6b7280)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--color-muted-foreground, #6b7280)', fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--color-card, #1e293b)', border: 'none', borderRadius: '12px', color: '#f8fafc' }} />
                  <Legend />
                  <Bar dataKey="Completed" fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="InProgress" fill="#f59e0b" radius={[4,4,0,0]} />
                  <Bar dataKey="Overdue" fill="#ef4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
