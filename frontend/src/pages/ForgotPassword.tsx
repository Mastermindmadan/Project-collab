import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../utils/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/request-password-reset', { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reset email. Please try again.');
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
            <KeyRound className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-3xl font-extrabold text-white">Password Recovery</h1>
          <p className="text-sm text-muted-foreground mt-2">ProjectCollab AI — Academic Platform</p>
        </div>

        <div className="glass-panel rounded-2xl p-8 shadow-2xl border-slate-800">
          {!sent ? (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Forgot your password?</h2>
              <p className="text-sm text-slate-400 mb-6">Enter your institutional email and we'll send a secure reset link.</p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="reset-email">
                    Institutional Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="reset-email"
                      type="email"
                      placeholder="student@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Link'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Check your inbox!</h2>
              <p className="text-sm text-slate-400 mb-6">
                A password reset link has been sent to <span className="text-white font-medium">{email}</span>. It expires in 1 hour.
              </p>
              <p className="text-xs text-slate-500">Didn't receive it? Check spam or try again in a few minutes.</p>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary transition-colors">
              <ArrowLeft className="w-3 h-3" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
