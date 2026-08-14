import axios from 'axios';
import { toast } from 'sonner';
import { useAuthStore } from '../store/auth.store';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '');

if (!API_URL) {
  throw new Error('VITE_API_URL must be configured for production builds.');
}

const getStoredAccessToken = (): string | null => {
  if (typeof window === 'undefined') {
    return useAuthStore.getState().accessToken ?? null;
  }

  try {
    const activeId = localStorage.getItem('pcai-active-account');
    const accountsRaw = localStorage.getItem('pcai-accounts');
    const activeToken = useAuthStore.getState().accessToken;

    if (!accountsRaw) {
      return activeToken ?? null;
    }

    const accounts = JSON.parse(accountsRaw) as Array<{ id: string; accessToken?: string }>;
    const foundAccount = activeId ? accounts.find((account) => account.id === activeId) : accounts[0];
    return foundAccount?.accessToken ?? activeToken ?? null;
  } catch {
    return useAuthStore.getState().accessToken ?? null;
  }
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request Interceptor: Attach access token to outgoing requests
api.interceptors.request.use(
  (config) => {
    const token = getStoredAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Auto-refresh expired access tokens or redirect to login on stale token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    // Backend unreachable / request timed out → surface a friendly message so
    // the user isn't left staring at an eternal loading spinner.
    const isNetworkFailure = !error.response;
    const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
    if (isNetworkFailure || isTimeout) {
      if (!(originalRequest?._retry as boolean)) {
        toast.error(
          isTimeout
            ? 'The server took too long to respond. Please try again.'
            : 'Cannot reach the server. Please check your connection and try again.'
        );
      }
      return Promise.reject(error);
    }

    // Check if error is 401 (Unauthorized) or 403 (Forbidden) and we haven't retried yet
    if ((status === 401 || status === 403) && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      const activeUser = useAuthStore.getState().user;
      const accounts = useAuthStore.getState().accounts;
      const activeAccount = accounts.find(a => a.id === activeUser?.id);
      const refreshToken = activeAccount?.refreshToken || localStorage.getItem('refreshToken');

      if (refreshToken) {
        try {
          // Call refresh token endpoint
          const response = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken });
          const { accessToken, refreshToken: nextRefreshToken } = response.data;

          // Save new token in Zustand store and updated accounts list
          useAuthStore.setState({ accessToken });
          if (activeUser?.id) {
            const updatedAccounts = accounts.map(a =>
              a.id === activeUser.id
                ? { ...a, accessToken, refreshToken: nextRefreshToken || a.refreshToken }
                : a
            );
            useAuthStore.setState({ accounts: updatedAccounts });
            localStorage.setItem('pcai-accounts', JSON.stringify(updatedAccounts));
          }

          // Update authorization header and retry original request
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          console.error('Session expired or invalid token refresh failed. Redirecting to login.');
        }
      }

      // If refresh failed or no refresh token, log out and redirect to login
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
