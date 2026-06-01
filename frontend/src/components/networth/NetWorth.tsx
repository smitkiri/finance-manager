import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { Account, NetWorthSummary, NetWorthHistory, User } from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { Sheet } from '../ui/Sheet';
import { NetWorthKpis } from './NetWorthKpis';
import { AccountList, UserGroup } from './AccountList';
import { BalanceChart } from './BalanceChart';

interface NetWorthProps {
  selectedUserId: string | null;
  users: User[];
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Modal for adding a balance entry
interface BalanceModalProps {
  account: Account;
  onClose: () => void;
  onSave: (balance: number, date: string, note?: string) => void;
}

function formatBalanceInput(raw: string): string {
  // Strip everything except digits and the first decimal point
  let cleaned = raw.replace(/[^\d.]/g, '');
  const dotIndex = cleaned.indexOf('.');
  if (dotIndex !== -1) {
    // Keep only the first decimal point, limit to 2 decimal places
    cleaned =
      cleaned.slice(0, dotIndex + 1) +
      cleaned
        .slice(dotIndex + 1)
        .replace(/\./g, '')
        .slice(0, 2);
  }
  const [intPart = '', decPart] = cleaned.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
}

const BalanceModal: React.FC<BalanceModalProps> = ({ account, onClose, onSave }) => {
  const today = new Date().toISOString().split('T')[0];
  const [displayBalance, setDisplayBalance] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayBalance(formatBalanceInput(e.target.value));
  };

  const numericBalance = parseFloat(displayBalance.replace(/,/g, ''));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(numericBalance) || !date) return;
    onSave(numericBalance, date, note.trim() || undefined);
  };

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={`Update Balance — ${account.name}`}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="balance-form"
            disabled={!displayBalance || isNaN(numericBalance) || !date}
            className="flex-1 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save
          </button>
        </div>
      }
    >
      <form id="balance-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Balance ($)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={displayBalance}
            onChange={handleBalanceChange}
            placeholder="0.00"
            className="w-full px-3 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Monthly snapshot"
            className="w-full px-3 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </form>
    </Sheet>
  );
};

// Modal for bulk-updating balances across all manual accounts
interface BulkBalanceModalProps {
  accounts: Account[];
  users: User[];
  onClose: () => void;
  onSave: (entries: { accountId: string; balance: number }[], date: string, note?: string) => void;
}

const BulkBalanceModal: React.FC<BulkBalanceModalProps> = ({
  accounts,
  users,
  onClose,
  onSave,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [balances, setBalances] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      accounts.map((a) => [
        a.id,
        a.currentBalance !== undefined && a.currentBalance !== 0
          ? formatBalanceInput(a.currentBalance.toFixed(2))
          : '',
      ])
    )
  );

  const handleBalanceChange = (accountId: string, value: string) => {
    setBalances((prev) => ({ ...prev, [accountId]: formatBalanceInput(value) }));
  };

  const entries = accounts
    .map((a) => ({ accountId: a.id, raw: balances[a.id] ?? '' }))
    .filter((e) => e.raw.trim() !== '')
    .map((e) => ({ accountId: e.accountId, balance: parseFloat(e.raw.replace(/,/g, '')) }))
    .filter((e) => !isNaN(e.balance));

  const anyInvalid = accounts.some((a) => {
    const raw = (balances[a.id] ?? '').trim();
    if (raw === '') return false;
    return isNaN(parseFloat(raw.replace(/,/g, '')));
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (entries.length === 0 || anyInvalid || !date) return;
    onSave(entries, date, note.trim() || undefined);
  };

  // Group accounts by user, preserving user order
  const userGroups = users
    .map((u) => ({ user: u, accounts: accounts.filter((a) => a.userId === u.id) }))
    .filter((g) => g.accounts.length > 0);
  const showUserHeaders = userGroups.length > 1;

  const renderAccountRow = (account: Account) => (
    <div
      key={account.id}
      className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0"
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">
          {account.name}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {account.type === 'asset' ? 'Asset' : 'Liability'}
        </span>
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={balances[account.id] ?? ''}
        onChange={(e) => handleBalanceChange(account.id, e.target.value)}
        placeholder="skip"
        className="w-32 sm:w-36 px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title="Update All Balances"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="bulk-balance-form"
            disabled={entries.length === 0 || anyInvalid || !date}
            className="flex-1 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {entries.length > 0
              ? `Save ${entries.length} balance${entries.length !== 1 ? 's' : ''}`
              : 'Save'}
          </button>
        </div>
      }
    >
      <form id="bulk-balance-form" onSubmit={handleSubmit} className="space-y-4">
        {/* Date + Note */}
        <div className="flex flex-col sm:flex-row gap-3 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
              Note
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional"
              className="w-full px-3 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Account rows */}
        <div>
          {showUserHeaders
            ? userGroups.map(({ user, accounts: groupAccounts }) => (
                <div key={user.id} className="mb-4 last:mb-0">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide pt-2 pb-1">
                    {user.name}
                  </p>
                  {groupAccounts.map(renderAccountRow)}
                </div>
              ))
            : accounts.map(renderAccountRow)}
        </div>
      </form>
    </Sheet>
  );
};

