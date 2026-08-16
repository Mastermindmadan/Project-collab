import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import api from '../utils/api';
import { Shield, Mail, Lock, User as UserIcon, Loader2, ArrowRight, X, Plus } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'INSTRUCTOR'>('STUDENT');
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addSkill = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = skillInput.trim();
    if (tag && !skills.includes(tag)) {
      setSkills([...skills, tag]);
    }
    setSkillInput('');
  };

  const removeSkill = (tag: string) => {
    setSkills(skills.filter(s => s !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill in name, email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/register', {
        name,
        email,
        password,
        role,
        skills
      });
      const { user, accessToken, refreshToken } = response.data;
      
      loginStore(user, accessToken, refreshToken);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Registration failed. Try a different email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '6s' }}></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '8s' }}></div>

      <form autoComplete="off" className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 border border-primary/20 glow-primary mb-3">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            ProjectCollab AI
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Register your academic user account
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel rounded-2xl p-8 shadow-2xl relative border-slate-800">
          <h2 className="text-xl font-semibold text-white mb-6">Create Academic Account</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="name">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    id="name"
                    type="text"
                    placeholder="Full Name"
                    autoComplete="off"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="role">
                  Academic Role
                </label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'STUDENT' | 'INSTRUCTOR')}
                  className="w-full px-3.5 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm text-white transition-all cursor-pointer"
                >
                  <option value="STUDENT" className="bg-slate-950">Student</option>
                  <option value="INSTRUCTOR" className="bg-slate-950">Instructor / Assessor</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="email">
                Institutional Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder="Institutional Email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="password">
                Create Secure Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                  required
                />
              </div>
            </div>

            {/* Skill tags input */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Skills / Expertise (Tags)
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="React, Node.js, Python, UI Design"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSkill(e)}
                  className="flex-1 px-4 py-2 bg-slate-950/40 border border-slate-800 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                />
                <button
                  type="button"
                  onClick={addSkill}
                  className="p-2.5 bg-secondary hover:bg-secondary/80 text-white rounded-xl text-sm transition-all flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950/20 border border-slate-900 rounded-xl">
                  {skills.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 text-xs text-slate-200 border border-slate-700"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeSkill(tag)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Register & Enter Workspace
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800/60 text-center">
            <p className="text-xs text-slate-400">
              Already have an academic account?{' '}
              <Link to="/login" className="text-primary font-medium hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
