import React, { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { ApiClient } from '../../utils/apiClient';
import { useAuth } from '../../contexts/AuthContext';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { setAuth } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<React.ReactNode | null>(null);
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

  const passwordOk = password.length >= 8;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!passwordOk) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const { token, user, household } = await ApiClient.signup({ name, email, password });
      ApiClient.setAuthToken(token);
      setAuth(user, household);
      navigate(next, { replace: true });
    } catch (err) {
      const msg = (err as Error).message || '';
      if (msg.includes('Email already registered')) {
        setError(
          <>
            An account with this email already exists.{' '}
            <Link
              to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Sign in instead
            </Link>
          </>
        );
      } else if (msg.includes('Disabled in demo mode')) {
        setError('Signup is disabled in this environment.');
      } else {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
      setSubmitting(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthLayout title="Create your Tally account">
      <form onSubmit={onSubmit} noValidate>
        <div className="mb-4">
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Name
          </label>
          <input
            id="name"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError();
            }}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
          />
        </div>
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
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearError();
            }}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
          />
          <p
            className={`mt-1 text-xs ${
              password.length === 0
                ? 'text-gray-500'
                : passwordOk
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-500'
            }`}
          >
            At least 8 characters.
          </p>
        </div>
        {error && (
          <div role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-sm text-center text-gray-600 dark:text-gray-400">
        Already have an account?{' '}
        <Link
          to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
};
