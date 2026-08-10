import axios from 'axios';
import { useAuthStore } from '../store/auth.store';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request Interceptor: Attach access token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
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

    // Check if error is 401 (Unauthorized) or 403 (Forbidden) and we haven't retried yet
    if ((status === 401 || status === 403) && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          // Call refresh token endpoint
          const response = await axios.post(`${API_URL}/auth/refresh-token`, { refreshToken });
          const { accessToken } = response.data;

          // Save new token in Zustand store
          useAuthStore.setState({ accessToken });

          // Update authorization header and retry original request
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          console.error('Session expired or invalid. Logging out.');
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
