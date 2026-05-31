import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { HouseholdSection } from './HouseholdSection';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { ApiClient } from '../../utils/apiClient';

jest.mock('../../utils/apiClient', () => {
  const actual = jest.requireActual('../../utils/apiClient');
  return {
    ...actual,
    ApiClient: {
      ...actual.ApiClient,
      renameHousehold: jest.fn(),
      loadUsers: jest.fn().mockResolvedValue([]),
      removeMember: jest.fn(),
      updateUser: jest.fn(),
      listInvitations: jest.fn().mockResolvedValue([]),
      createInvitation: jest.fn(),
      revokeInvitation: jest.fn(),
      logout: jest.fn().mockResolvedValue(undefined),
    },
  };
});

const SignedIn: React.FC<{
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

function renderSection(props: { demoMode?: boolean } = {}) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <SignedIn
          user={{ id: 'u', name: 'Alice', email: 'a@x.com', householdId: 'h' }}
          household={{ id: 'h', name: 'Smith Family' }}
        >
          <HouseholdSection demoMode={props.demoMode} />
        </SignedIn>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('HouseholdSection — rename', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders household name read-only with an Edit button', async () => {
    renderSection();
    expect(await screen.findByText('Smith Family')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('saves new name via renameHousehold', async () => {
    (ApiClient.renameHousehold as jest.Mock).mockResolvedValue({
      id: 'h',
      name: 'Jones Family',
    });
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const input = screen.getByLabelText(/household name/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Jones Family');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(ApiClient.renameHousehold).toHaveBeenCalledWith('h', 'Jones Family')
    );
  });

  it('rename Edit button disabled in demo mode', () => {
    renderSection({ demoMode: true });
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled();
  });
});

describe('HouseholdSection — members', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders self with Leave and other with Remove', async () => {
    (ApiClient.loadUsers as jest.Mock).mockResolvedValue([
      { id: 'u', email: 'a@x.com', name: 'Alice' },
      { id: 'u2', email: 'b@x.com', name: 'Bob' },
    ]);
    renderSection();
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    const aliceRow = screen.getByText('Alice').closest('tr')!;
    expect(within(aliceRow).getByRole('button', { name: /leave household/i })).toBeInTheDocument();
    const bobRow = screen.getByText('Bob').closest('tr')!;
    expect(within(bobRow).getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
  });

  it('Rename other member updates via ApiClient.updateUser', async () => {
    (ApiClient.loadUsers as jest.Mock).mockResolvedValue([
      { id: 'u', email: 'a@x.com', name: 'Alice' },
      { id: 'u2', email: 'b@x.com', name: 'Bob' },
    ]);
    (ApiClient.updateUser as jest.Mock).mockResolvedValue({
      id: 'u2',
      name: 'Bobby',
      email: 'b@x.com',
      householdId: 'h',
    });
    renderSection();
    const bobRow = (await screen.findByText('Bob')).closest('tr')!;
    await userEvent.click(within(bobRow).getByRole('button', { name: /rename/i }));
    const input = screen.getByLabelText(/edit name for bob/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Bobby{enter}');
    await waitFor(() =>
      expect(ApiClient.updateUser).toHaveBeenCalledWith({ id: 'u2', name: 'Bobby' })
    );
  });

  it('Remove opens confirm modal then calls removeMember', async () => {
    (ApiClient.loadUsers as jest.Mock).mockResolvedValue([
      { id: 'u', email: 'a@x.com', name: 'Alice' },
      { id: 'u2', email: 'b@x.com', name: 'Bob' },
    ]);
    (ApiClient.removeMember as jest.Mock).mockResolvedValue(undefined);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: /^remove$/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Remove Bob/i);
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() => expect(ApiClient.removeMember).toHaveBeenCalledWith('u2'));
  });
});

describe('HouseholdSection — invitations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates invite then shows shareable link dialog', async () => {
    (ApiClient.listInvitations as jest.Mock).mockResolvedValue([]);
    (ApiClient.createInvitation as jest.Mock).mockResolvedValue({
      id: 'i1',
      email: 'new@x.com',
      token: 'tok-abc',
      status: 'pending',
      createdAt: '2026-05-01T00:00:00Z',
      expiresAt: '2026-05-08T00:00:00Z',
      invitedBy: { id: 'u', name: 'Alice' },
    });
    renderSection();
    await userEvent.type(await screen.findByLabelText(/email/i), 'new@x.com');
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }));
    await waitFor(() =>
      expect(ApiClient.createInvitation).toHaveBeenCalledWith({
        email: 'new@x.com',
      })
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/accept-invite\?token=tok-abc/);
  });

  it('revoke button removes the row', async () => {
    (ApiClient.listInvitations as jest.Mock).mockResolvedValue([
      {
        id: 'i1',
        email: 'pending@x.com',
        status: 'pending',
        createdAt: '2026-05-01T00:00:00Z',
        expiresAt: '2026-05-08T00:00:00Z',
        invitedBy: { id: 'u', name: 'Alice' },
      },
    ]);
    (ApiClient.revokeInvitation as jest.Mock).mockResolvedValue(undefined);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: /revoke/i }));
    expect(ApiClient.revokeInvitation).toHaveBeenCalledWith('i1');
  });

  it('invite form button is disabled in demo mode', () => {
    renderSection({ demoMode: true });
    expect(screen.getByRole('button', { name: /send invite/i })).toBeDisabled();
  });
});
