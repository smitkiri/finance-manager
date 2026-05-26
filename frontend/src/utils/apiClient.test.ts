import { ApiClient } from './apiClient';
import { setAuthNavigator, resetAuthNavigatorForTests } from './authNavigation';

describe('ApiClient.apiFetch 401 interceptor', () => {
  let originalFetch: typeof global.fetch;
  let originalLocation: Location;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalLocation = window.location;
    // jsdom Location mock — only the bits we need
    delete (window as any).location;
    (window as any).location = {
      pathname: '/transactions',
      search: '?search=foo',
    };
    resetAuthNavigatorForTests();
    ApiClient.setAuthToken('test-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    (window as any).location = originalLocation;
    ApiClient.setAuthToken(null);
  });

  it('clears the token and navigates to /login on 401 from a non-auth endpoint', async () => {
    const navigate = jest.fn();
    setAuthNavigator(navigate);
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 401 }));

    await ApiClient.apiFetch('http://localhost:3002/api/expenses');

    expect(ApiClient.getAuthToken()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login?next=%2Ftransactions%3Fsearch%3Dfoo');
  });

  it('does NOT clear or navigate on 401 from /api/auth/* endpoints', async () => {
    const navigate = jest.fn();
    setAuthNavigator(navigate);
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 401 }));

    await ApiClient.apiFetch('http://localhost:3002/api/auth/me');

    expect(ApiClient.getAuthToken()).toBe('test-token');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate on non-401 errors', async () => {
    const navigate = jest.fn();
    setAuthNavigator(navigate);
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 500 }));

    await ApiClient.apiFetch('http://localhost:3002/api/expenses');

    expect(ApiClient.getAuthToken()).toBe('test-token');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('returns the original response so callers see the 401', async () => {
    setAuthNavigator(jest.fn());
    global.fetch = jest.fn().mockResolvedValue(new Response('boom', { status: 401 }));

    const res = await ApiClient.apiFetch('http://localhost:3002/api/expenses');

    expect(res.status).toBe(401);
  });
});
