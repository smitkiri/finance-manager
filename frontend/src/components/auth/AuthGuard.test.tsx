import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { ApiClient } from '../../utils/apiClient';

jest.mock('../../utils/apiClient', () => {
  const actual = jest.requireActual('../../utils/apiClient');
  return {
    ...actual,
    ApiClient: {
      ...actual.ApiClient,
      getMe: jest.fn(),
    },
  };
});

function Inner() {
  const { currentUser } = useAuth();
  return <div>INNER user={currentUser?.name ?? 'none'}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/*"
            element={
              <AuthGuard>
                <Inner />
              </AuthGuard>
            }
          />
          <Route path="/login" element={<div>LOGIN_PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AuthGuard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows loading while /auth/me is in flight', async () => {
    (ApiClient.getMe as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    renderAt('/');
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
  });

  it('renders children with currentUser when /auth/me succeeds', async () => {
    (ApiClient.getMe as jest.Mock).mockResolvedValue({
      user: { id: 'u1', name: 'Alice', email: 'a@b.c', householdId: 'h1' },
      household: { id: 'h1', name: 'Alice Household' },
    });
    renderAt('/');
    expect(await screen.findByText('INNER user=Alice')).toBeInTheDocument();
  });

  it('redirects to /login?next=<path> when /auth/me rejects (no cookie)', async () => {
    (ApiClient.getMe as jest.Mock).mockRejectedValue(new Error('401'));
    renderAt('/transactions');
    expect(await screen.findByText('LOGIN_PAGE')).toBeInTheDocument();
  });

  it('returns the demo user in demo mode (backend short-circuits /me without auth)', async () => {
    (ApiClient.getMe as jest.Mock).mockResolvedValue({
      user: {
        id: 'demo-user',
        name: 'Demo',
        email: 'demo@tally.local',
        householdId: 'household-demo',
      },
      household: { id: 'household-demo', name: 'Demo' },
    });
    renderAt('/');
    expect(await screen.findByText('INNER user=Demo')).toBeInTheDocument();
  });
});
