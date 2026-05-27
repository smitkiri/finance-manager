import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SignupPage } from './SignupPage';
import { AuthProvider } from '../../contexts/AuthContext';
import { ApiClient } from '../../utils/apiClient';

jest.mock('../../utils/apiClient', () => {
  const actual = jest.requireActual('../../utils/apiClient');
  return {
    ...actual,
    ApiClient: {
      ...actual.ApiClient,
      signup: jest.fn(),
      getDemoConfig: jest.fn().mockResolvedValue({ enabled: false }),
      setAuthToken: jest.fn(),
      getAuthToken: jest.fn().mockReturnValue(null),
      lookupInvitation: jest.fn(),
    },
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<div>LOGIN_PAGE</div>} />
          <Route path="/" element={<div>HOME</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('SignupPage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders name, email, password fields', async () => {
    renderAt('/signup');
    expect(await screen.findByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('creates the account on submit and navigates home on success', async () => {
    (ApiClient.signup as jest.Mock).mockResolvedValueOnce({
      token: 'tok',
      user: { id: 'u1', name: 'A', email: 'a@b.c', householdId: 'h1' },
      household: { id: 'h1', name: "A's Household" },
    });
    renderAt('/signup');
    await userEvent.type(await screen.findByLabelText(/name/i), 'A');
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.c');
    await userEvent.type(screen.getByLabelText(/password/i), 'password1');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() =>
      expect(ApiClient.signup).toHaveBeenCalledWith({
        name: 'A',
        email: 'a@b.c',
        password: 'password1',
      })
    );
    expect(ApiClient.setAuthToken).toHaveBeenCalledWith('tok');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });

  it('shows duplicate-email error and a link to sign in on 409', async () => {
    (ApiClient.signup as jest.Mock).mockRejectedValueOnce(
      new Error('{"detail":"Email already registered"}')
    );
    renderAt('/signup');
    await userEvent.type(await screen.findByLabelText(/name/i), 'A');
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.c');
    await userEvent.type(screen.getByLabelText(/password/i), 'password1');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/account with this email already exists/i)).toBeInTheDocument();
    const signInLink = screen.getByRole('link', { name: /sign in instead/i });
    await userEvent.click(signInLink);
    expect(await screen.findByText('LOGIN_PAGE')).toBeInTheDocument();
  });

  it('shows inline error on short password before submit attempt resolves', async () => {
    renderAt('/signup');
    await userEvent.type(await screen.findByLabelText(/name/i), 'A');
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.c');
    await userEvent.type(screen.getByLabelText(/password/i), 'short');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/at least 8 characters/i);
    expect(ApiClient.signup).not.toHaveBeenCalled();
  });

  it('redirects to / in demo mode', async () => {
    (ApiClient.getDemoConfig as jest.Mock).mockResolvedValueOnce({ enabled: true });
    renderAt('/signup');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });
});

describe('SignupPage invite mode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pre-fills and disables email when ?invite=&email= present', async () => {
    (ApiClient.lookupInvitation as jest.Mock).mockResolvedValue({
      householdName: 'Smith Family',
      inviterName: 'Alice',
      email: 'bob@x.com',
      status: 'pending',
      expiresAt: '2026-12-01',
    });
    renderAt('/signup?invite=t1&email=bob%40x.com');
    const emailInput = await screen.findByLabelText(/email/i);
    expect(emailInput).toHaveValue('bob@x.com');
    expect(emailInput).toBeDisabled();
    expect(await screen.findByRole('heading', { name: /Join Smith Family/ })).toBeInTheDocument();
  });

  it('sends inviteToken in submit body when present', async () => {
    (ApiClient.lookupInvitation as jest.Mock).mockResolvedValue({
      householdName: 'H',
      inviterName: 'A',
      email: 'b@x.com',
      status: 'pending',
      expiresAt: '2026-12-01',
    });
    (ApiClient.signup as jest.Mock).mockResolvedValue({
      user: { id: 'u', email: 'b@x.com', name: 'B', householdId: 'h' },
      household: { id: 'h', name: 'H' },
      token: 't',
    });
    renderAt('/signup?invite=t1&email=b%40x.com');
    await userEvent.type(await screen.findByLabelText(/name/i), 'B');
    await userEvent.type(screen.getByLabelText(/password/i), 'supersecret');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(ApiClient.signup).toHaveBeenCalledWith(
        expect.objectContaining({
          inviteToken: 't1',
          email: 'b@x.com',
          name: 'B',
        })
      )
    );
  });
});
