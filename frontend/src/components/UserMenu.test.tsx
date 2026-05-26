import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { UserMenu } from './UserMenu';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ApiClient } from '../utils/apiClient';

jest.mock('../utils/apiClient', () => {
  const actual = jest.requireActual('../utils/apiClient');
  return {
    ...actual,
    ApiClient: {
      ...actual.ApiClient,
      logout: jest.fn().mockResolvedValue(undefined),
      setAuthToken: jest.fn(),
    },
  };
});

function Seed({ demoEnabled = false }: { demoEnabled?: boolean }) {
  const { setAuth } = useAuth();
  React.useEffect(() => {
    setAuth(
      { id: 'u1', name: 'Alice Example', email: 'alice@example.com', householdId: 'h1' },
      { id: 'h1', name: 'Alice Household' }
    );
  }, [setAuth]);
  return <UserMenu demoEnabled={demoEnabled} />;
}

function renderMenu(demoEnabled = false) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Seed demoEnabled={demoEnabled} />} />
          <Route path="/login" element={<div>LOGIN_PAGE</div>} />
          <Route path="/settings" element={<div>SETTINGS_PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('UserMenu', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders an avatar with the user initial', async () => {
    renderMenu();
    expect(await screen.findByRole('button', { name: /alice example/i })).toHaveTextContent('A');
  });

  it('opens dropdown showing name + email on click', async () => {
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: /alice example/i }));
    expect(screen.getByText('Alice Example')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('Settings link navigates to /settings', async () => {
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: /alice example/i }));
    await userEvent.click(screen.getByRole('link', { name: /settings/i }));
    expect(await screen.findByText('SETTINGS_PAGE')).toBeInTheDocument();
  });

  it('Sign out clears token + auth state and navigates to /login', async () => {
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: /alice example/i }));
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(ApiClient.setAuthToken).toHaveBeenCalledWith(null));
    expect(ApiClient.logout).toHaveBeenCalled();
    expect(await screen.findByText('LOGIN_PAGE')).toBeInTheDocument();
  });

  it('hides Sign out in demo mode', async () => {
    renderMenu(true);
    await userEvent.click(await screen.findByRole('button', { name: /alice example/i }));
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('closes on click outside', async () => {
    renderMenu();
    const trigger = await screen.findByRole('button', { name: /alice example/i });
    await userEvent.click(trigger);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    await userEvent.click(document.body);
    await waitFor(() => expect(screen.queryByText('alice@example.com')).not.toBeInTheDocument());
  });
});
