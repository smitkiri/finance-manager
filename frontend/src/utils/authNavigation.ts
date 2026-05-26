// ApiClient is a singleton outside React, so it cannot call useNavigate().
// AuthGuard registers a navigate function here on mount; ApiClient calls
// navigateToLogin() from its 401 interceptor. A redirect-in-progress flag
// prevents a burst of parallel 401s from queuing multiple navigations.

let navigateFn: ((path: string) => void) | null = null;
let redirectInProgress = false;

export function setAuthNavigator(fn: (path: string) => void): void {
  navigateFn = fn;
  redirectInProgress = false;
}

export function navigateToLogin(currentPath: string): void {
  if (!navigateFn || redirectInProgress) return;
  redirectInProgress = true;
  const next = encodeURIComponent(currentPath);
  navigateFn(`/login?next=${next}`);
}

// Used by AuthGuard remount and by tests. Not part of the public runtime API.
export function resetAuthNavigatorForTests(): void {
  navigateFn = null;
  redirectInProgress = false;
}
