import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import api from '../utils/api';
import { toast } from 'sonner';
import {
  Mail, Lock, Loader2, ArrowRight, Zap, GitBranch, CheckSquare,
  Users, Sparkles, ShieldCheck, Activity, Code2
} from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { addAccount } = useAuthStore();

  const [email, setEmail] = useState('rohan@university.edu');
  const [password, setPassword] = useState('password123');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data;
      addAccount(user, accessToken, refreshToken);
      toast.success(`Welcome back, ${user.name}! Login successful.`, {
        description: 'Redirecting to dashboard...',
        style: { fontSize: '0.85rem', fontFamily: 'Inter, sans-serif' }
      });
      setTimeout(() => navigate('/'), 1200);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Invalid credentials or connection error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-background text-foreground">
      {/* ─── High-Tech Project-Themed Animated Background ─── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
        {/* Pulsing Vibrant Neon Orbs */}
        <div className="absolute top-10 left-10 w-96 h-96 bg-primary/25 rounded-full blur-[120px] animate-pulse-ring" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] animate-pulse-ring" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-emerald-500/15 rounded-full blur-[100px] animate-pulse-ring" style={{ animationDelay: '3s' }} />

        {/* Orbiting Radial Rings & Tech Grid */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-primary/20 border-dashed animate-spin-slow opacity-60" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full border border-purple-500/15 border-dotted animate-spin-slow opacity-40" style={{ animationDirection: 'reverse', animationDuration: '45s' }} />

        {/* Floating Project Badge 1: AI Risk Detector */}
        <div className="absolute top-12 left-6 md:left-16 flex items-center gap-3 px-4 py-3 glass-panel rounded-2xl animate-float-slow shadow-2xl border-emerald-500/30">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-foreground">AI Risk Engine</p>
            <p className="text-[11px] text-emerald-400 font-bold">98% Health Score · Optimal</p>
          </div>
        </div>

        {/* Floating Project Badge 2: Realtime Git Commits */}
        <div className="absolute bottom-16 left-6 md:left-16 flex items-center gap-3 px-4 py-3 glass-panel rounded-2xl animate-float-reverse shadow-2xl border-blue-500/30">
          <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-foreground">rohansharma / projectcollab-ai</p>
            <p className="text-[11px] text-muted-foreground font-mono font-semibold">feat: realtime chat & tasks synced</p>
          </div>
        </div>

        {/* Floating Project Badge 3: Active Collaborators */}
        <div className="absolute top-16 right-6 md:right-16 flex items-center gap-3 px-4 py-3 glass-panel rounded-2xl animate-float-reverse shadow-2xl border-purple-500/30">
          <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-foreground">5 Collaborators Active</p>
            <p className="text-[11px] text-purple-400 font-bold">ProjectCollab AI Dev Team</p>
          </div>
        </div>

        {/* Floating Project Badge 4: Task Progress */}
        <div className="absolute bottom-20 right-6 md:right-16 flex items-center gap-3 px-4 py-3 glass-panel rounded-2xl animate-float-slow shadow-2xl border-amber-500/30">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-extrabold text-foreground">Sprint Milestones</p>
            <p className="text-[11px] text-amber-400 font-bold">4/4 Tasks Completed</p>
          </div>
        </div>

        {/* Additional Floating Nodes */}
        <div className="absolute top-1/2 left-10 hidden xl:flex items-center gap-2 px-3 py-2 glass-card rounded-xl animate-float-slow text-xs text-muted-foreground font-mono">
          <Code2 className="w-4 h-4 text-primary" /> React + TypeScript + Prisma
        </div>
        <div className="absolute top-1/2 right-10 hidden xl:flex items-center gap-2 px-3 py-2 glass-card rounded-xl animate-float-reverse text-xs text-muted-foreground font-mono">
          <Activity className="w-4 h-4 text-emerald-400" /> API Server 200 OK
        </div>
      </div>
      {/* ───────────────────────────────────────────────────────────── */}

      <div className="w-full max-w-md my-8 relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-primary/10 border border-primary/20 glow-primary mb-3">
            <ShieldCheck className="w-9 h-9 text-primary animate-pulse" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            ProjectCollab AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 font-medium">
            Academic Project Management & AI Collaboration Platform
          </p>
        </div>

        {/* Login Form Card */}
        <div className="glass-panel rounded-3xl p-8 shadow-2xl border border-border">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> Sign In to Your Workspace
          </h2>

          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5" htmlFor="email">
                Institutional Email Address
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 pointer-events-none text-muted-foreground z-10 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-primary" />
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder="rohan@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input w-full !pl-11 pr-4 h-11 text-sm font-medium"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-foreground" htmlFor="password">
                  Security Password
                </label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 pointer-events-none text-muted-foreground z-10 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-primary" />
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input w-full !pl-11 pr-4 h-11 text-sm font-medium"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="mr-2 rounded border-border bg-secondary text-primary focus:ring-0 cursor-pointer"
                />
                Keep me logged in
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 h-11 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group cursor-pointer shadow-md"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Enter Workspace
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 p-3.5 rounded-2xl bg-secondary/40 border border-border">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 text-center">
              ⚡ Quick Demo Accounts (1-Click Login)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => { setEmail('rohan@university.edu'); setPassword('password123'); }}
                className="px-2 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold transition-all border border-primary/20 truncate"
              >
                Rohan (Owner)
              </button>
              <button
                type="button"
                onClick={() => { setEmail('priya@university.edu'); setPassword('password123'); }}
                className="px-2 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-[11px] font-bold transition-all border border-purple-500/20 truncate"
              >
                Priya (Admin)
              </button>
              <button
                type="button"
                onClick={() => { setEmail('arjun@university.edu'); setPassword('password123'); }}
                className="px-2 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-bold transition-all border border-emerald-500/20 truncate"
              >
                Arjun (ML Lead)
              </button>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-border text-center">
            <p className="text-xs text-muted-foreground">
              New academic collaborator?{' '}
              <Link to="/register" className="text-primary font-bold hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
