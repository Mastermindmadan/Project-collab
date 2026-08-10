import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth.store';
import { User, Mail, Github, Linkedin, Save, Camera, Code2, Loader2, CheckCircle2, Phone, FolderOpen, Users, CheckSquare, TrendingUp, ExternalLink } from 'lucide-react';
import api from '../utils/api';

const ALL_SKILLS = ['React', 'TypeScript', 'Node.js', 'Python', 'PostgreSQL', 'MongoDB', 'Docker', 'AWS', 'Machine Learning', 'UI/UX Design', 'FastAPI', 'GraphQL', 'Redis', 'Kubernetes', 'Flutter', 'Java', 'Rust', 'Go', 'Vue.js', 'Angular', 'Django', 'Spring Boot'];

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: '',
    github: '',
    linkedin: '',
    phone: '',
    githubUsername: '',
  });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ tasks: 0, projects: 0, teams: 0, productivity: 0 });
  const [projects, setProjects] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  // Load real profile data from backend + compute stats
  useEffect(() => {
    const loadProfile = async () => {
      setLoadingStats(true);
      try {
        // Load teams + projects
        const teamsRes = await api.get('/teams/my-teams');
        const userTeams = teamsRes.data.teams || [];
        setTeams(userTeams);

        const userProjects: any[] = [];
        let totalTasks = 0;
        let completedTasks = 0;

        for (const team of userTeams) {
          for (const proj of (team.projects || [])) {
            userProjects.push({ ...proj, teamName: team.name });
            try {
              const pRes = await api.get(`/projects/${proj.id}`);
              const p = pRes.data.project;
              const myTasks = (p.tasks || []).filter((t: any) => t.assigneeId === user?.id);
              totalTasks += myTasks.length;
              completedTasks += myTasks.filter((t: any) => t.status === 'COMPLETED').length;
            } catch { /* skip */ }
          }
        }

        setProjects(userProjects);
        setStats({
          tasks: completedTasks,
          projects: userProjects.length,
          teams: userTeams.length,
          productivity: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        });

        // Load stored profile fields if available
        if (user) {
          setForm(f => ({
            ...f,
            name: user.name || f.name,
            email: user.email || f.email,
            bio: (user as any).bio || f.bio,
            github: (user as any).github || f.github,
            linkedin: (user as any).linkedin || f.linkedin,
            phone: (user as any).phone || f.phone,
            githubUsername: (user as any).githubUsername || f.githubUsername,
          }));
          const raw = (user as any).skills;
          if (Array.isArray(raw)) setSelectedSkills(raw);
          else if (typeof raw === 'string') {
            try { setSelectedSkills(JSON.parse(raw)); } catch { setSelectedSkills([]); }
          }
        }
      } catch (e) {
        console.error('Profile load error', e);
      } finally {
        setLoadingStats(false);
      }
    };
    loadProfile();
  }, []);

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      await api.put('/auth/profile', {
        name: form.name,
        bio: form.bio,
        github: form.github,
        linkedin: form.linkedin,
        phone: form.phone,
        githubUsername: form.githubUsername.trim() || null,
        skills: selectedSkills,
      });
      updateUser({ name: form.name, skills: selectedSkills });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const avatarInitial = (form.name || 'U').charAt(0).toUpperCase();
  const avatarColors = ['from-primary/50 to-purple-500/50', 'from-blue-500/50 to-emerald-500/50', 'from-orange-500/50 to-red-500/50', 'from-pink-500/50 to-purple-500/50'];
  const avatarGradient = avatarColors[(form.name.charCodeAt(0) || 0) % avatarColors.length];

  const inputCls = 'w-full px-3 py-2 glass-input text-sm text-foreground rounded-xl outline-none';

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> User Profile</p>
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">My Profile</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your identity, skills, and collaboration presence</p>
      </div>

      {saved && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-500">
          <CheckCircle2 className="w-4 h-4" />
          <p className="text-sm font-semibold">Profile updated successfully!</p>
        </div>
      )}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {/* Hero Card */}
      <div className="glass-panel rounded-3xl p-6">
        <div className="flex items-start gap-6 flex-wrap">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-4xl font-extrabold text-white shadow-lg`}>
              {user?.avatarUrl ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover rounded-2xl" /> : avatarInitial}
            </div>
            {editing && (
              <button className="absolute -bottom-1 -right-1 p-1.5 glass-card border border-border rounded-lg hover:bg-secondary transition-all">
                <Camera className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Name + Role + Actions */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="text-2xl font-extrabold bg-transparent border-b border-primary/40 text-foreground outline-none pb-1 w-full mb-1" />
            ) : (
              <h2 className="text-2xl font-extrabold text-foreground mb-1">{form.name}</h2>
            )}
            <p className="text-muted-foreground text-sm">{user?.role?.toLowerCase()} · {form.email}</p>
            {selectedSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedSkills.slice(0, 5).map(s => (
                  <span key={s} className="px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary rounded-full">{s}</span>
                ))}
                {selectedSkills.length > 5 && <span className="text-xs text-muted-foreground">+{selectedSkills.length - 5} more</span>}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setError(''); }}
                  className="px-4 py-2 border border-border text-muted-foreground text-sm rounded-xl hover:bg-secondary transition-all">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)}
                className="px-4 py-2 glass-card text-foreground text-sm rounded-xl hover:bg-secondary transition-all border border-border">
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Bio */}
        <div className="mt-6 pt-6 border-t border-border">
          <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Bio</label>
          {editing ? (
            <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              rows={3} placeholder="Tell your team about yourself..."
              className="w-full px-4 py-3 glass-input text-sm text-foreground rounded-xl outline-none resize-none" />
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {form.bio || <span className="italic text-muted-foreground/50">No bio added yet.</span>}
            </p>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Tasks Done', value: loadingStats ? '…' : stats.tasks, icon: CheckSquare, color: 'text-emerald-500' },
          { label: 'Projects', value: loadingStats ? '…' : stats.projects, icon: FolderOpen, color: 'text-blue-500' },
          { label: 'Teams', value: loadingStats ? '…' : stats.teams, icon: Users, color: 'text-purple-500' },
          { label: 'Productivity', value: loadingStats ? '…' : `${stats.productivity}%`, icon: TrendingUp, color: 'text-amber-500' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-4 text-center">
            <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-2`} />
            <p className="text-xl font-extrabold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Contact + Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass-panel rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-extrabold text-foreground flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Contact Information</h3>
          {[
            { label: 'Email Address', value: form.email, icon: Mail, key: 'email', type: 'email', placeholder: 'your@email.com' },
            { label: 'Phone Number', value: form.phone, icon: Phone, key: 'phone', type: 'tel', placeholder: '+1 234 567 8900' },
            { label: 'GitHub Profile', value: form.github, icon: Github, key: 'github', placeholder: 'github.com/username' },
            { label: 'GitHub Username (for contributor matching)', value: form.githubUsername, icon: Github, key: 'githubUsername', placeholder: 'your-github-handle (e.g. torvalds)' },
            { label: 'LinkedIn', value: form.linkedin, icon: Linkedin, key: 'linkedin', placeholder: 'linkedin.com/in/username' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-xs text-muted-foreground mb-1.5 font-semibold">{field.label}</label>
              {editing ? (
                <input type={field.type || 'text'} value={field.value}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder} className={inputCls} />
              ) : (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <field.icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  {field.value ? (
                    field.key === 'github' || field.key === 'linkedin' ? (
                      <a href={field.value.startsWith('http') ? field.value : `https://${field.value}`}
                        target="_blank" rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 truncate">
                        {field.value} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    ) : (
                      <span className="truncate">{field.value}</span>
                    )
                  ) : (
                    <span className="text-muted-foreground/50 italic">Not set</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Skills */}
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-extrabold text-foreground mb-3 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-emerald-500" /> Technical Skills
            {editing && <span className="text-xs text-muted-foreground font-normal ml-1">Click to toggle</span>}
          </h3>
          <div className="flex flex-wrap gap-2">
            {ALL_SKILLS.map(skill => (
              <button key={skill} onClick={() => editing && toggleSkill(skill)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  selectedSkills.includes(skill)
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : editing
                    ? 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    : 'border-border text-muted-foreground/60'
                } ${editing ? 'cursor-pointer' : 'cursor-default'}`}>
                {skill}
              </button>
            ))}
          </div>
          {selectedSkills.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">{selectedSkills.length} skills selected</p>
          )}
        </div>
      </div>

      {/* Projects + Teams */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-sm font-extrabold text-foreground mb-3 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-500" /> My Projects
          </h3>
          {loadingStats ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not part of any projects yet</p>
          ) : (
            <div className="space-y-2">
              {projects.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary transition-colors">
                  <div className={`w-2 h-2 rounded-full ${p.status === 'HEALTHY' ? 'bg-emerald-500' : p.status === 'AT_RISK' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.teamName}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.status === 'HEALTHY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <h3 className="text-sm font-extrabold text-foreground mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-500" /> My Teams
          </h3>
          {loadingStats ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
          ) : teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not part of any teams yet</p>
          ) : (
            <div className="space-y-2">
              {teams.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 text-sm font-extrabold flex items-center justify-center">
                    {t.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.members?.length || 0} members · {t.projects?.length || 0} projects</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
