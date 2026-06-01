import React, { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { ApiClient } from '../../utils/apiClient';
import { useAuth } from '../../contexts/AuthContext';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  // Only allow relative paths to prevent open-redirect attacks.
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { setAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    ApiClient.getDemoConfig()
      .then((cfg) => {
        if (!cancelled) setDemoEnabled(!!cfg?.enabled);
      })
      .catch(() => {
        if (!cancelled) setDemoEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (demoEnabled) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user, household } = await ApiClient.login({ email, password });
      setAuth(user, household);
      navigate(next, { replace: true });
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('Invalid credentials')) {
        setError('Invalid email or password.');
      } else {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
      setSubmitting(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthLayout title="Sign in to Tally">
      <form onSubmit={onSubmit} noValidate>
        <div className="mb-4">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearError();
            }}
            required
            className="w-full px-3 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
          />
        </div>
        <div className="mb-4">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            required
            className="w-full px-3 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
          />
        </div>
        {error && (
          <div role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-sm text-center text-gray-600 dark:text-gray-400">
        Don't have an account?{' '}
        <Link
          to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
};
