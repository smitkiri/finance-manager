import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '../../contexts/AuthContext';
import { ApiClient } from '../../utils/apiClient';

jest.mock('../../utils/apiClient', () => {
  const actual = jest.requireActual('../../utils/apiClient');
  return {
    ...actual,
    ApiClient: {
      ...actual.ApiClient,
      login: jest.fn(),
      getDemoConfig: jest.fn().mockResolvedValue({ enabled: false }),
      setAuthToken: jest.fn(),
      getAuthToken: jest.fn().mockReturnValue(null),
    },
  };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<div>SIGNUP_PAGE</div>} />
          <Route path="/" element={<div>HOME</div>} />
          <Route path="/transactions" element={<div>TX_PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the login form', async () => {
    renderAt('/login');
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('calls ApiClient.login on submit and navigates home on success', async () => {
    (ApiClient.login as jest.Mock).mockResolvedValueOnce({
      token: 'tok',
      user: { id: 'u1', name: 'A', email: 'a@b.c', householdId: 'h1' },
      household: { id: 'h1', name: 'H' },
    });
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@b.c');
    await userEvent.type(screen.getByLabelText(/password/i), 'password1');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() =>
      expect(ApiClient.login).toHaveBeenCalledWith({ email: 'a@b.c', password: 'password1' })
    );
    expect(ApiClient.setAuthToken).toHaveBeenCalledWith('tok');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });

  it('navigates to ?next= target on success', async () => {
    (ApiClient.login as jest.Mock).mockResolvedValueOnce({
      token: 'tok',
      user: { id: 'u1', name: 'A', email: 'a@b.c', householdId: 'h1' },
      household: { id: 'h1', name: 'H' },
    });
    renderAt('/login?next=%2Ftransactions');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@b.c');
    await userEvent.type(screen.getByLabelText(/password/i), 'password1');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('TX_PAGE')).toBeInTheDocument();
  });

  it('ignores an absolute-URL next param', async () => {
    (ApiClient.login as jest.Mock).mockResolvedValueOnce({
      token: 'tok',
      user: { id: 'u1', name: 'A', email: 'a@b.c', householdId: 'h1' },
      household: { id: 'h1', name: 'H' },
    });
    renderAt('/login?next=https%3A%2F%2Fevil.example.com');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@b.c');
    await userEvent.type(screen.getByLabelText(/password/i), 'password1');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });

  it('shows "Invalid email or password" on 401', async () => {
    (ApiClient.login as jest.Mock).mockRejectedValueOnce(
      new Error('{"detail":"Invalid credentials"}')
    );
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@b.c');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
  });

  it('shows network error message when fetch throws', async () => {
    (ApiClient.login as jest.Mock).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@b.c');
    await userEvent.type(screen.getByLabelText(/password/i), 'password1');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
  });

  it('clears error when the user types again', async () => {
    (ApiClient.login as jest.Mock).mockRejectedValueOnce(
      new Error('{"detail":"Invalid credentials"}')
    );
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText(/email/i), 'a@b.c');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/password/i), 'x');
    expect(screen.queryByText(/invalid email or password/i)).not.toBeInTheDocument();
  });

  it('has a link to /signup', async () => {
    renderAt('/login');
    const link = await screen.findByRole('link', { name: /sign up/i });
    await userEvent.click(link);
    expect(await screen.findByText('SIGNUP_PAGE')).toBeInTheDocument();
  });

  it('redirects to / when demo mode is enabled', async () => {
    (ApiClient.getDemoConfig as jest.Mock).mockResolvedValueOnce({ enabled: true });
    renderAt('/login');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });
});
