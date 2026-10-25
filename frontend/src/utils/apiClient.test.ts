import { ApiClient } from './apiClient';
import { setAuthNavigator, resetAuthNavigatorForTests } from './authNavigation';
import type { Mock } from 'vitest';

describe('ApiClient.apiFetch 401 interceptor', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalLocation: Location;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalLocation = window.location;
    // jsdom Location mock — only the bits we need
    delete (window as any).location;
    (window as any).location = {
      pathname: '/transactions',
      search: '?search=foo',
    };
    resetAuthNavigatorForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (window as any).location = originalLocation;
  });

  it('navigates to /login on 401 from a non-auth endpoint', async () => {
    const navigate = vi.fn();
    setAuthNavigator(navigate);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    await ApiClient.apiFetch('http://localhost:3002/api/expenses');

    expect(navigate).toHaveBeenCalledWith('/login?next=%2Ftransactions%3Fsearch%3Dfoo');
  });

  it('does NOT navigate on 401 from /api/auth/* endpoints', async () => {
    const navigate = vi.fn();
    setAuthNavigator(navigate);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

    await ApiClient.apiFetch('http://localhost:3002/api/auth/me');

    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate on non-401 errors', async () => {
    const navigate = vi.fn();
    setAuthNavigator(navigate);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

    await ApiClient.apiFetch('http://localhost:3002/api/expenses');

    expect(navigate).not.toHaveBeenCalled();
  });

  it('returns the original response so callers see the 401', async () => {
    setAuthNavigator(vi.fn());
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 401 }));

    const res = await ApiClient.apiFetch('http://localhost:3002/api/expenses');

    expect(res.status).toBe(401);
  });

  it("sends credentials: 'include' so the __Host-fm_session cookie ships with every request", async () => {
    setAuthNavigator(vi.fn());
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await ApiClient.apiFetch('http://localhost:3002/api/expenses');

    const [, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(init.credentials).toBe('include');
  });

  it('does NOT inject an Authorization header (cookie carries auth now)', async () => {
    setAuthNavigator(vi.fn());
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await ApiClient.apiFetch('http://localhost:3002/api/expenses');

    const [, init] = (globalThis.fetch as Mock).mock.calls[0];
    // headers are either undefined (no caller-provided headers) or a plain
    // object with no Authorization key.
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });
});

describe('ApiClient invitation methods', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('createInvitation POSTs to /api/invitations with credentials + returns body', async () => {
    const payload = {
      id: 'i1',
      email: 'a@b.com',
      token: 'tok',
      status: 'pending',
      createdAt: '...',
      expiresAt: '...',
      invitedBy: null,
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 201 }));
    const inv = await ApiClient.createInvitation({ email: 'a@b.com' });
    expect(inv.token).toBe('tok');
    const [url, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(url).toMatch('/api/invitations');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com' });
  });

  it("lookupInvitation sends credentials: 'include' but no Authorization header", async () => {
    const payload = {
      householdName: 'X',
      inviterName: 'Y',
      email: 'a@b.com',
      status: 'pending',
      expiresAt: '...',
    };
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    await ApiClient.lookupInvitation('some-token');
    const [, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string> | undefined)?.Authorization).toBeUndefined();
  });

  it('lookupInvitation surfaces status + body on non-200', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: 'expired' }), { status: 410 }));
    await expect(ApiClient.lookupInvitation('tok')).rejects.toMatchObject({
      status: 410,
      body: { status: 'expired' },
    });
  });

  it('acceptInvitation POSTs token and returns user+household', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
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
    const [, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ token: 'tok' });
  });

  it('removeMember DELETEs /api/users/{id}/membership', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await ApiClient.removeMember('user-x');
    const [url, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(url).toMatch('/api/users/user-x/membership');
    expect(init.method).toBe('DELETE');
  });

  it('renameHousehold PATCHes /api/households/{id}', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'h', name: 'new' }), { status: 200 }));
    await ApiClient.renameHousehold('h', 'new');
    const [url, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(url).toMatch('/api/households/h');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'new' });
  });

  it('signup forwards inviteToken as invite_token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
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
    const [, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      email: 'b@x.com',
      password: 'supersecret',
      name: 'B',
      invite_token: 't1',
    });
    expect(init.credentials).toBe('include');
  });
});

describe('ApiClient everyday categories', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    localStorage.removeItem('everydayCategories');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loadEverydayCategories returns the saved list', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ categories: ['Groceries'] })));
    expect(await ApiClient.loadEverydayCategories()).toEqual(['Groceries']);
  });

  it('loadEverydayCategories falls back to localStorage when the request fails', async () => {
    localStorage.setItem('everydayCategories', JSON.stringify(['Gas']));
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await ApiClient.loadEverydayCategories()).toEqual(['Gas']);
  });

  it('saveEverydayCategories PUTs the list', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ categories: ['Gas'] })));
    await ApiClient.saveEverydayCategories(['Gas']);
    const [url, init] = (globalThis.fetch as Mock).mock.calls[0];
    expect(url).toMatch('/api/everyday-categories');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ categories: ['Gas'] });
  });
});
