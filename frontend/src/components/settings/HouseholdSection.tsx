import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../contexts/AuthContext';
import { ApiClient, AuthHousehold } from '../../utils/apiClient';
import type { Invitation, InvitationCreated, User as ApiUser } from '../../types';

interface HouseholdSectionProps {
  /** Demo mode disables every mutation in this section. */
  demoMode?: boolean;
}

export const HouseholdSection: React.FC<HouseholdSectionProps> = ({ demoMode = false }) => {
  const { currentUser, currentHousehold, setAuth } = useAuth();
  if (!currentUser || !currentHousehold) return null;
  return (
    <section className="space-y-8">
      <RenameBlock
        household={currentHousehold}
        onSaved={(h) => setAuth(currentUser, h)}
        disabled={demoMode}
      />
      <MembersBlock
        currentUserId={currentUser.id}
        onLeftHousehold={() => {
          ApiClient.logout().catch(() => {});
          ApiClient.setAuthToken(null);
          setAuth(null, null);
        }}
        disabled={demoMode}
      />
      <InvitationsBlock disabled={demoMode} />
    </section>
  );
};

// ---------------------------------------------------------------------------
// Rename block
// ---------------------------------------------------------------------------

interface RenameBlockProps {
  household: AuthHousehold;
  onSaved: (h: AuthHousehold) => void;
  disabled: boolean;
}

const RenameBlock: React.FC<RenameBlockProps> = ({ household, onSaved, disabled }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(household.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Household name</h3>
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <span className="text-gray-900 dark:text-white">{household.name}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={disabled}
            className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Name cannot be empty');
      return;
    }
    if (trimmed.length > 100) {
      setError('Name must be 100 characters or fewer');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await ApiClient.renameHousehold(household.id, trimmed);
      onSaved(updated);
      setEditing(false);
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Household name</h3>
      <label className="block">
        <span className="sr-only">Household name</span>
        <input
          aria-label="Household name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(household.name);
            setError(null);
          }}
          className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Members block (leave / remove)
// ---------------------------------------------------------------------------

interface MembersBlockProps {
  currentUserId: string;
  onLeftHousehold: () => void;
  disabled: boolean;
}

const MembersBlock: React.FC<MembersBlockProps> = ({
  currentUserId,
  onLeftHousehold,
  disabled,
}) => {
  const navigate = useNavigate();
  const [members, setMembers] = useState<ApiUser[] | null>(null);
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await ApiClient.loadUsers();
    setMembers(list);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (members === null) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Members</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading members…</p>
      </div>
    );
  }

  const onConfirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await ApiClient.removeMember(pending.id);
      if (pending.id === currentUserId) {
        onLeftHousehold();
        navigate('/login', { replace: true });
        return;
      }
      await refresh();
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Members</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-600 dark:text-gray-400">
            <th className="py-2">Name</th>
            <th className="py-2">Email</th>
            <th className="py-2 text-right" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-t border-gray-200 dark:border-gray-800">
              <td className="py-2 text-gray-900 dark:text-white">{m.name}</td>
              <td className="py-2 text-gray-700 dark:text-gray-300">{m.email}</td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setPending({ id: m.id, name: m.name })}
                  className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {m.id === currentUserId ? 'Leave household' : 'Remove'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pending ? (
        <div
          role="dialog"
          aria-modal="true"
          className="mt-4 p-4 border border-red-200 dark:border-red-900 rounded-lg bg-red-50 dark:bg-red-950/40"
        >
          <p className="text-sm text-red-900 dark:text-red-200 mb-3">
            {pending.id === currentUserId
              ? `Leave this household? You'll be moved to a new empty household. Other members keep access to all household data.`
              : `Remove ${pending.name} from this household? They'll be moved to their own empty household. This cannot be undone.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {busy ? 'Working…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Invitations block
// ---------------------------------------------------------------------------

interface InvitationsBlockProps {
  disabled: boolean;
}

const InvitationsBlock: React.FC<InvitationsBlockProps> = ({ disabled }) => {
  const [invites, setInvites] = useState<Invitation[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [shareModal, setShareModal] = useState<InvitationCreated | null>(null);

  const refresh = useCallback(async () => {
    const list = await ApiClient.listInvitations();
    setInvites(list);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const created = await ApiClient.createInvitation({ email });
      setShareModal(created);
      setEmail('');
      await refresh();
    } catch (err) {
      const s = (err as Error & { status?: number }).status;
      setError(
        s === 409
          ? 'That user is already a member.'
          : s === 400
            ? "You can't invite yourself."
            : 'Could not send invite. Try again.'
      );
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (id: string) => {
    await ApiClient.revokeInvitation(id);
    await refresh();
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Invitations</h3>

      {invites === null ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-left text-gray-600 dark:text-gray-400">
              <th className="py-2">Email</th>
              <th className="py-2">Invited by</th>
              <th className="py-2">Created</th>
              <th className="py-2">Expires</th>
              <th className="py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-2 text-gray-500 dark:text-gray-400 text-center">
                  No pending invitations.
                </td>
              </tr>
            ) : (
              invites.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="py-2 text-gray-900 dark:text-white">{inv.email}</td>
                  <td className="py-2 text-gray-700 dark:text-gray-300">
                    {inv.invitedBy?.name ?? '—'}
                  </td>
                  <td className="py-2 text-gray-700 dark:text-gray-300">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-gray-700 dark:text-gray-300">
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRevoke(inv.id)}
                      disabled={disabled}
                      className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      <form onSubmit={onCreate} className="flex flex-col sm:flex-row gap-2">
        <label className="flex-1">
          <span className="sr-only">Email</span>
          <input
            aria-label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email to invite"
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-950 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </label>
        <button
          type="submit"
          disabled={creating || disabled}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {creating ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {shareModal ? (
        <ShareLinkModal invite={shareModal} onClose={() => setShareModal(null)} />
      ) : null}
    </div>
  );
};

const ShareLinkModal: React.FC<{
  invite: InvitationCreated;
  onClose: () => void;
}> = ({ invite, onClose }) => {
  const link = `${window.location.origin}/accept-invite?token=${invite.token}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard may be unavailable in older browsers — surface the link
      // for manual copy.
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Invite sent</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          Share this link with <strong>{invite.email}</strong>. It expires on{' '}
          {new Date(invite.expiresAt).toLocaleDateString()}.
        </p>
        <code className="block px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-900 dark:text-gray-100 break-all mb-4">
          {link}
        </code>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={copy}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
