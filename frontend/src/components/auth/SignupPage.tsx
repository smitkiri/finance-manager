import React, { useState, useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { ApiClient } from '../../utils/apiClient';
import { useAuth } from '../../contexts/AuthContext';
import type { InvitationLookup } from '../../types';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const inviteToken = params.get('invite');
  const prefillEmail = params.get('email');
  const { setAuth } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState<boolean | null>(null);
  const [inviteInfo, setInviteInfo] = useState<InvitationLookup | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!inviteToken) return undefined;
    let cancelled = false;
    ApiClient.lookupInvitation(inviteToken)
      .then((data) => {
        if (!cancelled) setInviteInfo(data);
      })
      .catch((err: { status?: number; body?: { status?: string } }) => {
        if (cancelled) return;
        if (err.status === 410) {
          setInviteError('This invite is no longer valid.');
        } else {
          setInviteError('This invite link is invalid.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

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
      const { user, household } = await ApiClient.signup({
        name,
        email,
        password,
        inviteToken: inviteToken ?? undefined,
      });
      setAuth(user, household);
      navigate(next, { replace: true });
    } catch (err) {
      const msg = (err as Error).message || '';
      const status = (err as Error & { status?: number }).status;
      if (status === 410 || msg.includes('invite is no longer valid')) {
        setError('This invite is no longer valid. Ask the sender for a new one.');
        setSubmitting(false);
        return;
      }
      if (status === 403 || msg.includes('different email')) {
        setError('This invite is for a different email address.');
        setSubmitting(false);
        return;
      }
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

  const title = inviteInfo ? `Join ${inviteInfo.householdName}` : 'Create your Tally account';

  return (
    <AuthLayout title={title}>
      {inviteInfo && !inviteError ? (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg text-sm text-blue-900 dark:text-blue-200">
          You&apos;re joining <strong>{inviteInfo.householdName}</strong>
          {inviteInfo.inviterName ? (
            <>
              {' '}
              invited by <strong>{inviteInfo.inviterName}</strong>
            </>
          ) : null}
          .
        </div>
      ) : null}
      {inviteError ? (
        <div role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {inviteError}
        </div>
      ) : null}
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
            disabled={!!prefillEmail}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
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
