import React, { useState, useEffect } from 'react';
import {
  Settings, Bell, Shield, Palette, Globe, Trash2, Save, ToggleLeft, ToggleRight,
  Eye, EyeOff, LogOut, Key, Smartphone, User, Github, Linkedin, Phone,
  CheckCircle2, Loader2, ExternalLink, Code2, Cpu, RefreshCw, AlertTriangle,
} from 'lucide-react';


import { useAuthStore } from '../store/auth.store';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

type Section = 'profile' | 'ai' | 'notifications' | 'appearance' | 'security' | 'account';

const sections: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'ai', label: 'AI Engine & Quotas', icon: Cpu },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'account', label: 'Account', icon: Settings },
];


interface Toggle {
  label: string;
  desc: string;
  key: string;
}

const notificationToggles: Toggle[] = [
  { label: 'Task assigned to me', desc: 'Get notified when someone assigns you a task', key: 'task_assigned' },
  { label: 'Task comments', desc: 'Receive alerts for new comments on your tasks', key: 'task_comments' },
  { label: 'Deadline reminders', desc: 'Daily reminders 24h before due dates', key: 'deadlines' },
  { label: 'Team invitations', desc: 'Notifications for project team invites', key: 'invites' },
  { label: 'Mentions in chat', desc: 'Get alerted when someone @mentions you', key: 'mentions' },
  { label: 'GitHub activity', desc: 'Notify on new commits and PR updates', key: 'github' },
  { label: 'AI insights', desc: 'Weekly AI-generated sprint and risk summaries', key: 'ai' },
];

const ALL_SKILLS = [
  'React', 'TypeScript', 'Node.js', 'Python', 'PostgreSQL', 'MongoDB', 'Docker', 'AWS',
  'Machine Learning', 'UI/UX Design', 'FastAPI', 'GraphQL', 'Redis', 'Kubernetes',
  'Flutter', 'Java', 'Rust', 'Go', 'Vue.js', 'Angular', 'Django', 'Spring Boot',
];

const GITHUB_REGEX = /^(?!.*--)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

