import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

import { AcceptInvitePage } from './AcceptInvitePage';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { ApiClient } from '../../utils/apiClient';

jest.mock('../../utils/apiClient', () => {
  const actual = jest.requireActual('../../utils/apiClient');
  return {
    ...actual,
    ApiClient: {
      ...actual.ApiClient,
      lookupInvitation: jest.fn(),
      acceptInvitation: jest.fn(),
      getHouseholdSummary: jest.fn(),
      logout: jest.fn().mockResolvedValue(undefined),
      setAuthToken: jest.fn(),
      getAuthToken: jest.fn().mockReturnValue(null),
    },
  };
});

// Helper component that primes AuthContext with a signed-in user before
// rendering children.
const SignedInAs: React.FC<{
  user: { id: string; name: string; email: string; householdId: string };
  household: { id: string; name: string };
  children: React.ReactNode;
}> = ({ user, household, children }) => {
  const { setAuth, currentUser } = useAuth();
  const [primed, setPrimed] = React.useState(false);
  React.useEffect(() => {
    if (!currentUser) setAuth(user, household);
    setPrimed(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!primed) return null;
  return <>{children}</>;
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/login" element={<div>LOGIN_PAGE</div>} />
          <Route path="/signup" element={<div>SIGNUP_PAGE</div>} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

function renderSignedIn(
  path: string,
  user: { id: string; name: string; email: string; householdId: string },
  household: { id: string; name: string }
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <SignedInAs user={user} household={household}>
          <Routes>
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/login" element={<div>LOGIN_PAGE</div>} />
            <Route path="/signup" element={<div>SIGNUP_PAGE</div>} />
            <Route path="/" element={<div>HOME</div>} />
          </Routes>
        </SignedInAs>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AcceptInvitePage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders invalid-link copy on 404', async () => {
    (ApiClient.lookupInvitation as jest.Mock).mockRejectedValue({ status: 404 });
    renderAt('/accept-invite?token=nope');
    expect(await screen.findByRole('heading', { name: /Invite invalid/i })).toBeInTheDocument();
  });

  it('renders expired-specific copy on 410 expired', async () => {
    (ApiClient.lookupInvitation as jest.Mock).mockRejectedValue({
      status: 410,
      body: { status: 'expired' },
    });
    renderAt('/accept-invite?token=expired');
    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
  });

  it('signed-out: shows Create-account and Sign-in CTAs with token in URL', async () => {
    (ApiClient.lookupInvitation as jest.Mock).mockResolvedValue({
      householdName: 'Smith Family',
      inviterName: 'Alice',
      email: 'bob@x.com',
      status: 'pending',
      expiresAt: '2026-12-01',
    });
    renderAt('/accept-invite?token=t1');
    expect(await screen.findByRole('heading', { name: /Join Smith Family/ })).toBeInTheDocument();
    // Both CTAs render as Links with buttons inside; we check the parent link
    // hrefs.
    const links = screen.getAllByRole('link');
    const signupLink = links.find((l) =>
      (l.getAttribute('href') ?? '').startsWith('/signup?invite=t1')
    );
    expect(signupLink).toBeDefined();
    const loginLink = links.find((l) => (l.getAttribute('href') ?? '').startsWith('/login?next='));
    expect(loginLink).toBeDefined();
  });

  it('signed-in matching email: confirms with summary then accepts', async () => {
    (ApiClient.lookupInvitation as jest.Mock).mockResolvedValue({
      householdName: 'Smith Family',
      inviterName: 'Alice',
      email: 'bob@x.com',
      status: 'pending',
      expiresAt: '2026-12-01',
    });
    (ApiClient.getHouseholdSummary as jest.Mock).mockResolvedValue({
      transactions: 5,
      accounts: 1,
      categories: 2,
      sources: 0,
      dashboards: 1,
      reports: 0,
    });
    (ApiClient.acceptInvitation as jest.Mock).mockResolvedValue({
      user: { id: 'u', name: 'Bob', email: 'bob@x.com', householdId: 'h-new' },
      household: { id: 'h-new', name: 'Smith Family' },
    });

    renderSignedIn(
      '/accept-invite?token=t1',
      { id: 'u', name: 'Bob', email: 'bob@x.com', householdId: 'h-old' },
      { id: 'h-old', name: "Bob's Household" }
    );

    expect(await screen.findByText(/permanently delete 5 transactions/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /join household/i }));
    await waitFor(() => expect(ApiClient.acceptInvitation).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });

  it('signed-in different email: shows mismatch and sign-out CTA', async () => {
    (ApiClient.lookupInvitation as jest.Mock).mockResolvedValue({
      householdName: 'Smith Family',
      inviterName: 'Alice',
      email: 'bob@x.com',
      status: 'pending',
      expiresAt: '2026-12-01',
    });

    renderSignedIn(
      '/accept-invite?token=t1',
      { id: 'u2', name: 'Carol', email: 'carol@x.com', householdId: 'h-c' },
      { id: 'h-c', name: "Carol's Household" }
    );

    expect(await screen.findByText(/Email mismatch/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(await screen.findByText('LOGIN_PAGE')).toBeInTheDocument();
  });
});
