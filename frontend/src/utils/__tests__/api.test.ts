import api from '../api';
import { useAuthStore } from '../../store/auth.store';

describe('api interceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      accounts: [],
    });
  });

  it('adds the bearer token from the active localStorage account', () => {
    localStorage.setItem('pcai-active-account', 'acct-1');
    localStorage.setItem(
      'pcai-accounts',
      JSON.stringify([
        {
          id: 'acct-1',
          email: 'demo@example.com',
          name: 'Demo User',
          role: 'STUDENT',
          skills: [],
          accessToken: 'token-from-local-storage',
          refreshToken: 'refresh-from-local-storage',
          lastUsed: Date.now(),
        },
      ])
    );

    const requestHandler = api.interceptors.request.handlers[0]?.fulfilled as (value: any) => any;
    const config = { headers: {} } as any;

    const result = requestHandler(config);

    expect(result.headers.Authorization).toBe('Bearer token-from-local-storage');
  });
});
