import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import {
  LayoutDashboard, Users, FolderOpen, MessageSquare, Bell,
  Settings as SettingsIcon, Search, ShieldAlert, Menu, X,
  CheckSquare, BarChart3, CalendarDays, Video,
  ArrowRight, Loader2, Mail, Lock,
  Github, Brain, FileBarChart, HardDrive, Rocket
} from 'lucide-react';
import GlobalSearch from '../components/GlobalSearch';
import AccountSwitcher from '../components/AccountSwitcher';
import api from '../utils/api';
import { useProjectStore } from '../store/project.store';

interface SidebarLayoutProps { children: React.ReactNode; }

export default function SidebarLayout({ children }: SidebarLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { addAccount, accessToken, updateUser } = useAuthStore();
  const currentUser = useAuthStore((s) => s.user);
  const activeUserId = currentUser?.id;
  const { activeProjectId, activeProject, userProjects, fetchUserProjects, switchProject } = useProjectStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [aiStatus, setAiStatus] = useState<'online' | 'slow' | 'unavailable'>('unavailable');
  const [activeProvider, setActiveProvider] = useState<'gemini' | 'groq' | 'openai'>('gemini');
  const [notifs, setNotifs] = useState<any[]>([]);
  const [catchUpPopup, setCatchUpPopup] = useState<{
    visible: boolean;
    count: number;
    latestTitle?: string;
    latestMessage?: string;
  } | null>(null);
  // ── AI usage/quota telemetry for the provider badge hover tooltip ───────────
  const [aiUsage, setAiUsage] = useState<Record<string, { used: number; limit: number }>>({});
  const [aiHealthDetail, setAiHealthDetail] = useState<any>(null);


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

  useEffect(() => {
    if (accessToken) {
      fetchUserProjects();
    }
  }, [accessToken, activeUserId]);

  const getNavPath = (basePath: string) => {
    if (!activeProjectId) return basePath;
    const projectScopedPaths = ['/tasks', '/github', '/ai-pm', '/deploy', '/reports', '/meetings', '/drive', '/analytics'];
    if (projectScopedPaths.includes(basePath)) {
      return `${basePath}?project=${activeProjectId}`;
    }
    return basePath;
  };

  // 1. Pure REST catch-up sync on app mount (unaffected by socket state or backend sleep)
  useEffect(() => {
    let mounted = true;
    if (!accessToken) return;

    const performCatchUp = async () => {
      try {
        const res = await api.get('/notifications', { params: { unread: true } });
        const unreadList = res.data.notifications || [];
        const count = res.data.unreadCount ?? unreadList.length;

        if (mounted) {
          // Fetch full list to populate dropdown
          const allRes = await api.get('/notifications');
          const allNotifications = allRes.data.notifications || [];
          setNotifs(allNotifications);

          // If there are unread notifications while the user was away, show catch-up popup!
          if (count > 0 && unreadList.length > 0) {
            const latest = unreadList[0];
            setCatchUpPopup({
              visible: true,
              count,
              latestTitle: latest.title,
              latestMessage: latest.message,
            });
          }
        }
      } catch (err) {
        console.warn('Initial notifications catch-up error:', err);
      }
    };

    performCatchUp();

    return () => {
      mounted = false;
    };
  }, [accessToken, activeUserId]);

  // 2. Separate WebSocket listener for real-time live events while the app is active
  useEffect(() => {
    if (!accessToken) return;
    let mounted = true;

    const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '');
    if (!apiBase) return;
    const WS_URL = apiBase.replace(/\/api$/, '');
    const socket = io(WS_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });

    socket.on('notification:new', (newNotif: any) => {
      if (mounted) {
        setNotifs(prev => [newNotif, ...prev]);
        setCatchUpPopup({
          visible: true,
          count: 1,
          latestTitle: newNotif.title,
          latestMessage: newNotif.message,
        });
      }
    });

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, [accessToken]);

  const handleToggleNotifMenu = async () => {
    const nextState = !showNotifMenu;
    setShowNotifMenu(nextState);

    if (nextState) {
      // Dismiss popup if user opens menu
      setCatchUpPopup(null);

      const unreadIds = notifs.filter(n => !n.isRead).map(n => n.id);
      if (unreadIds.length > 0) {
        // Optimistic local update
        setNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
        try {
          await api.patch('/notifications/mark-read', { notificationIds: unreadIds });
        } catch (err) {
          console.error('Failed to mark notifications read:', err);
        }
      }
    }
  };

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
          setAiHealthDetail(response.data);
          if (response.data?.activeProvider) {
            setActiveProvider(response.data.activeProvider);
          }
        }
      })
      .catch(() => {
        if (mounted) setAiStatus('unavailable');
      });
    api.get('/ai/usage')
      .then((res) => {
        if (mounted) setAiUsage(res.data?.usage || {});
      })
      .catch(() => {});
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
    gemini: { label: 'Project Intelligence', badgeCls: 'bg-primary/10 text-primary border-primary/20' },
    groq: { label: 'Project Intelligence (Fast)', badgeCls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
    openai: { label: 'Project Intelligence (Deep)', badgeCls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  } as const;

  const aiFeatureLabels: Record<string, string> = {
    planner: 'Sprint Planner',
    analyzer: 'Requirement Analyzer',
    risk: 'Risk Detection',
    aipm: 'Project Intelligence',
  };

  // Derived per-feature quota rows for the hover tooltip (used / limit / remaining)
  const usageEntries = Object.entries(aiUsage).map(([feature, v]) => ({
    feature,
    label: aiFeatureLabels[feature] || feature,
    used: v?.used ?? 0,
    limit: v?.limit ?? 0,
    remaining: Math.max((v?.limit ?? 0) - (v?.used ?? 0), 0),
  }));

  const currentProviderConfig = aiProviderLabels[activeProvider] || aiProviderLabels.gemini;

  const aiStatusConfig = {
    online: { label: currentProviderConfig.label, dot: 'bg-emerald-500', text: 'text-emerald-400' },
    slow: { label: `${currentProviderConfig.label} (Slow)`, dot: 'bg-amber-400', text: 'text-amber-400' },
    unavailable: { label: 'Project Intelligence Offline', dot: 'bg-red-500', text: 'text-red-400' },
  } as const;
  const currentAiStatus = aiStatusConfig[aiStatus];


  const menuGroups = [
    {
      label: 'Workspace',
      items: [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Projects & Tasks',
      items: [
        { name: 'Projects', path: '/projects', icon: FolderOpen },
        { name: 'Task Board', path: '/tasks', icon: CheckSquare },
        { name: 'My Tasks', path: '/my-tasks', icon: CheckSquare },
      ],
    },
    {
      label: 'Dev & Intelligence',
      items: [
        { name: 'GitHub Activity', path: '/github', icon: Github },
        { name: 'Project Intelligence', path: '/ai-pm', icon: Brain },
        { name: 'Drive & Documents', path: '/drive', icon: HardDrive },
        { name: 'Deployments', path: '/deploy', icon: Rocket },
      ],
    },
    {
      label: 'Collaboration',
      items: [
        { name: 'My Teams', path: '/teams', icon: Users },
        { name: 'Team Chat', path: '/chat', icon: MessageSquare },
        { name: 'Meetings', path: '/meetings', icon: Video },
        { name: 'Calendar', path: '/calendar', icon: CalendarDays },
      ],
    },
    {
      label: 'Insights',
      items: [
        { name: 'Analytics', path: '/analytics', icon: BarChart3 },
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
      <div className="md:hidden flex flex-col p-3 border-b border-border glass-panel sticky top-0 z-40 gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground text-sm tracking-wider">ProjectCollab AI</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSearchOpen(true)} className="p-1.5 text-muted-foreground hover:text-foreground">
              <Search className="w-4 h-4" />
            </button>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="p-1.5 text-muted-foreground hover:text-foreground">
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {userProjects.length > 0 && (
          <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-secondary/50 border border-border text-xs">
            <div className="flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-[10px] font-black uppercase text-muted-foreground">PROJECT:</span>
            </div>
            <select
              value={activeProjectId || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__ALL__') {
                  switchProject('');
                  navigate('/projects');
                } else {
                  switchProject(val);
                }
              }}
              className="bg-transparent font-bold text-foreground text-xs focus:outline-none cursor-pointer"
            >
              {userProjects.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                  {p.title}
                </option>
              ))}
              <option value="__ALL__" className="bg-slate-900 text-primary font-bold">
                ⚡ All Projects
              </option>
            </select>
          </div>
        )}
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
                  const isActive = item.path.includes('?')
                    ? `${location.pathname}${location.search}` === item.path
                    : location.pathname === item.path ||
                      (item.path === '/drive' && location.pathname === '/documents') ||
                      (item.path === '/ai-pm' && (location.pathname === '/ai' || location.pathname === '/intelligence'));
                  const linkTarget = item.path.includes('?') ? item.path : getNavPath(item.path);
                  return (
                    <Link key={item.name} to={linkTarget} onClick={() => setMobileOpen(false)}
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
          <AccountSwitcher onAddAccount={() => setShowAddAccount(true)} />
        </div>

      </aside>

      {/* Main Frame */}
      <div className="flex-1 flex flex-col min-w-0 md:h-screen md:overflow-y-auto">

        {/* Topbar */}
        <header className="hidden md:flex items-center justify-between px-4 lg:px-8 h-16 border-b border-border glass-panel sticky top-0 z-30 gap-3 lg:gap-6">

          {/* Left Section: Global Search & Project Context */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Global Search */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 w-40 md:w-52 lg:w-64 h-9 px-3 glass-input rounded-xl text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all group flex-shrink"
            >
              <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors flex-shrink-0" />
              <span className="flex-1 text-left text-xs truncate">Search workspace...</span>
              <div className="hidden lg:flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <kbd className="px-1.5 py-0.5 text-[10px] bg-secondary rounded font-mono">Ctrl</kbd>
                <kbd className="px-1.5 py-0.5 text-[10px] bg-secondary rounded font-mono">K</kbd>
              </div>
            </button>

            {/* Persistent Project Context Selector */}
            <div className="flex items-center gap-2 h-9 px-3 rounded-xl bg-secondary/50 border border-border/80 hover:border-border text-xs shadow-sm transition-all min-w-[140px] max-w-[240px] flex-shrink-0">
              <FolderOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <select
                value={activeProjectId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__ALL__') {
                    switchProject('');
                    navigate('/projects');
                  } else {
                    switchProject(val);
                    const currentParam = new URLSearchParams(location.search);
                    if (currentParam.has('project') || ['/tasks', '/ai-pm', '/github', '/reports', '/analytics', '/drive', '/meetings'].includes(location.pathname)) {
                      navigate(`${location.pathname}?project=${val}`);
                    }
                  }
                }}
                className="bg-transparent font-semibold text-foreground text-xs focus:outline-none cursor-pointer w-full truncate"
                title={activeProject ? activeProject.title : 'Select Project'}
              >
                {userProjects.length === 0 ? (
                  <option value="" className="bg-slate-900 text-slate-400">No Projects</option>
                ) : (
                  <>
                    {userProjects.map((p) => (
                      <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                        {p.title}
                      </option>
                    ))}
                    <option value="__ALL__" className="bg-slate-900 text-primary font-bold">
                      ⚡ All Projects View...
                    </option>
                  </>
                )}
              </select>

              {activeProject?.teamName && (
                <div className="hidden 2xl:flex items-center gap-1.5 pl-2 border-l border-border text-muted-foreground flex-shrink-0">
                  <Users className="w-3 h-3 text-secondary-foreground flex-shrink-0" />
                  <span className="font-medium text-[11px] text-foreground max-w-[100px] truncate" title={activeProject.teamName}>
                    {activeProject.teamName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {/* AI Provider Indicator Badge — hover for usage/quota & rate tooltip */}
            <div className="relative group">
              <div
                onClick={() => {
                  if (activeProjectId) {
                    navigate(`/projects/${activeProjectId}?tab=ai`);
                  } else {
                    navigate('/ai-pm');
                  }
                }}
                title="Click to open Project Intelligence"
                className={`h-9 px-3 rounded-xl text-xs font-semibold border flex items-center gap-2 cursor-pointer transition-all hover:brightness-110 active:scale-95 ${currentProviderConfig.badgeCls}`}
              >
                <span className={`w-2 h-2 rounded-full ${currentAiStatus.dot} shadow-[0_0_6px_rgba(52,211,153,0.4)] flex-shrink-0`} />
                <Brain className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden xl:inline whitespace-nowrap">{currentProviderConfig.label}</span>
                <span className="xl:hidden whitespace-nowrap">AI</span>
              </div>
              <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border bg-slate-950/95 backdrop-blur p-4 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto shadow-2xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-primary">Project Intelligence Engine</span>
                  <span className={`text-[10px] font-bold uppercase flex items-center gap-1 ${currentAiStatus.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${currentAiStatus.dot}`} /> {currentAiStatus.label}
                  </span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-400">
                  <p className="flex justify-between">
                    <span>Engine status</span>
                    <span className="font-semibold text-slate-300">Operational</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Failover resilience</span>
                    <span className="font-semibold text-slate-300">Enabled</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Cache hits (saved credits)</span>
                    <span className="font-semibold text-slate-300">{aiHealthDetail?.cacheHitCount ?? 0}</span>
                  </p>
                </div>
                <div className="border-t border-border/60 mt-2.5" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Daily Quota (used / limit)</p>
                {usageEntries.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No usage data yet — run an AI feature to get started.</p>
                ) : (
                  <div className="space-y-1.5">
                    {usageEntries.map((u) => {
                      const pct = u.limit > 0 ? Math.round((u.used / u.limit) * 100) : 0;
                      return (
                        <div key={u.feature}>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-400">{u.label}</span>
                            <span className={`font-semibold ${u.remaining === 0 ? 'text-red-400' : 'text-slate-300'}`}>
                              {u.used} / {u.limit} {u.remaining === 0 ? '· used up' : `· ${u.remaining} left`}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-slate-800 mt-0.5">
                            <div className="h-1 rounded-full bg-purple-500/70" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={() => {
                    if (activeProjectId) {
                      navigate(`/projects/${activeProjectId}?tab=ai`);
                    } else {
                      navigate('/ai-pm');
                    }
                  }}
                  className="w-full mt-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Brain className="w-3.5 h-3.5" /> Open Project Intelligence →
                </button>
              </div>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={handleToggleNotifMenu}
                aria-label="View notifications"
                className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-secondary border border-transparent hover:border-border text-muted-foreground hover:text-foreground transition-all relative"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary glow-primary animate-pulse" />
                )}
              </button>
              {showNotifMenu && (
                <div className="absolute right-0 mt-2 w-80 glass-panel border border-border rounded-xl shadow-2xl p-4 z-50 text-xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-foreground">Notifications</h3>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {notifs.map(n => (
                      <div key={n.id} className={`p-2.5 rounded-xl border transition-colors ${n.isRead ? 'bg-secondary/30 border-border/60 opacity-80' : 'bg-primary/5 border-primary/20'}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-foreground truncate">{n.title}</p>
                          {!n.isRead && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    ))}
                    {notifs.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No notifications yet.</p>
                    )}
                  </div>
                  <Link to="/notifications" onClick={() => setShowNotifMenu(false)}
                    className="block mt-3 text-center text-primary hover:underline text-xs font-semibold">
                    View all notifications →
                  </Link>
                </div>
              )}
            </div>

            {/* Account Switcher (Topbar compact) */}
            <AccountSwitcher onAddAccount={() => setShowAddAccount(true)} placement="bottom" compact />
          </div>
        </header>

        {/* Floating Catch-Up Notification Popup upon Website Open */}
        {catchUpPopup?.visible && (
          <div className="fixed bottom-6 right-6 z-[100] max-w-sm w-[calc(100vw-3rem)] sm:w-96 bg-slate-950/95 border border-primary/40 rounded-2xl shadow-2xl p-4 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary flex-shrink-0 mt-0.5">
                  <Bell className="w-5 h-5 animate-bounce" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      {catchUpPopup.count > 1 ? `${catchUpPopup.count} New Updates` : 'New Notification'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">While away</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground mt-1 truncate">
                    {catchUpPopup.latestTitle || 'New activity in your projects'}
                  </p>
                  {catchUpPopup.latestMessage && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                      {catchUpPopup.latestMessage}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setCatchUpPopup(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary transition-colors"
                aria-label="Dismiss notification popup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-border/50">
              <button
                onClick={() => {
                  setCatchUpPopup(null);
                  handleToggleNotifMenu();
                }}
                className="px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
              >
                View Updates <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
