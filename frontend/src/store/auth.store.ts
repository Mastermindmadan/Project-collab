import { create } from 'zustand';

export interface StoredAccount {
  id: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'INSTRUCTOR';
  avatarUrl?: string;
  skills: string[];
  bio?: string;
  github?: string;
  linkedin?: string;
  phone?: string;
  githubUsername?: string;
  accessToken: string;
  refreshToken: string;
  lastUsed: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'INSTRUCTOR';
  avatarUrl?: string;
  skills: string[];
  bio?: string;
  github?: string;
  linkedin?: string;
  phone?: string;
  githubUsername?: string;
}

const ACCOUNTS_KEY = 'pcai-accounts';
const ACTIVE_ACCOUNT_KEY = 'pcai-active-account';

const loadAccounts = (): StoredAccount[] => {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveAccounts = (accounts: StoredAccount[]) => {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
};

const loadActiveId = (): string | null => {
  return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
};

/** Map a StoredAccount to the lightweight User shape used in component state */
const accountToUser = (a: StoredAccount): User => ({
  id: a.id,
  email: a.email,
  name: a.name,
  role: a.role,
  avatarUrl: a.avatarUrl,
  skills: a.skills ?? [],
  bio: a.bio,
  github: a.github,
  linkedin: a.linkedin,
  phone: a.phone,
  githubUsername: a.githubUsername,
});

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  accounts: StoredAccount[];

  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  logoutAll: () => void;
  updateUser: (user: Partial<User>) => void;
  switchAccount: (accountId: string) => void;
  removeAccount: (accountId: string) => void;
  addAccount: (user: User, accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => {
  const accounts = loadAccounts();
  const activeId = loadActiveId();
  const activeAccount = activeId ? accounts.find(a => a.id === activeId) : accounts[0];

  return {
    user: activeAccount ? accountToUser(activeAccount) : null,
    accessToken: activeAccount?.accessToken ?? null,
    isAuthenticated: !!activeAccount,
    accounts,

    login: (user, accessToken, refreshToken) => {
      const existingAccounts = get().accounts;
      const existingIdx = existingAccounts.findIndex(a => a.id === user.id);
      const newAccount: StoredAccount = {
        ...user,
        skills: user.skills ?? [],
        accessToken,
        refreshToken,
        lastUsed: Date.now(),
      };
      const updated =
        existingIdx >= 0
          ? existingAccounts.map((a, i) => (i === existingIdx ? { ...a, ...newAccount } : a))
          : [newAccount, ...existingAccounts];

      saveAccounts(updated);
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, user.id);
      set({ user, accessToken, isAuthenticated: true, accounts: updated });
    },

    addAccount: (user, accessToken, refreshToken) => {
      get().login(user, accessToken, refreshToken);
    },

    switchAccount: (accountId) => {
      const existingAccounts = get().accounts;
      const account = existingAccounts.find(a => a.id === accountId);
      if (!account) return;

      const updated = existingAccounts.map(a =>
        a.id === accountId ? { ...a, lastUsed: Date.now() } : a,
      );
      saveAccounts(updated);
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
      set({
        user: accountToUser(account),
        accessToken: account.accessToken,
        isAuthenticated: true,
        accounts: updated,
      });
    },

    removeAccount: (accountId) => {
      const remaining = get().accounts.filter(a => a.id !== accountId);
      saveAccounts(remaining);

      const currentUser = get().user;
      if (currentUser?.id === accountId) {
        if (remaining.length > 0) {
          get().switchAccount(remaining[0].id);
        } else {
          localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
          set({ user: null, accessToken: null, isAuthenticated: false, accounts: [] });
        }
      } else {
        set({ accounts: remaining });
      }
    },

    logout: () => {
      const currentId = get().user?.id;
      if (currentId) get().removeAccount(currentId);
    },

    logoutAll: () => {
      saveAccounts([]);
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
      set({ user: null, accessToken: null, isAuthenticated: false, accounts: [] });
    },

    updateUser: (updatedFields) => {
      set(state => {
        if (!state.user) return state;
        const newUser: User = { ...state.user, ...updatedFields };
        const updatedAccounts = state.accounts.map(a =>
          a.id === newUser.id ? { ...a, ...updatedFields } : a,
        );
        saveAccounts(updatedAccounts);
        return { user: newUser, accounts: updatedAccounts };
      });
    },
  };
});