export default function AppSettings() {
  const navigate = useNavigate();
  const storeUser = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);

  const [activeSection, setActiveSection] = useState<Section>('profile');
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    task_assigned: true, task_comments: true, deadlines: true,
    invites: true, mentions: false, github: false, ai: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // ── Profile section state ───────────────────────────────────────────────────
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileForm, setProfileForm] = useState({
    name: '',
    bio: '',
    github: '',
    linkedin: '',
    phone: '',
    githubUsername: '',
    avatarUrl: '',
  });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  // ── AI Router telemetry state ───────────────────────────────────────────────
  const [aiHealth, setAiHealth] = useState<any>(null);
  const [aiUsage, setAiUsage] = useState<Record<string, { used: number; limit: number }>>({});
  const [loadingAiStats, setLoadingAiStats] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── Active Sessions state (real data, not mock) ─────────────────────────────
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const fetchSessions = () => {
    setSessionsLoading(true);
    api
      .get('/misc/sessions')
      .then((res) => setSessions(res.data?.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  };

  useEffect(() => {
    if (activeSection !== 'security') return;
    fetchSessions();
  }, [activeSection]);

  const fetchAiStats = () => {
    setLoadingAiStats(true);
    setAiError(null);
    Promise.all([
      api.get('/ai/health'),
      api.get('/ai/usage'),
    ])
      .then(([healthRes, usageRes]) => {
        setAiHealth(healthRes.data);
        setAiUsage(usageRes.data.usage || {});
      })
      .catch((e) => {
        console.error('Failed to load AI settings stats', e);
        setAiError(e?.response?.data?.error || 'Unable to load live AI telemetry telemetry. The backend router is online.');
      })
      .finally(() => setLoadingAiStats(false));
  };

  useEffect(() => {
    if (activeSection !== 'ai') return;
    fetchAiStats();
  }, [activeSection]);


  useEffect(() => {
    if (activeSection !== 'profile') return;
    let mounted = true;
    setProfileLoading(true);
    api
      .get('/auth/profile')
      .then((res) => {
        if (!mounted) return;
        const u = res.data.user;
        if (!u) return;
        updateUser({
          name: u.name, avatarUrl: u.avatarUrl, bio: u.bio,
          github: u.github, linkedin: u.linkedin, phone: u.phone,
          githubUsername: u.githubUsername,
          skills: Array.isArray(u.skills) ? u.skills : [],
        });
        setProfileForm({
          name: u.name || '',
          bio: u.bio || '',
          github: u.github || '',
          linkedin: u.linkedin || '',
          phone: u.phone || '',
          githubUsername: u.githubUsername || '',
          avatarUrl: u.avatarUrl || '',
        });
        const raw = u.skills;
        if (Array.isArray(raw)) setSelectedSkills(raw);
        else if (typeof raw === 'string') {
          try { setSelectedSkills(JSON.parse(raw)); } catch { setSelectedSkills([]); }
        }
      })
      .catch((e) => console.error('Settings profile load error', e))
      .finally(() => { if (mounted) setProfileLoading(false); });
    return () => { mounted = false; };
  }, [activeSection]);

  const toggleSkill = (skill: string) =>
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileError('');
    try {
      const cleanGithubUsername = profileForm.githubUsername.trim();
      if (cleanGithubUsername && !GITHUB_REGEX.test(cleanGithubUsername)) {
        setProfileError(
          'Invalid GitHub Username. Use alphanumeric + single hyphens only, max 39 chars, no leading/trailing hyphen.',
        );
        setProfileSaving(false);
        return;
      }

      const res = await api.put('/auth/profile', {
        name: profileForm.name,
        bio: profileForm.bio,
        github: profileForm.github,
        linkedin: profileForm.linkedin,
        phone: profileForm.phone,
        avatarUrl: profileForm.avatarUrl || undefined,
        githubUsername: cleanGithubUsername || null,
        skills: selectedSkills,
      });

      const updated = res.data.user;
      updateUser({
        name: updated.name, avatarUrl: updated.avatarUrl, bio: updated.bio,
        github: updated.github, linkedin: updated.linkedin, phone: updated.phone,
        githubUsername: updated.githubUsername,
        skills: Array.isArray(updated.skills) ? updated.skills : [],
      });
      setProfileForm((f) => ({
        ...f,
        name: updated.name || f.name,
        bio: updated.bio || '',
        github: updated.github || '',
        linkedin: updated.linkedin || '',
        phone: updated.phone || '',
        githubUsername: updated.githubUsername || '',
        avatarUrl: updated.avatarUrl || '',
      }));

      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err: any) {
      setProfileError(err.response?.data?.error || 'Failed to save profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Theme / accent ──────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('pcai-theme') || 'dark');
  const [accentColor, setAccentColor] = useState<string>(() => localStorage.getItem('pcai-accent') || 'blue');
  const accentMap: Record<string, string> = {
    blue: '217 91% 60%', purple: '271 81% 56%', emerald: '158 64% 52%',
    rose: '347 77% 50%', amber: '38 92% 50%', cyan: '189 94% 43%',
  };
  const applyTheme = (t: string) => {
    const root = document.documentElement;
    if (t === 'light') { root.classList.add('light'); root.classList.remove('dark'); }
    else if (t === 'dark') { root.classList.add('dark'); root.classList.remove('light'); }
    else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
      root.classList.toggle('light', !prefersDark);
    }
    localStorage.setItem('pcai-theme', t);
    setTheme(t);
  };
  const applyAccent = (id: string) => {
    const hsl = accentMap[id] || accentMap.blue;
    document.documentElement.style.setProperty('--primary', hsl);
    localStorage.setItem('pcai-accent', id);
    setAccentColor(id);
  };

  const toggleSwitch = (key: string) => setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = () => {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const accentColors = [
    { id: 'blue', color: 'bg-blue-500', label: 'Ocean Blue' },
    { id: 'purple', color: 'bg-purple-500', label: 'Deep Purple' },
    { id: 'emerald', color: 'bg-emerald-500', label: 'Forest Green' },
    { id: 'rose', color: 'bg-rose-500', label: 'Rose Red' },
    { id: 'amber', color: 'bg-amber-500', label: 'Golden Amber' },
    { id: 'cyan', color: 'bg-cyan-500', label: 'Cyan Frost' },
  ];

  const inputCls =
    'w-full px-3 py-2 bg-slate-950/40 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-primary/50 outline-none transition-all';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-slate-400 text-sm mb-1 flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" /> Workspace Settings
        </p>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account preferences and workspace configuration</p>
      </div>

      {settingsSaved && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm font-medium flex items-center gap-2">
          ✓ Settings saved successfully
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0">
          <div className="glass-panel rounded-2xl p-2 space-y-1">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeSection === s.id
                    ? 'bg-primary/15 text-primary border border-primary/20'
                    : 'text-slate-400 hover:bg-slate-900/60 hover:text-white'
                }`}
              >
                <s.icon className="w-4 h-4" />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* ── PROFILE SECTION ─────────────────────────────────────────────── */}
          {activeSection === 'profile' && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" /> Profile Information
                </h2>
                <button
                  onClick={handleProfileSave}
                  disabled={profileSaving || profileLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all disabled:opacity-60"
                >
                  {profileSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {profileSaving ? 'Saving…' : 'Save Profile'}
                </button>
              </div>

              {profileSaved && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Profile updated successfully!
                </div>
              )}
              {profileError && (
                <div className="flex items-center justify-between p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  <span>{profileError}</span>
                  <button onClick={() => setProfileError('')}>✕</button>
                </div>
              )}

              {profileLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Avatar preview */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center text-2xl font-extrabold text-white overflow-hidden">
                      {profileForm.avatarUrl
                        ? <img src={profileForm.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                        : (profileForm.name || storeUser?.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-slate-400 mb-1.5 font-semibold">Avatar URL</label>
                      <input
                        type="url"
                        value={profileForm.avatarUrl}
                        onChange={(e) => setProfileForm((f) => ({ ...f, avatarUrl: e.target.value }))}
                        placeholder="https://…/your-avatar.png"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  {/* Name & Bio */}
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 font-semibold">Full Name</label>
                      <input
                        type="text"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Your full name"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 font-semibold">Bio</label>
                      <textarea
                        value={profileForm.bio}
                        onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))}
                        rows={3}
                        placeholder="Tell your team about yourself…"
                        className={`${inputCls} resize-none`}
                      />
                    </div>
                  </div>

                  {/* Contact fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 font-semibold flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone
                      </label>
                      <input
                        type="tel"
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="+1 234 567 8900"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 font-semibold flex items-center gap-1">
                        <Linkedin className="w-3 h-3" /> LinkedIn
                      </label>
                      <input
                        type="text"
                        value={profileForm.linkedin}
                        onChange={(e) => setProfileForm((f) => ({ ...f, linkedin: e.target.value }))}
                        placeholder="linkedin.com/in/username"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 font-semibold flex items-center gap-1">
                        <Github className="w-3 h-3" /> GitHub Profile URL
                      </label>
                      <input
                        type="text"
                        value={profileForm.github}
                        onChange={(e) => setProfileForm((f) => ({ ...f, github: e.target.value }))}
                        placeholder="https://github.com/username"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5 font-semibold flex items-center gap-1">
                        <Github className="w-3 h-3" /> GitHub Username
                        <span className="text-slate-600 font-normal">(for contributor matching)</span>
                      </label>
                      <input
                        type="text"
                        value={profileForm.githubUsername}
                        onChange={(e) => setProfileForm((f) => ({ ...f, githubUsername: e.target.value }))}
                        placeholder="e.g. torvalds"
                        className={inputCls}
                      />
                      {profileForm.githubUsername.trim() && (
                        <div className="mt-1 text-xs text-primary flex items-center gap-1">
                          <span>Preview:</span>
                          <a
                            href={`https://github.com/${profileForm.githubUsername.trim()}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-primary/70 flex items-center gap-0.5"
                          >
                            https://github.com/{profileForm.githubUsername.trim()}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                      <p className="mt-1 text-[11px] text-slate-600">
                        Alphanumeric + hyphens only, max 39 chars, no leading/trailing hyphen.
                      </p>
                    </div>
                  </div>

                  {/* Skills */}
                  <div>
                    <label className="block text-xs text-slate-400 mb-2 font-semibold flex items-center gap-1">
                      <Code2 className="w-3 h-3" /> Technical Skills
                      <span className="text-slate-600 font-normal">(click to toggle)</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_SKILLS.map((skill) => (
                        <button
                          key={skill}
                          onClick={() => toggleSkill(skill)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            selectedSkills.includes(skill)
                              ? 'bg-primary/15 border-primary/40 text-primary'
                              : 'border-slate-800 text-slate-500 hover:border-primary/30 hover:text-white'
                          }`}
                        >
                          {skill}
                        </button>
                      ))}
                    </div>
                    {selectedSkills.length > 0 && (
                      <p className="text-xs text-slate-500 mt-2">{selectedSkills.length} skills selected</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── AI ENGINE & QUOTAS SECTION ───────────────────────────────────── */}
          {activeSection === 'ai' && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-purple-400" /> Multi-AI Router &amp; Quota Management
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Automatic provider failover (Gemini → Groq → OpenAI), prompt caching, and daily feature limits.</p>
                </div>
                <button
                  onClick={fetchAiStats}
                  className="flex items-center gap-1.5 px-3 py-1.5 glass-card text-xs text-slate-300 hover:text-white rounded-xl transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAiStats ? 'animate-spin' : ''}`} /> Refresh Telemetry
                </button>
              </div>

              {aiError && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              {loadingAiStats ? (

                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Provider Order & Active Status */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Provider Fallback Order</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        {
                          name: 'Gemini (Primary)',
                          key: 'gemini',
                          desc: aiHealth?.activeKeyDisplay ? `Rotation pool: ${aiHealth.activeKeyDisplay}` : 'Google Gemini API multi-key pool',
                          cls: 'border-purple-500/30 bg-purple-500/5',
                        },
                        {
                          name: 'Groq (Secondary)',
                          key: 'groq',
                          desc: 'Groq fast-inference fallback endpoint',
                          cls: 'border-cyan-500/30 bg-cyan-500/5',
                        },
                        {
                          name: 'OpenAI GPT (Tertiary)',
                          key: 'openai',
                          desc: 'OpenAI GPT-4o-mini fallback endpoint',
                          cls: 'border-emerald-500/30 bg-emerald-500/5',
                        },
                      ].map((p, idx) => {
                        const isCurrentActive = aiHealth?.activeProvider === p.key;
                        const isConfigured = aiHealth?.configuredProviders?.[p.key] ?? false;
                        const isAvailable = aiHealth?.availableProviders?.[p.key] ?? false;
                        return (
                          <div key={p.key} className={`p-4 rounded-xl border relative ${p.cls}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
                                <span className="w-5 h-5 rounded-md bg-slate-800 text-slate-400 flex items-center justify-center text-[10px]">{idx + 1}</span>
                                {p.name}
                              </span>
                              {isCurrentActive ? (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold flex items-center gap-1 border border-emerald-500/30">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                                </span>
                              ) : isAvailable && isConfigured ? (
                                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-semibold">Configured</span>
                              ) : isConfigured ? (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-semibold">Key Set</span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold">No Key</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">{p.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Daily Quota Usage */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Per-User Daily Quotas</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { key: 'planner', label: 'AI Project Planner', defaultLimit: 5 },
                        { key: 'analyzer', label: 'Requirement Analyzer', defaultLimit: 5 },
                        { key: 'risk', label: 'Risk Detection', defaultLimit: 5 },
                        { key: 'aipm', label: 'AI Project Manager', defaultLimit: 3 },
                      ].map((item) => {
                        const usageInfo = aiUsage[item.key] || { used: 0, limit: item.defaultLimit };
                        const percent = Math.min(Math.round((usageInfo.used / usageInfo.limit) * 100), 100);
                        return (
                          <div key={item.key} className="glass-card p-3.5 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-slate-300">{item.label}</span>
                              <span className={usageInfo.used >= usageInfo.limit ? 'text-red-400 font-bold' : 'text-slate-400'}>
                                {usageInfo.used} / {usageInfo.limit}
                              </span>
                            </div>
                            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  percent >= 100 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-400' : 'bg-primary'
                                }`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cache & Telemetry Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="glass-card p-4 rounded-xl">
                      <p className="text-xs text-slate-400 font-semibold">Cache Status</p>
                      <p className="text-lg font-extrabold text-emerald-400 mt-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Enabled ({aiHealth?.cachedEntriesTotal ?? 0} cached)
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">Prompt hashes serve cached responses automatically</p>
                    </div>
                    <div className="glass-card p-4 rounded-xl">
                      <p className="text-xs text-slate-400 font-semibold">Cache Hits (Session)</p>
                      <p className="text-lg font-extrabold text-primary mt-1">{aiHealth?.cacheHitCount ?? 0}</p>
                      <p className="text-[11px] text-slate-500 mt-1">Saved external API quota credits</p>
                    </div>
                    <div className="glass-card p-4 rounded-xl">
                      <p className="text-xs text-slate-400 font-semibold">Last Fallback Event</p>
                      <p className="text-sm font-bold text-slate-300 mt-1 truncate">
                        {aiHealth?.lastFallbackTime ? new Date(aiHealth.lastFallbackTime).toLocaleTimeString() : 'None in session'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">Exhausted key count: {aiHealth?.exhaustedKeysCount ?? 0}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── NOTIFICATIONS ───────────────────────────────────────────────── */}
          {activeSection === 'notifications' && (
            <div className="glass-panel rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" /> Notification Preferences
                </h2>
                <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-xl transition-all">
                  <Save className="w-3.5 h-3.5" /> Save
                </button>
              </div>
              {notificationToggles.map((toggle) => (
                <div key={toggle.key} className="flex items-center justify-between py-3 border-b border-slate-800/60 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-white">{toggle.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{toggle.desc}</p>
                  </div>
                  <button onClick={() => toggleSwitch(toggle.key)} className="flex-shrink-0 ml-4" aria-label={`Toggle ${toggle.label}`}>
                    {toggles[toggle.key]
                      ? <ToggleRight className="w-8 h-8 text-primary" />
                      : <ToggleLeft className="w-8 h-8 text-slate-600" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── APPEARANCE ──────────────────────────────────────────────────── */}
          {activeSection === 'appearance' && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-400" /> Appearance
              </h2>
              <div>
                <p className="text-sm font-medium text-white mb-3">Theme Mode</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'dark', label: 'Dark', preview: 'bg-slate-950 border-slate-800' },
                    { id: 'light', label: 'Light', preview: 'bg-white border-slate-200' },
                    { id: 'system', label: 'System', preview: 'bg-gradient-to-r from-slate-950 to-white border-slate-500' },
                  ].map((t) => (
                    <button key={t.id} onClick={() => applyTheme(t.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${theme === t.id ? 'border-primary' : 'border-slate-800 hover:border-slate-600'}`}>
                      <div className={`w-full h-10 rounded-lg ${t.preview} border`} />
                      <span className="text-xs font-medium text-slate-300">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-white mb-3">Accent Color</p>
                <div className="flex flex-wrap gap-3">
                  {accentColors.map((c) => (
                    <button key={c.id} onClick={() => applyAccent(c.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${accentColor === c.id ? 'border-white/30 bg-slate-800' : 'border-slate-800 hover:border-slate-600'}`}>
                      <div className={`w-4 h-4 rounded-full ${c.color}`} />
                      <span className="text-xs text-slate-400">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all">
                <Save className="w-3.5 h-3.5" /> Apply Changes
              </button>
            </div>
          )}

          {/* ── SECURITY ────────────────────────────────────────────────────── */}
          {activeSection === 'security' && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" /> Security Settings
              </h2>
              <div className="space-y-4">
                <p className="text-sm font-semibold text-white">Change Password</p>
                {['Current Password', 'New Password', 'Confirm New Password'].map((label, i) => (
                  <div key={label}>
                    <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input type={showPassword ? 'text' : 'password'} placeholder="••••••••••"
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-700 focus:border-primary/50 outline-none transition-all" />
                      {i === 0 && (
                        <button type="button" onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold rounded-xl transition-all">
                  Update Password
                </button>
              </div>
              <div className="h-px bg-slate-800" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" /> Two-Factor Authentication
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Add an extra layer of security to your account</p>
                </div>
                <button className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl hover:bg-emerald-500/20 transition-all">
                  Enable 2FA
                </button>
              </div>
              <div className="h-px bg-slate-800" />
              <div>
                <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-400" /> Active Sessions
                </p>
                {sessionsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 p-3">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading active sessions...
                  </div>
                ) : sessions.length > 0 ? (
                  sessions.map((session: any) => (
                    <div key={session.id} className="flex items-center justify-between p-3 rounded-xl glass-card mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        {session.avatarUrl ? (
                          <img src={session.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {(session.name || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{session.name || 'User'}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {session.location}
                            {session.email ? ` · ${session.email}` : ''}
                            {session.current && ' · Current session'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-[11px] text-slate-500 whitespace-nowrap">Active just now</span>
                        {!session.current && (
                          <button className="text-xs text-red-400 hover:text-red-300 transition-colors">Revoke</button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center p-6 glass-card rounded-xl">
                    <Globe className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-white">No active sessions</p>
                    <p className="text-xs text-slate-500 mt-1">Open the app in a browser tab to see your active session here.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ACCOUNT ─────────────────────────────────────────────────────── */}
          {activeSection === 'account' && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" /> Account Management
              </h2>
              <div className="space-y-3">
                {[
                  { label: 'Export Account Data', desc: 'Download all your project data as JSON', action: 'Export', color: 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20' },
                  { label: 'Disconnect GitHub', desc: 'Remove the GitHub integration from your account', action: 'Disconnect', color: 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-4 glass-card rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                    <button className={`px-3 py-1.5 border text-xs font-medium rounded-xl transition-all ${item.color}`}>
                      {item.action}
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-white">Sign Out</p>
                    <p className="text-xs text-slate-500 mt-0.5">Log out from this session</p>
                  </div>
                  <button onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium rounded-xl hover:bg-red-500/20 transition-all">
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
                <div className="flex items-center justify-between p-4 bg-red-600/5 border border-red-600/30 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-red-400">Delete Account</p>
                    <p className="text-xs text-slate-500 mt-0.5">Permanently delete your account and all data. This cannot be undone.</p>
                  </div>
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-red-600/10 border border-red-600/30 text-red-500 text-xs font-semibold rounded-xl hover:bg-red-600/20 transition-all">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
