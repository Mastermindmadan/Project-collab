import { useState } from 'react';
import {
  Settings, Bell, Shield, Palette, Globe, Trash2, Save, ToggleLeft, ToggleRight,
  Eye, EyeOff, LogOut, Key, Smartphone
} from 'lucide-react';
import { useAuthStore } from '../store/auth.store';
import { useNavigate } from 'react-router-dom';

type Section = 'notifications' | 'appearance' | 'security' | 'account';

const sections: { id: Section; label: string; icon: React.ElementType }[] = [
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

export default function AppSettings() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [activeSection, setActiveSection] = useState<Section>('notifications');
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    task_assigned: true, task_comments: true, deadlines: true,
    invites: true, mentions: false, github: false, ai: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saved, setSaved] = useState(false);

  // Theme state — read from localStorage so it persists across sessions
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('pcai-theme') || 'dark');
  const [accentColor, setAccentColor] = useState<string>(() => localStorage.getItem('pcai-accent') || 'blue');

  // Accent colour CSS variable map
  const accentMap: Record<string, string> = {
    blue: '217 91% 60%',
    purple: '271 81% 56%',
    emerald: '158 64% 52%',
    rose: '347 77% 50%',
    amber: '38 92% 50%',
    cyan: '189 94% 43%',
  };

  // Apply theme whenever it changes
  const applyTheme = (t: string) => {
    const root = document.documentElement;
    if (t === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else if (t === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      // system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
      root.classList.toggle('light', !prefersDark);
    }
    localStorage.setItem('pcai-theme', t);
    setTheme(t);
  };

  // Apply accent colour whenever it changes
  const applyAccent = (id: string) => {
    const hsl = accentMap[id] || accentMap.blue;
    document.documentElement.style.setProperty('--primary', hsl);
    localStorage.setItem('pcai-accent', id);
    setAccentColor(id);
  };

  const toggleSwitch = (key: string) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const accentColors = [
    { id: 'blue', color: 'bg-blue-500', label: 'Ocean Blue' },
    { id: 'purple', color: 'bg-purple-500', label: 'Deep Purple' },
    { id: 'emerald', color: 'bg-emerald-500', label: 'Forest Green' },
    { id: 'rose', color: 'bg-rose-500', label: 'Rose Red' },
    { id: 'amber', color: 'bg-amber-500', label: 'Golden Amber' },
    { id: 'cyan', color: 'bg-cyan-500', label: 'Cyan Frost' },
  ];

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

      {saved && (
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
          {/* Notifications */}
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
                  <button
                    onClick={() => toggleSwitch(toggle.key)}
                    className="flex-shrink-0 ml-4"
                    aria-label={`Toggle ${toggle.label}`}
                  >
                    {toggles[toggle.key] ? (
                      <ToggleRight className="w-8 h-8 text-primary" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-slate-600" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Appearance */}
          {activeSection === 'appearance' && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-400" /> Appearance
              </h2>

              {/* Theme */}
              <div>
                <p className="text-sm font-medium text-white mb-3">Theme Mode</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'dark', label: 'Dark', preview: 'bg-slate-950 border-slate-800' },
                    { id: 'light', label: 'Light', preview: 'bg-white border-slate-200' },
                    { id: 'system', label: 'System', preview: 'bg-gradient-to-r from-slate-950 to-white border-slate-500' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyTheme(t.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        theme === t.id ? 'border-primary' : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className={`w-full h-10 rounded-lg ${t.preview} border`} />
                      <span className="text-xs font-medium text-slate-300">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Colors */}
              <div>
                <p className="text-sm font-medium text-white mb-3">Accent Color</p>
                <div className="flex flex-wrap gap-3">
                  {accentColors.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => applyAccent(c.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                        accentColor === c.id ? 'border-white/30 bg-slate-800' : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
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

          {/* Security */}
          {activeSection === 'security' && (
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" /> Security Settings
              </h2>

              {/* Change Password */}
              <div className="space-y-4">
                <p className="text-sm font-semibold text-white">Change Password</p>
                {['Current Password', 'New Password', 'Confirm New Password'].map((label, i) => (
                  <div key={label}>
                    <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••••"
                        className="w-full pl-9 pr-10 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-700 focus:border-primary/50 outline-none transition-all"
                      />
                      {i === 0 && (
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                        >
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

              {/* 2FA */}
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

              {/* Active Sessions */}
              <div>
                <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-400" /> Active Sessions
                </p>
                {[
                  { device: 'Chrome on Windows 11', location: 'Mumbai, India', current: true },
                  { device: 'Safari on iPhone 15', location: 'Mumbai, India', current: false },
                ].map((session) => (
                  <div key={session.device} className="flex items-center justify-between p-3 rounded-xl glass-card mb-2">
                    <div>
                      <p className="text-xs font-medium text-white">{session.device}</p>
                      <p className="text-xs text-slate-500">{session.location} {session.current && '· Current session'}</p>
                    </div>
                    {!session.current && (
                      <button className="text-xs text-red-400 hover:text-red-300 transition-colors">Revoke</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Account */}
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

                {/* Sign Out */}
                <div className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-white">Sign Out</p>
                    <p className="text-xs text-slate-500 mt-0.5">Log out from all active sessions</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium rounded-xl hover:bg-red-500/20 transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>

                {/* Danger Zone */}
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
