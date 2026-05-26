import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { AuthUser, AuthHousehold } from '../utils/apiClient';

const fakeUser: AuthUser = {
  id: 'u1',
  name: 'Alice',
  email: 'alice@example.com',
  householdId: 'h1',
};
const fakeHousehold: AuthHousehold = { id: 'h1', name: "Alice's Household" };

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="user-name">{auth.currentUser?.name ?? 'none'}</div>
      <div data-testid="household-name">{auth.currentHousehold?.name ?? 'none'}</div>
      <button onClick={() => auth.setAuth(fakeUser, fakeHousehold)}>set</button>
      <button onClick={() => auth.setAuth(null, null)}>clear</button>
    </div>
  );
}

describe('AuthContext', () => {
  it('renders null user/household by default', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByTestId('user-name')).toHaveTextContent('none');
    expect(screen.getByTestId('household-name')).toHaveTextContent('none');
  });

  it('updates when setAuth is called', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    act(() => {
      screen.getByText('set').click();
    });
    expect(screen.getByTestId('user-name')).toHaveTextContent('Alice');
    expect(screen.getByTestId('household-name')).toHaveTextContent("Alice's Household");
  });

  it('clears when setAuth(null, null) is called', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    act(() => screen.getByText('set').click());
    act(() => screen.getByText('clear').click());
    expect(screen.getByTestId('user-name')).toHaveTextContent('none');
  });

  it('throws when useAuth is called outside the provider', () => {
    // suppress React's console.error for this expected throw
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/useAuth must be used within an AuthProvider/);
    spy.mockRestore();
  });
});
