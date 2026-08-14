import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import {
  LayoutDashboard, Users, FolderOpen, MessageSquare, Zap, Bell,
  Settings as SettingsIcon, Search, ShieldAlert, Menu, X,
  CheckSquare, BarChart3, Github, CalendarDays, HardDrive,
  FileBarChart, Users2, ArrowRight, Loader2, Mail, Lock, BrainCircuit
} from 'lucide-react';
import GlobalSearch from '../components/GlobalSearch';
import AccountSwitcher from '../components/AccountSwitcher';
import api from '../utils/api';

interface SidebarLayoutProps { children: React.ReactNode; }

export default function SidebarLayout({ children }: SidebarLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { addAccount, accessToken, updateUser } = useAuthStore();
  const activeUserId = useAuthStore((s) => s.user?.id);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [aiStatus, setAiStatus] = useState<'online' | 'slow' | 'unavailable'>('unavailable');
  const [activeProvider, setActiveProvider] = useState<'gemini' | 'groq' | 'openai'>('gemini');
  const [notifs, setNotifs] = useState<any[]>([]);


  // Add account modal state
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Bootstrap full profile into store on mount (so sidebar name/avatar is always fresh)
  useEffect(() => {
    if (!accessToken) return;
    api.get('/auth/profile')
      .then(res => {
        const u = res.data.user;
        if (!u) return;
        updateUser({
          name: u.name,
          avatarUrl: u.avatarUrl,
          bio: u.bio,
          github: u.github,
          linkedin: u.linkedin,
          phone: u.phone,
          githubUsername: u.githubUsername,
          skills: Array.isArray(u.skills) ? u.skills : [],
        });
      })
      .catch(() => { /* non-critical, ignore */ });
  }, [accessToken, activeUserId]);

  // Fetch real notifications and listen for real-time push socket events
  useEffect(() => {
    let mounted = true;
    api.get('/misc/notifications')
      .then(res => {
        if (mounted) setNotifs(res.data.notifications || []);
      })
      .catch(err => console.error('Failed to load notifications:', err));

    if (!accessToken) return;

    const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '');
    if (!apiBase) return;
    const WS_URL = apiBase.replace(/\/api$/, '');
    const socket = io(WS_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    socket.on('notification:new', (newNotif: any) => {
      if (mounted) {
        setNotifs(prev => [newNotif, ...prev]);
      }
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [accessToken]);

  const unreadCount = notifs.filter(n => !n.isRead).length;

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    let mounted = true;
    api.get('/ai/health')
      .then((response) => {
        if (mounted) {
          setAiStatus('online');
          if (response.data?.activeProvider) {
            setActiveProvider(response.data.activeProvider);
          }
        }
      })
      .catch(() => {
        if (mounted) setAiStatus('unavailable');
      });
    return () => { mounted = false; };
  }, []);

  // Lock body scroll while the mobile drawer is open to prevent background scrolling
  useEffect(() => {
    if (!mobileOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [mobileOpen]);

  // Close the mobile drawer when navigating away
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);


  const aiProviderLabels = {
    gemini: { label: 'Gemini AI', badgeCls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
    groq: { label: 'Groq', badgeCls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
    openai: { label: 'OpenAI GPT', badgeCls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  } as const;

  const currentProviderConfig = aiProviderLabels[activeProvider] || aiProviderLabels.gemini;

  const aiStatusConfig = {
    online: { label: currentProviderConfig.label, dot: 'bg-emerald-500', text: 'text-emerald-400' },
    slow: { label: `${currentProviderConfig.label} (Slow)`, dot: 'bg-amber-400', text: 'text-amber-400' },
    unavailable: { label: 'AI Offline', dot: 'bg-red-500', text: 'text-red-400' },
  } as const;
  const currentAiStatus = aiStatusConfig[aiStatus];


  const menuGroups = [
    {
      label: 'Workspace',
      items: [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Analytics', path: '/analytics', icon: BarChart3 },
        { name: 'Member Analytics', path: '/analytics/members', icon: Users2 },
        { name: 'Notifications', path: '/notifications', icon: Bell, badge: unreadCount },
      ],
    },
    {
      label: 'Collaboration',
      items: [
        { name: 'My Teams', path: '/teams', icon: Users },
        { name: 'Projects', path: '/projects', icon: FolderOpen },
        { name: 'Tasks', path: '/tasks', icon: CheckSquare },
        { name: 'Team Chat', path: '/chat', icon: MessageSquare },
        { name: 'Meetings', path: '/meetings', icon: Bell },
        { name: 'Calendar', path: '/calendar', icon: CalendarDays },
        { name: 'Drive', path: '/drive', icon: HardDrive },
      ],
    },
    {
      label: 'Intelligence',
      items: [
        { name: 'AI Planner', path: '/ai', icon: Zap },
        { name: 'AI Project Manager', path: '/ai-pm', icon: BrainCircuit },
        { name: 'GitHub', path: '/github', icon: Github },
        { name: 'Reports', path: '/reports', icon: FileBarChart },
      ],
    },
    {
      label: 'Account',
      items: [
        { name: 'Settings', path: '/settings', icon: SettingsIcon },
      ],
    },
  ];

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmail || !addPassword) { setAddError('Please fill in all fields.'); return; }
    setAddLoading(true);
    setAddError('');
    try {
      const res = await api.post('/auth/login', { email: addEmail, password: addPassword });
      const { user: newUser, accessToken, refreshToken } = res.data;
      addAccount(newUser, accessToken, refreshToken);
      setShowAddAccount(false);
      setAddEmail('');
      setAddPassword('');
      navigate('/');
      window.location.reload();
    } catch (err: any) {
      setAddError(err.response?.data?.error ?? 'Invalid credentials. Try again.');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row relative">

      {/* Global Search Overlay */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Add Another Account Modal */}
      {showAddAccount && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-sm glass-panel rounded-2xl p-6 border border-border shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-foreground">Add Another Account</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Sign in to switch between workspaces instantly</p>
              </div>
              <button onClick={() => setShowAddAccount(false)} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="user@university.edu"
                    value={addEmail}
                    onChange={e => setAddEmail(e.target.value)}
                    className="glass-input w-full !pl-10 h-10 text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={addPassword}
                    onChange={e => setAddPassword(e.target.value)}
                    className="glass-input w-full !pl-10 h-10 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Demo quick-fill */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { email: 'priya@university.edu', label: 'Priya', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
                  { email: 'arjun@university.edu', label: 'Arjun', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                  { email: 'sneha@university.edu', label: 'Sneha', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                ].map(d => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => { setAddEmail(d.email); setAddPassword('password123'); }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-all ${d.color}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={addLoading}
                className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
              >
                {addLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><ArrowRight className="w-4 h-4" /> Add & Switch Account</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Topbar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border glass-panel sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary" />
          <span className="font-bold text-foreground tracking-wider">ProjectCollab AI</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSearchOpen(true)} className="p-1.5 text-muted-foreground hover:text-foreground">
            <Search className="w-5 h-5" />
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1.5 text-muted-foreground hover:text-foreground">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Panel */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 glass-panel border-r border-border p-5 flex flex-col transition-transform duration-300 md:translate-x-0 md:static md:h-screen md:sticky md:top-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand */}
        <div className="hidden md:flex items-center gap-3 mb-8 px-2">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 glow-primary">
            <ShieldAlert className="w-5 h-5 text-primary" />
          </div>
          <span className="font-extrabold text-foreground text-lg tracking-wider">ProjectCollab AI</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-4 overflow-y-auto pr-1" style={{ scrollbarWidth: 'none' }}>
          {menuGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link key={item.name} to={item.path} onClick={() => setMobileOpen(false)}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
                        ${isActive ? 'bg-primary text-primary-foreground glow-primary font-semibold' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}
                      `}>
                      <Icon className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-primary'}`} />
                      <span className="flex-1">{item.name}</span>
                      {'badge' in item && (item as any).badge > 0 && !isActive && (
                        <span className="px-1.5 py-0.5 text-xs rounded-full bg-primary text-primary-foreground font-bold min-w-[18px] text-center">
                          {(item as any).badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Account Switcher Footer */}
        <div className="pt-4 border-t border-border mt-auto">
          <div className={`mb-3 flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/40 border border-border text-xs font-semibold ${currentAiStatus.text}`}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${currentAiStatus.dot} ${aiStatus === 'online' ? 'animate-pulse' : ''}`} />
              <span>{currentAiStatus.label}</span>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${currentProviderConfig.badgeCls}`}>
              {activeProvider}
            </span>
          </div>
          <AccountSwitcher onAddAccount={() => setShowAddAccount(true)} />
        </div>

      </aside>

      {/* Main Frame */}
      <div className="flex-1 flex flex-col min-w-0 md:h-screen md:overflow-y-auto">

        {/* Topbar */}
        <header className="hidden md:flex items-center justify-between px-8 py-4 border-b border-border glass-panel sticky top-0 z-30">

          {/* Global Search */}
          <button onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 w-80 px-3 py-2 glass-input rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all group">
            <Search className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left text-xs">Search projects, tasks, people...</span>
            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
              <kbd className="px-1.5 py-0.5 text-[10px] bg-secondary rounded font-mono">Ctrl</kbd>
              <kbd className="px-1.5 py-0.5 text-[10px] bg-secondary rounded font-mono">K</kbd>
            </div>
          </button>

          {/* Right Controls */}
          <div className="flex items-center gap-3 relative">
            {/* AI Provider Indicator Badge */}
            <div className={`px-2.5 py-1 rounded-xl text-xs font-semibold border flex items-center gap-1.5 ${currentProviderConfig.badgeCls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${currentAiStatus.dot}`} />
              <span>{currentProviderConfig.label}</span>
            </div>

            {/* Notifications */}
            <div className="relative">

              <button onClick={() => setShowNotifMenu(!showNotifMenu)}
                className="p-2 rounded-xl hover:bg-secondary border border-transparent hover:border-border text-muted-foreground hover:text-foreground transition-all relative">
                <Bell className="w-4 h-4" />
                {notifs.filter(n => !n.isRead).length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary glow-primary animate-pulse" />
                )}
              </button>
              {showNotifMenu && (
                <div className="absolute right-0 mt-2 w-72 glass-panel border border-border rounded-xl shadow-2xl p-4 z-50 text-xs">
                  <h3 className="font-bold text-foreground mb-3">Notifications</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {notifs.map(n => (
                      <div key={n.id} className="p-2.5 bg-secondary/50 rounded-xl border border-border">
                        <p className="font-semibold text-foreground">{n.title}</p>
                        <p className="text-muted-foreground mt-0.5">{n.message}</p>
                      </div>
                    ))}
                  </div>
                  <Link to="/notifications" onClick={() => setShowNotifMenu(false)}
                    className="block mt-3 text-center text-primary hover:underline text-xs">View all notifications →</Link>
                </div>
              )}
            </div>

            {/* Account Switcher (Topbar compact) */}
            <AccountSwitcher onAddAccount={() => setShowAddAccount(true)} />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
