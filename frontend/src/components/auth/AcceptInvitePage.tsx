import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../../contexts/AuthContext';
import { ApiClient } from '../../utils/apiClient';
import type { HouseholdSummary, InvitationLookup } from '../../types';
import { AuthLayout } from './AuthLayout';

type LookupState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'inactive'; status: 'revoked' | 'consumed' | 'expired' }
  | { kind: 'ok'; data: InvitationLookup };

export const AcceptInvitePage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { currentUser, setAuth } = useAuth();

  const [lookup, setLookup] = useState<LookupState>({ kind: 'loading' });
  const [summary, setSummary] = useState<HouseholdSummary | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLookup({ kind: 'not_found' });
      return undefined;
    }
    ApiClient.lookupInvitation(token)
      .then((data) => {
        if (!cancelled) setLookup({ kind: 'ok', data });
      })
      .catch((err: { status?: number; body?: { status?: string } }) => {
        if (cancelled) return;
        if (err.status === 410 && err.body?.status) {
          setLookup({
            kind: 'inactive',
            status: err.body.status as 'revoked' | 'consumed' | 'expired',
          });
        } else {
          setLookup({ kind: 'not_found' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (lookup.kind !== 'ok' || !currentUser) return;
    if (currentUser.email.toLowerCase() !== lookup.data.email.toLowerCase()) return;
    let cancelled = false;
    ApiClient.getHouseholdSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lookup, currentUser]);

  if (lookup.kind === 'loading') {
    return (
      <AuthLayout title="Loading invitation">
        <p className="text-gray-600 dark:text-gray-400">Loading…</p>
      </AuthLayout>
    );
  }

  if (lookup.kind === 'not_found') {
    return (
      <AuthLayout title="Invite invalid">
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          This invite link is invalid. Ask the person who invited you to send a new one.
        </p>
        <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  if (lookup.kind === 'inactive') {
    const msg = {
      revoked: 'This invite has been revoked.',
      consumed: 'This invite has already been used.',
      expired: 'This invite has expired.',
    }[lookup.status];
    return (
      <AuthLayout title="Invite no longer valid">
        <p className="text-gray-700 dark:text-gray-300 mb-4">{msg}</p>
        <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  const data = lookup.data;

  // Signed-out: send through signup (with prefilled email) or sign-in (with
  // return-to-accept-invite).
  if (!currentUser) {
    const signupHref = `/signup?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(data.email)}`;
    const loginHref = `/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`;
    return (
      <AuthLayout title={`Join ${data.householdName}`}>
        <p className="text-gray-700 dark:text-gray-300 mb-6">
          You&apos;ve been invited to <strong>{data.householdName}</strong>
          {data.inviterName ? (
            <>
              {' '}
              by <strong>{data.inviterName}</strong>
            </>
          ) : null}
          .
        </p>
        <div className="flex flex-col gap-3">
          <Link to={signupHref}>
            <button
              type="button"
              className="w-full px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create account
            </button>
          </Link>
          <Link to={loginHref}>
            <button
              type="button"
              className="w-full px-4 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Sign in
            </button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // Signed-in with a different email — must sign out first.
  if (currentUser.email.toLowerCase() !== data.email.toLowerCase()) {
    const onSignOut = async () => {
      ApiClient.logout().catch(() => {});
      setAuth(null, null);
      navigate(`/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`, {
        replace: true,
      });
    };
    return (
      <AuthLayout title="Email mismatch">
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          This invite is for <strong>{data.email}</strong>, but you&apos;re signed in as{' '}
          <strong>{currentUser.email}</strong>. Sign out and try again.
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Sign out
        </button>
      </AuthLayout>
    );
  }

  // Destructive-accept confirm (signed-in, matching email).
  const isEmpty = summary && Object.values(summary).every((v) => v === 0);

  const onConfirm = async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await ApiClient.acceptInvitation(token);
      setAuth(res.user, res.household);
      navigate('/');
    } catch {
      setError('Could not accept the invite. Please try again.');
      setAccepting(false);
    }
  };

  return (
    <AuthLayout title={`Join ${data.householdName}?`}>
      {summary === null ? (
        <p className="text-gray-600 dark:text-gray-400 mb-4">Loading your household details…</p>
      ) : (
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          {isEmpty
            ? `Joining ${data.householdName} will discard your current (empty) household.`
            : `Joining will permanently delete ${summary.transactions} transactions, ${summary.accounts} accounts, ${summary.categories} categories, ${summary.dashboards} dashboards, and ${summary.reports} reports from your current household.`}
        </p>
      )}
      {error ? (
        <div role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={accepting || summary === null}
          className="w-full px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {accepting ? 'Joining…' : 'Join household'}
        </button>
        <Link to="/">
          <button
            type="button"
            className="w-full px-4 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </Link>
      </div>
    </AuthLayout>
  );
};
