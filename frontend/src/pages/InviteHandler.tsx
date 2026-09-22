import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Users, CheckCircle2, AlertCircle, ArrowRight, Loader2, Sparkles, LogIn, UserPlus } from 'lucide-react';
import api from '../utils/api';
import { useAuthStore } from '../store/auth.store';
import { toast } from 'sonner';

export default function InviteHandler() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [status, setStatus] = useState<'checking' | 'joining' | 'success' | 'error' | 'unauthenticated'>('checking');
  const [errorMessage, setErrorMessage] = useState('');
  const [teamName, setTeamName] = useState<string | null>(null);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setErrorMessage('No invite code provided.');
      return;
    }

    const cleanCode = code.trim().toUpperCase();

    if (!user || !isAuthenticated) {
      // Store pending invite code in localStorage for after login/register
      localStorage.setItem('pending_invite_code', cleanCode);
      setStatus('unauthenticated');
      return;
    }

    // Prevent double execution in React StrictMode
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    const joinTeam = async () => {
      setStatus('joining');
      try {
        const res = await api.post('/teams/join', { inviteCode: cleanCode });
        localStorage.removeItem('pending_invite_code');
        setTeamName(res.data?.team?.name || null);
        setStatus('success');
        toast.success(`Successfully joined ${res.data?.team?.name ? `"${res.data.team.name}"` : 'the team'}!`);
        setTimeout(() => {
          navigate('/projects');
        }, 2000);
      } catch (err: any) {
        const errMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to join team.';
        if (errMsg.toLowerCase().includes('already a member')) {
          localStorage.removeItem('pending_invite_code');
          toast.info('You are already a member of this team.');
          navigate('/projects');
        } else {
          setStatus('error');
          setErrorMessage(errMsg);
        }
      }
    };

    joinTeam();
  }, [code, user, isAuthenticated, navigate]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-slate-800 shadow-2xl text-center space-y-6 animate-fade-in bg-slate-900/60">
        
        {/* Header Icon */}
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto shadow-lg">
          {status === 'joining' || status === 'checking' ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : status === 'success' ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          ) : status === 'error' ? (
            <AlertCircle className="w-8 h-8 text-red-400" />
          ) : (
            <Users className="w-8 h-8 text-primary" />
          )}
        </div>

        {/* Content based on status */}
        {status === 'checking' || status === 'joining' ? (
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Joining Workspace...</h2>
            <p className="text-xs text-slate-400">
              Validating invite code <span className="font-mono text-primary font-bold">{code?.toUpperCase()}</span>
            </p>
          </div>
        ) : status === 'success' ? (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-white">Welcome to the Team!</h2>
            <p className="text-xs text-slate-400">
              You are now a collaborator on {teamName ? <strong className="text-white">"{teamName}"</strong> : 'this workspace'}. Redirecting you to projects...
            </p>
            <div className="pt-2">
              <Link
                to="/projects"
                className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all inline-flex items-center gap-2"
              >
                Go to Projects Now <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : status === 'error' ? (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-white">Invitation Issue</h2>
            <p className="text-xs text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
              {errorMessage}
            </p>
            <p className="text-xs text-slate-400">
              Please verify that the invite code or link was entered correctly, or request a new invite from your team owner.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                to="/teams"
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all inline-flex items-center justify-center gap-2 border border-slate-700"
              >
                Go to Teams
              </Link>
              <Link
                to="/dashboard"
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        ) : (
          /* Unauthenticated state */
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-[11px] font-bold">
                <Sparkles className="w-3.5 h-3.5" /> Workspace Invitation
              </div>
              <h2 className="text-xl font-bold text-white">Join Workspace on ProjectCollab AI</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                You've received an invitation to collaborate with team invite code:
              </p>
              <div className="py-2">
                <span className="px-4 py-2 bg-slate-950/80 border border-slate-850 rounded-xl text-lg font-mono font-black text-primary tracking-widest inline-block shadow-inner">
                  {code?.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Create an account or log in to instantly join the workspace and access shared projects, tasks, and codebases.
              </p>
            </div>

            <div className="pt-3 space-y-2.5">
              <Link
                to={`/register?invite=${code}`}
                className="w-full py-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                <UserPlus className="w-4 h-4" /> Create Account & Join Team
              </Link>
              <Link
                to={`/login?invite=${code}`}
                className="w-full py-3 bg-slate-900/80 hover:bg-slate-850 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-800"
              >
                <LogIn className="w-4 h-4" /> Already have an account? Sign In
              </Link>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
