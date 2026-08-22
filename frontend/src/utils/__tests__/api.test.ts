import api from '../api';
import axios from 'axios';
import { useAuthStore } from '../../store/auth.store';

// `import.meta.env` is undefined outside of Vite, so mock the env accessor
// that `api.ts` reads the base URL from.
jest.mock('../apiEnv', () => ({
  VITE_API_URL: 'http://localhost:5000/api',
  VITE_DEV: false,
}));

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
describe('api response interceptor — single-flight token refresh', () => {
  const seedSession = () => {
    const account = {
      id: 'u1',
      email: 'demo@example.com',
      name: 'Demo User',
      role: 'STUDENT' as const,
      skills: [],
      accessToken: 'STALE-ACCESS',
      refreshToken: 'REFRESH-ROOT',
      lastUsed: Date.now(),
    };
    useAuthStore.setState({
      user: { id: account.id, email: account.email, name: account.name, role: account.role, skills: [] },
      accessToken: account.accessToken,
      isAuthenticated: true,
      accounts: [account],
    });
    localStorage.setItem('pcai-active-account', 'u1');
    localStorage.setItem('pcai-accounts', JSON.stringify([account]));
  };

  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      accounts: [],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // The response interceptor's rejected handler (registered at module load).
  const rejectedHandler = api.interceptors.response.handlers[0]?.rejected as
    | ((error: any) => Promise<any>)
    | undefined;

  const okResponse = (data: any) => ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {},
  });

  it('shares ONE refresh call across concurrent 403s and retries all with the fresh token', async () => {
    seedSession();

    const postSpy = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { accessToken: 'FRESH-ACCESS', refreshToken: 'REFRESH-2' } });
    const adapter = jest.fn().mockResolvedValue(okResponse({ channels: [] }));

    const reqChannels = { method: 'get', url: '/api/chat/channels', headers: {}, adapter };
    const reqNotifs = { method: 'get', url: '/api/misc/notifications', headers: {}, adapter };

    const [resChannels, resNotifs] = await Promise.all([
      rejectedHandler!({ config: reqChannels, response: { status: 403 } }),
      rejectedHandler!({ config: reqNotifs, response: { status: 403 } }),
    ]);

    // Exactly one refresh regardless of how many requests failed concurrently.
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('http://localhost:5000/api/auth/refresh-token', {
      refreshToken: 'REFRESH-ROOT',
    });

    // Both original requests were retried with the fresh access token.
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(reqChannels.headers.Authorization).toBe('Bearer FRESH-ACCESS');
    expect(reqNotifs.headers.Authorization).toBe('Bearer FRESH-ACCESS');

    // Both retries succeeded — the user stays logged in.
    expect(resChannels.data.channels).toEqual([]);
    expect(resNotifs.data.channels).toEqual([]);
    expect(useAuthStore.getState().accessToken).toBe('FRESH-ACCESS');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('does not fire a second refresh while one is still in flight', async () => {
    seedSession();

    let resolvePost: (v: any) => void = () => {};
    const postSpy = jest.spyOn(axios, 'post').mockImplementation(
      () => new Promise((r) => { resolvePost = r; })
    );
    const adapter = jest.fn().mockResolvedValue(okResponse({ ok: true }));

    const reqA = { method: 'get', url: '/api/chat/channels', headers: {}, adapter };
    const reqB = { method: 'get', url: '/api/auth/profile', headers: {}, adapter };

    const doneA = rejectedHandler!({ config: reqA, response: { status: 401 } });
    const doneB = rejectedHandler!({ config: reqB, response: { status: 401 } });

    // Both handlers have reached the (still-pending) shared refresh promise.
    await Promise.resolve();
    expect(postSpy).toHaveBeenCalledTimes(1);

    resolvePost({ data: { accessToken: 'FRESH-ACCESS', refreshToken: 'REFRESH-2' } });
    await Promise.all([doneA, doneB]);

    // Still exactly one refresh call, and both requests retried with the fresh token.
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(reqA.headers.Authorization).toBe('Bearer FRESH-ACCESS');
    expect(reqB.headers.Authorization).toBe('Bearer FRESH-ACCESS');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
