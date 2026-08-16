import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { KeyRound, Loader2, RefreshCw, ShieldCheck, ArrowLeft } from 'lucide-react';
import api from '../utils/api';

/**
 * OTP Verification page for the password-reset flow.
 *
 * Flow: ForgotPassword (send OTP) -> OtpVerification (verify) -> ResetPassword (new password).
 * The email for this reset session is carried via router state and sessionStorage
 * (never the OTP). The user-entered OTP is only kept in memory on this screen and
 * is never stored, logged or returned in an API response.
 */
export default function OtpVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState<string>(emailFromState || '');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setEmail((prev) => {
      if (prev) return prev;
      try {
        return sessionStorage.getItem('pcai-reset-email') || '';
      } catch {
        return '';
      }
    });
  }, []);

  // Countdown for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const resendOtp = async () => {
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    setInfo('');
    try {
      await api.post('/auth/resend-password-reset-otp', { email });
      setInfo('A new OTP has been sent to your email.');
      setOtp('');
      setCooldown(60);
    } catch (err: any) {
      const msg = err.response?.data?.error;
      const wait = msg?.match(/wait (\d+)s/);
      if (wait) {
        setCooldown(Number(wait[1]));
        setError(msg);
      } else {
        setError(msg || 'Failed to resend OTP. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || otp.length !== 6) {
      setError('Please enter the 6-digit OTP.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/verify-password-reset-otp', { email, otp });
      // Pass the verified OTP to the reset screen in-memory only.
      navigate('/reset-password', { state: { email, otp } });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md glass-panel rounded-2xl p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">No password reset session found.</p>
          <Link to="/forgot-password" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <ArrowLeft className="w-3 h-3" /> Start Password Recovery
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/4 w-80 h-80 bg-primary/15 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '7s' }} />
      <div className="absolute bottom-1/4 right-1/3 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDuration: '5s' }} />

      <div className="w-full max-w-md">
<div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-3" style={{ boxShadow: '0 0 20px rgba(245,158,11,0.2)' }}>
            <KeyRound className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-3xl font-extrabold text-white">OTP Verification</h1>
          <p className="text-sm text-muted-foreground mt-2">ProjectCollab AI — Academic Platform</p>
        </div>

        <div className="glass-panel rounded-2xl p-8 shadow-2xl border-slate-800">
          <div className="flex items-center gap-2 mb-2 text-emerald-400 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            Enter the 6-digit code sent to {email}
          </div>
          <p className="text-xs text-slate-500 mb-6">The code expires in 10 minutes and can be used only once.</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">{error}</div>
          )}
          {info && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">{info}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="otp">
                One-Time Password
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-3 text-center text-2xl font-bold tracking-[0.6em] bg-slate-950/40 border border-slate-800 rounded-xl focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none text-white placeholder:text-slate-600 transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm rounded-xl transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify OTP'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={resendOtp}
              disabled={cooldown > 0 || resending}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend Code'}
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-primary transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}