export const NetWorth: React.FC<NetWorthProps> = ({ selectedUserId, users }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<NetWorthSummary | null>(null);
  const [history, setHistory] = useState<NetWorthHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [tellerEnabled, setTellerEnabled] = useState(false);
  const [tellerConnected, setTellerConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [balanceAccount, setBalanceAccount] = useState<Account | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accts, sum, hist] = await Promise.all([
        ApiClient.loadAccounts(selectedUserId),
        ApiClient.loadNetWorthSummary(selectedUserId),
        ApiClient.loadNetWorthHistory(selectedUserId),
      ]);

      // Fetch the current balance for each account (most recent)
      const accountsWithBalances: Account[] = await Promise.all(
        accts.map(async (acct) => {
          const balances = await ApiClient.loadAccountBalances(acct.id);
          return {
            ...acct,
            currentBalance: balances[0]?.balance ?? 0,
            previousBalance: balances[1]?.balance,
          };
        })
      );

      setAccounts(accountsWithBalances);
      setSummary(sum);
      setHistory(hist);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    ApiClient.getTellerConfig().then((config) => {
      setTellerEnabled(config.enabled);
      setTellerConnected((config.enrollments?.length ?? 0) > 0);
    });
  }, []);

  const handleRefreshBalances = async () => {
    setRefreshing(true);
    try {
      const result = await ApiClient.tellerRefreshBalances();
      if (result.refreshed > 0) {
        toast.success(
          `Refreshed ${result.refreshed} account balance${result.refreshed !== 1 ? 's' : ''}`,
          { position: 'bottom-right', autoClose: 3000 }
        );
      }
      if (result.reconnectRequired && result.reconnectRequired.length > 0) {
        toast.error(
          `${result.reconnectRequired.join(', ')} need${result.reconnectRequired.length === 1 ? 's' : ''} to be reconnected in Settings`,
          { position: 'bottom-right', autoClose: 6000 }
        );
      } else if (result.refreshed === 0) {
        toast.success('Balances are up to date', { position: 'bottom-right', autoClose: 3000 });
      }
      await loadData();
    } catch {
      toast.error('Failed to refresh balances', { position: 'bottom-right', autoClose: 3000 });
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddBalance = async (amount: number, date: string, note?: string) => {
    if (!balanceAccount) return;
    try {
      await ApiClient.addAccountBalance(balanceAccount.id, {
        id: generateId(),
        accountId: balanceAccount.id,
        balance: amount,
        date,
        note,
        createdAt: new Date().toISOString(),
      });
      setBalanceAccount(null);
      // Refresh all data to get updated balances, summary and history
      await loadData();
      toast.success('Balance updated', { position: 'bottom-right', autoClose: 3000 });
    } catch {
      toast.error('Failed to update balance', { position: 'bottom-right', autoClose: 3000 });
    }
  };

  const handleBulkSave = async (
    entries: { accountId: string; balance: number }[],
    date: string,
    note?: string
  ) => {
    for (const { accountId, balance } of entries) {
      await ApiClient.addAccountBalance(accountId, {
        id: generateId(),
        accountId,
        balance,
        date,
        note,
        createdAt: new Date().toISOString(),
      });
    }
    setShowBulkModal(false);
    await loadData();
    toast.success(`Updated ${entries.length} account balance${entries.length !== 1 ? 's' : ''}`, {
      position: 'bottom-right',
      autoClose: 3000,
    });
  };

  const manualAccounts = accounts.filter((a) => !a.tellerAccountId);

  // Find the history entry closest to 1 month ago
  const oneMonthAgoNetWorth = (() => {
    if (history.length === 0) return null;
    const target = new Date();
    target.setMonth(target.getMonth() - 1);
    const targetMs = target.getTime();
    const closest = history.reduce((best, h) => {
      const hMs = new Date(h.date).getTime();
      const bestMs = new Date(best.date).getTime();
      return Math.abs(hMs - targetMs) < Math.abs(bestMs - targetMs) ? h : best;
    });
    // Only use it if it's within 2 weeks of the target (avoid showing stale data)
    const diffDays = Math.abs(new Date(closest.date).getTime() - targetMs) / (1000 * 60 * 60 * 24);
    return diffDays <= 14 ? closest.netWorth : null;
  })();

  const netWorthChange =
    oneMonthAgoNetWorth !== null ? (summary?.netWorth ?? 0) - oneMonthAgoNetWorth : null;

  // When a single user is selected, show flat assets/liabilities lists.
  // When "All Users" is selected, group accounts per user.
  const userGroups: UserGroup[] =
    selectedUserId !== null
      ? [
          {
            user: users.find((u) => u.id === selectedUserId) ?? null,
            assets: accounts.filter((a) => a.type === 'asset'),
            liabilities: accounts.filter((a) => a.type === 'liability'),
          },
        ]
      : users
          .map((user) => ({
            user,
            assets: accounts.filter((a) => a.userId === user.id && a.type === 'asset'),
            liabilities: accounts.filter((a) => a.userId === user.id && a.type === 'liability'),
          }))
          .filter((g) => g.assets.length > 0 || g.liabilities.length > 0);

  const showUserHeaders = selectedUserId === null && userGroups.length > 1;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Net Worth</h2>
        {(tellerEnabled && tellerConnected) || manualAccounts.length >= 2 ? (
          <div className="flex flex-wrap items-center gap-2">
            {tellerEnabled && tellerConnected && (
              <button
                onClick={handleRefreshBalances}
                disabled={refreshing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-0 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium disabled:opacity-50"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                Refresh Balances
              </button>
            )}
            {manualAccounts.length >= 2 && (
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 min-h-[44px] sm:min-h-0 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm font-medium"
              >
                Update All
              </button>
            )}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <NetWorthKpis
            summary={summary}
            netWorthChange={netWorthChange}
            formatCurrency={formatCurrency}
          />

          {/* Net worth history chart */}
          <BalanceChart history={history} formatCurrency={formatCurrency} formatDate={formatDate} />

          {/* Accounts sections — flat when one user selected, grouped per user otherwise */}
          <AccountList
            accounts={accounts}
            userGroups={userGroups}
            showUserHeaders={showUserHeaders}
            summary={summary}
            onUpdateBalance={setBalanceAccount}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
          />
        </>
      )}

      {/* Add Balance Modal */}
      {balanceAccount && (
        <BalanceModal
          account={balanceAccount}
          onClose={() => setBalanceAccount(null)}
          onSave={handleAddBalance}
        />
      )}

      {/* Bulk Balance Modal */}
      {showBulkModal && (
        <BulkBalanceModal
          accounts={manualAccounts}
          users={users}
          onClose={() => setShowBulkModal(false)}
          onSave={handleBulkSave}
        />
      )}
    </div>
  );
};
