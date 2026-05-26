import { setAuthNavigator, navigateToLogin, resetAuthNavigatorForTests } from './authNavigation';

describe('authNavigation', () => {
  beforeEach(() => {
    resetAuthNavigatorForTests();
  });

  it('calls the registered navigator with /login?next=<encoded path>', () => {
    const navigate = jest.fn();
    setAuthNavigator(navigate);
    navigateToLogin('/transactions?search=foo');
    expect(navigate).toHaveBeenCalledWith('/login?next=%2Ftransactions%3Fsearch%3Dfoo');
  });

  it('is a no-op when no navigator is registered', () => {
    expect(() => navigateToLogin('/anywhere')).not.toThrow();
  });

  it('only triggers once until reset (guards against parallel 401 bursts)', () => {
    const navigate = jest.fn();
    setAuthNavigator(navigate);
    navigateToLogin('/a');
    navigateToLogin('/b');
    navigateToLogin('/c');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('allows a second navigation after reset (e.g., after the user signs back in)', () => {
    const navigate = jest.fn();
    setAuthNavigator(navigate);
    navigateToLogin('/a');
    resetAuthNavigatorForTests(); // simulates remounting AuthGuard after sign-in
    setAuthNavigator(navigate);
    navigateToLogin('/b');
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
