import { create } from 'zustand';

export interface StoredAccount {
  id: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'INSTRUCTOR';
  avatarUrl?: string;
  skills: string[];
  accessToken: string;
  refreshToken: string;
  lastUsed: number; // timestamp
}

interface User {
  id: string;
  email: string;
  name: string;
  role: 'STUDENT' | 'INSTRUCTOR';
  avatarUrl?: string;
  skills: string[];
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
    user: activeAccount
      ? {
          id: activeAccount.id,
          email: activeAccount.email,
          name: activeAccount.name,
          role: activeAccount.role,
          avatarUrl: activeAccount.avatarUrl,
          skills: activeAccount.skills,
        }
      : null,
    accessToken: activeAccount?.accessToken ?? null,
    isAuthenticated: !!activeAccount,
    accounts,

    login: (user, accessToken, refreshToken) => {
      const accounts = get().accounts;
      const existing = accounts.findIndex(a => a.id === user.id);
      const newAccount: StoredAccount = {
        ...user,
        accessToken,
        refreshToken,
        lastUsed: Date.now(),
      };
      const updated = existing >= 0
        ? accounts.map((a, i) => (i === existing ? newAccount : a))
        : [newAccount, ...accounts];

      saveAccounts(updated);
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, user.id);

      set({ user, accessToken, isAuthenticated: true, accounts: updated });
    },

    addAccount: (user, accessToken, refreshToken) => {
      get().login(user, accessToken, refreshToken);
    },

    switchAccount: (accountId) => {
      const accounts = get().accounts;
      const account = accounts.find(a => a.id === accountId);
      if (!account) return;

      // Update lastUsed
      const updated = accounts.map(a =>
        a.id === accountId ? { ...a, lastUsed: Date.now() } : a
      );
      saveAccounts(updated);
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);

      set({
        user: {
          id: account.id,
          email: account.email,
          name: account.name,
          role: account.role,
          avatarUrl: account.avatarUrl,
          skills: account.skills,
        },
        accessToken: account.accessToken,
        isAuthenticated: true,
        accounts: updated,
      });
    },

    removeAccount: (accountId) => {
      const accounts = get().accounts.filter(a => a.id !== accountId);
      saveAccounts(accounts);

      const currentUser = get().user;
      if (currentUser?.id === accountId) {
        // Switch to next account or logout
        if (accounts.length > 0) {
          get().switchAccount(accounts[0].id);
        } else {
          localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
          set({ user: null, accessToken: null, isAuthenticated: false, accounts: [] });
        }
      } else {
        set({ accounts });
      }
    },

    logout: () => {
      const currentId = get().user?.id;
      if (currentId) {
        get().removeAccount(currentId);
      }
    },

    logoutAll: () => {
      saveAccounts([]);
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
      set({ user: null, accessToken: null, isAuthenticated: false, accounts: [] });
    },

    updateUser: (updatedFields) => {
      set(state => {
        if (!state.user) return state;
        const newUser = { ...state.user, ...updatedFields };
        // Also update accounts list
        const updatedAccounts = state.accounts.map(a =>
          a.id === newUser.id ? { ...a, ...updatedFields } : a
        );
        saveAccounts(updatedAccounts);
        return { user: newUser, accounts: updatedAccounts };
      });
    },
  };
});
