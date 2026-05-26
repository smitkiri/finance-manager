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
      getDemoConfig: jest.fn(),
      getAuthToken: jest.fn(),
      setAuthToken: jest.fn(),
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

  it('shows loading while resolving', async () => {
    (ApiClient.getDemoConfig as jest.Mock).mockResolvedValue({ enabled: false });
    (ApiClient.getAuthToken as jest.Mock).mockReturnValue('tok');
    (ApiClient.getMe as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // never resolves
    );
    renderAt('/');
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
  });

  it('renders children with currentUser when /auth/me succeeds', async () => {
    (ApiClient.getDemoConfig as jest.Mock).mockResolvedValue({ enabled: false });
    (ApiClient.getAuthToken as jest.Mock).mockReturnValue('tok');
    (ApiClient.getMe as jest.Mock).mockResolvedValue({
      user: { id: 'u1', name: 'Alice', email: 'a@b.c', householdId: 'h1' },
      household: { id: 'h1', name: 'Alice Household' },
    });
    renderAt('/');
    expect(await screen.findByText('INNER user=Alice')).toBeInTheDocument();
  });

  it('redirects to /login?next=<path> when no token', async () => {
    (ApiClient.getDemoConfig as jest.Mock).mockResolvedValue({ enabled: false });
    (ApiClient.getAuthToken as jest.Mock).mockReturnValue(null);
    renderAt('/transactions');
    expect(await screen.findByText('LOGIN_PAGE')).toBeInTheDocument();
  });

  it('clears token and redirects on /auth/me 401', async () => {
    (ApiClient.getDemoConfig as jest.Mock).mockResolvedValue({ enabled: false });
    (ApiClient.getAuthToken as jest.Mock).mockReturnValue('tok');
    (ApiClient.getMe as jest.Mock).mockRejectedValue(new Error('401'));
    renderAt('/transactions');
    expect(await screen.findByText('LOGIN_PAGE')).toBeInTheDocument();
    expect(ApiClient.setAuthToken).toHaveBeenCalledWith(null);
  });

  it('skips token check in demo mode and renders children', async () => {
    (ApiClient.getDemoConfig as jest.Mock).mockResolvedValue({ enabled: true });
    (ApiClient.getAuthToken as jest.Mock).mockReturnValue(null);
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
