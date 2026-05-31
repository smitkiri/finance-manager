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
      // With the JWT now living in an HttpOnly cookie there's nothing to
      // probe client-side — we just ask the server "who am I?" and let the
      // 200/401 split decide. The demo-config probe is gone too: in demo
      // mode the backend returns the demo user from /me without auth.
      try {
        const me = await ApiClient.getMe();
        if (cancelled) return;
        setAuth(me.user, me.household);
        setStatus('authed');
      } catch {
        if (cancelled) return;
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
