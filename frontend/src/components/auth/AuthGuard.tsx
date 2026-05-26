import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiClient } from '../../utils/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import { setAuthNavigator } from '../../utils/authNavigation';

interface AuthGuardProps {
  children: React.ReactNode;
}

type Status = 'checking' | 'authed' | 'unauthed';

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { currentUser, setAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<Status>(currentUser ? 'authed' : 'checking');

  // Register the navigate callback so ApiClient's 401 interceptor can call it.
  useEffect(() => {
    setAuthNavigator((path) => navigate(path));
  }, [navigate]);

  useEffect(() => {
    if (currentUser) {
      setStatus('authed');
      return;
    }
    let cancelled = false;
    (async () => {
      let isDemo = false;
      try {
        const cfg = await ApiClient.getDemoConfig();
        isDemo = !!cfg?.enabled;
      } catch {
        // Probe failure is non-fatal; fall through to the token check.
      }
      if (!isDemo && !ApiClient.getAuthToken()) {
        if (!cancelled) setStatus('unauthed');
        return;
      }
      try {
        const me = await ApiClient.getMe();
        if (cancelled) return;
        setAuth(me.user, me.household);
        setStatus('authed');
      } catch {
        if (cancelled) return;
        ApiClient.setAuthToken(null);
        setStatus('unauthed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, setAuth]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  if (status === 'unauthed') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
};
