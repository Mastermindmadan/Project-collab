import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import api from '../utils/api';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const query = useQuery();
  const token = query.get('token') || '';
  const id = query.get('id') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, id, newPassword });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-primary/15 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '7s' }} />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '5s' }} />

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-3" style={{ boxShadow: '0 0 20px rgba(245,158,11,0.2)' }}>
            <Lock className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-3xl font-extrabold text-white">Reset Password</h1>
          <p className="text-sm text-muted-foreground mt-2">ProjectCollab AI — Academic Platform</p>
        </div>

        <div className="glass-panel rounded-2xl p-8 shadow-2xl border-slate-800">
          {success ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Password Reset Successful</h2>
              <p className="text-sm text-slate-400">You will be redirected to sign in shortly.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="new-password">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="new-password"
                      type="password"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="confirm-password">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      id="confirm-password"
                      type="password"
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-sm text-white placeholder:text-slate-600 transition-all"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset Password'}
                </button>
              </form>
            </>
          )}
          <div className="mt-6 text-center">
            <a href="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary transition-colors">
              <ArrowLeft className="w-3 h-3" />
              Back to Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
