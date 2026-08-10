import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import type { StoredAccount } from '../store/auth.store';
import {
  Plus, LogOut, ChevronDown, Check, UserX, Settings, Users
} from 'lucide-react';
import api from '../utils/api';

interface AccountSwitcherProps {
  onAddAccount?: () => void;
}

const avatarColors: Record<string, string> = {
  A: 'bg-purple-600', B: 'bg-blue-600', C: 'bg-emerald-600',
  D: 'bg-rose-600', E: 'bg-amber-600', F: 'bg-cyan-600',
  G: 'bg-indigo-600', H: 'bg-pink-600', I: 'bg-teal-600',
  J: 'bg-orange-600', K: 'bg-violet-600', L: 'bg-lime-700',
  M: 'bg-primary', N: 'bg-sky-600', O: 'bg-red-600',
  P: 'bg-purple-500', Q: 'bg-blue-500', R: 'bg-green-600',
  S: 'bg-yellow-600', T: 'bg-blue-700',
};

function getAvatarColor(name: string) {
  const initial = name?.[0]?.toUpperCase() ?? 'A';
  return avatarColors[initial] ?? 'bg-primary';
}

function AccountAvatar({ account, size = 'md' }: { account: { name: string; avatarUrl?: string }; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'w-7 h-7 text-[11px]', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base' };
  return (
    <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${getAvatarColor(account.name)} overflow-hidden`}>
      {account.avatarUrl
        ? <img src={account.avatarUrl} alt={account.name} className="w-full h-full object-cover" />
        : account.name?.[0]?.toUpperCase()}
    </div>
  );
}

export default function AccountSwitcher({ onAddAccount }: AccountSwitcherProps) {
  const navigate = useNavigate();
  const { user, accounts, switchAccount, removeAccount, logoutAll } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const otherAccounts = accounts
    .filter(a => a.id !== user?.id)
    .sort((a, b) => b.lastUsed - a.lastUsed);

  const handleSwitch = async (account: StoredAccount) => {
    setSwitching(account.id);
    try {
      // Validate token by refreshing
      const res = await api.post('/auth/refresh', { refreshToken: account.refreshToken });
      const newAccessToken = res.data.accessToken;

      switchAccount(account.id);
      // Update the token in store with fresh one
      useAuthStore.getState().login(
        { id: account.id, email: account.email, name: account.name, role: account.role, avatarUrl: account.avatarUrl, skills: account.skills },
        newAccessToken,
        account.refreshToken
      );
      setOpen(false);
      navigate('/');
      window.location.reload();
    } catch {
      // Token expired — remove account
      removeAccount(account.id);
    } finally {
      setSwitching(null);
    }
  };

  const handleLogoutCurrent = () => {
    const { logout } = useAuthStore.getState();
    logout();
    setOpen(false);
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-secondary border border-transparent hover:border-border transition-all group"
      >
        <AccountAvatar account={user} size="sm" />
        <div className="flex-1 overflow-hidden text-left hidden lg:block">
          <p className="text-xs font-semibold text-foreground truncate leading-tight">{user.name}</p>
          <p className="text-[10px] text-muted-foreground truncate leading-tight capitalize">{user.role.toLowerCase()}</p>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 glass-panel border border-border rounded-2xl shadow-2xl overflow-hidden z-[100]">
          {/* Current Account Header */}
          <div className="p-4 border-b border-border bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <AccountAvatar account={user} size="lg" />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary/15 text-primary capitalize">
                  {user.role.toLowerCase()} · Active
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-2 border-b border-border space-y-0.5">
            <button
              onClick={() => { navigate('/profile'); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-secondary text-xs font-medium text-foreground transition-colors text-left"
            >
              <Users className="w-4 h-4 text-muted-foreground" />
              Manage Profile
            </button>
            <button
              onClick={() => { navigate('/settings'); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-secondary text-xs font-medium text-foreground transition-colors text-left"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
              Account Settings
            </button>
          </div>

          {/* Other Saved Accounts */}
          {otherAccounts.length > 0 && (
            <div className="p-2 border-b border-border">
              <p className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Switch Account</p>
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {otherAccounts.map(account => (
                  <div key={account.id} className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-secondary group transition-colors">
                    <button
                      onClick={() => handleSwitch(account)}
                      disabled={switching === account.id}
                      className="flex-1 flex items-center gap-2.5 text-left"
                    >
                      <div className="relative flex-shrink-0">
                        <AccountAvatar account={account} size="sm" />
                        {switching === account.id && (
                          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-semibold text-foreground truncate">{account.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{account.email}</p>
                      </div>
                      {switching !== account.id && (
                        <Check className="w-3.5 h-3.5 text-transparent group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all" />
                      )}
                    </button>
                    <button
                      onClick={() => removeAccount(account.id)}
                      className="p-1 rounded-lg text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove account"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Account & Logout */}
          <div className="p-2 space-y-0.5">
            <button
              onClick={() => { onAddAccount?.(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-secondary text-xs font-medium text-foreground transition-colors text-left"
            >
              <Plus className="w-4 h-4 text-primary" />
              Add Another Account
            </button>
            <button
              onClick={handleLogoutCurrent}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-destructive/10 text-xs font-medium text-destructive transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign Out ({user.email.split('@')[0]})
            </button>
            {accounts.length > 1 && (
              <button
                onClick={() => { logoutAll(); navigate('/login'); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-destructive/10 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                Sign Out All Accounts
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { AccountAvatar };
