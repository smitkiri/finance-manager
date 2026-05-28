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

describe('ApiClient invitation methods', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    ApiClient.setAuthToken('test-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    ApiClient.setAuthToken(null);
  });

  it('createInvitation POSTs to /api/invitations with bearer + returns body', async () => {
    const payload = {
      id: 'i1',
      email: 'a@b.com',
      token: 'tok',
      status: 'pending',
      createdAt: '...',
      expiresAt: '...',
      invitedBy: null,
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 201 }));
    const inv = await ApiClient.createInvitation({ email: 'a@b.com' });
    expect(inv.token).toBe('tok');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch('/api/invitations');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com' });
  });

  it('lookupInvitation does NOT send Authorization header', async () => {
    const payload = {
      householdName: 'X',
      inviterName: 'Y',
      email: 'a@b.com',
      status: 'pending',
      expiresAt: '...',
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    await ApiClient.lookupInvitation('some-token');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    // fetch was called WITHOUT an options argument, so init is undefined
    expect(init).toBeUndefined();
  });

  it('lookupInvitation surfaces status + body on non-200', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: 'expired' }), { status: 410 }));
    await expect(ApiClient.lookupInvitation('tok')).rejects.toMatchObject({
      status: 410,
      body: { status: 'expired' },
    });
  });

  it('acceptInvitation POSTs token and returns user+household', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: 'u', email: 'e', name: 'n', householdId: 'h' },
          household: { id: 'h', name: 'H' },
        }),
        { status: 200 }
      )
    );
    const res = await ApiClient.acceptInvitation('tok');
    expect(res.household.id).toBe('h');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ token: 'tok' });
  });

  it('removeMember DELETEs /api/users/{id}/membership', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await ApiClient.removeMember('user-x');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch('/api/users/user-x/membership');
    expect(init.method).toBe('DELETE');
  });

  it('renameHousehold PATCHes /api/households/{id}', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'h', name: 'new' }), { status: 200 }));
    await ApiClient.renameHousehold('h', 'new');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch('/api/households/h');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'new' });
  });

  it('signup forwards inviteToken as invite_token', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 't',
          user: { id: 'u', email: 'b@x.com', name: 'B', householdId: 'h' },
          household: { id: 'h', name: 'H' },
        }),
        { status: 200 }
      )
    );
    await ApiClient.signup({
      email: 'b@x.com',
      password: 'supersecret',
      name: 'B',
      inviteToken: 't1',
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      email: 'b@x.com',
      password: 'supersecret',
      name: 'B',
      invite_token: 't1',
    });
  });
});
