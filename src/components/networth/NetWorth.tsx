import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Trash2, X, ChevronDown, ChevronUp, History, ExternalLink, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'react-toastify';
import { Account, AccountBalance, NetWorthSummary, NetWorthHistory, User } from '../../types';
import { LocalStorage } from '../../utils/storage';

interface NetWorthProps {
  selectedUserId: string | null;
  users: User[];
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
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
    cleaned = cleaned.slice(0, dotIndex + 1) + cleaned.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2);
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Update Balance — {account.name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Balance ($)</label>
            <input
              type="text"
              inputMode="decimal"
              value={displayBalance}
              onChange={handleBalanceChange}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Monthly snapshot"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!displayBalance || isNaN(numericBalance) || !date}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Account row with expand for history
interface AccountRowProps {
  account: Account;
  onUpdateBalance: (account: Account) => void;
}

const AccountRow: React.FC<AccountRowProps> = ({ account, onUpdateBalance }) => {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<AccountBalance[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const balances = await LocalStorage.loadAccountBalances(account.id);
    setHistory(balances);
    setLoadingHistory(false);
  }, [account.id]);

  const handleExpand = () => {
    if (!expanded) loadHistory();
    setExpanded(e => !e);
  };

  const handleDeleteBalance = async (balanceId: string) => {
    try {
      await LocalStorage.deleteAccountBalance(account.id, balanceId);
      setHistory(prev => prev.filter(b => b.id !== balanceId));
    } catch {
      toast.error('Failed to delete balance entry', { position: 'bottom-right', autoClose: 3000 });
    }
  };

  const isAsset = account.type === 'asset';
  const balanceColor = isAsset
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900">
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-900 dark:text-white truncate block">{account.name}</span>
        </div>
        <div className="flex items-center gap-3 ml-4">
          <span className={`text-base font-semibold ${balanceColor}`}>
            {account.currentBalance !== undefined ? formatCurrency(account.currentBalance) : '—'}
          </span>
          <button
            onClick={() => onUpdateBalance(account)}
            className="px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            Update
          </button>
          <button
            onClick={handleExpand}
            title="View history"
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <History size={16} />
          </button>
          <button
            onClick={handleExpand}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-4 py-3">
          {loadingHistory ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No balance entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400">
                  <th className="text-left font-medium pb-2">Date</th>
                  <th className="text-right font-medium pb-2">Balance</th>
                  <th className="text-left font-medium pb-2 pl-4">Note</th>
                  <th className="text-right font-medium pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {history.map(entry => (
                  <tr key={entry.id}>
                    <td className="py-1.5 text-gray-700 dark:text-gray-300">{formatDate(entry.date as string)}</td>
                    <td className={`py-1.5 text-right font-medium ${balanceColor}`}>{formatCurrency(entry.balance)}</td>
                    <td className="py-1.5 pl-4 text-gray-500 dark:text-gray-400">{entry.note || '—'}</td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => handleDeleteBalance(entry.id)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete entry"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

// Custom tooltip for the chart
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{formatDate(label)}</p>
      <p className={`font-semibold ${(data?.netWorth ?? 0) >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
        Net Worth: {formatCurrency(data?.netWorth ?? 0)}
      </p>
    </div>
  );
};

export const NetWorth: React.FC<NetWorthProps> = ({ selectedUserId, users }) => {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const gridStroke = theme === 'dark' ? '#374151' : '#e5e7eb';  // gray-700 : gray-200
  const tickFill = theme === 'dark' ? '#9ca3af' : '#6b7280';    // gray-400 : gray-500
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<NetWorthSummary | null>(null);
  const [history, setHistory] = useState<NetWorthHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [tellerEnabled, setTellerEnabled] = useState(false);
  const [tellerConnected, setTellerConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [balanceAccount, setBalanceAccount] = useState<Account | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [accts, sum, hist] = await Promise.all([
        LocalStorage.loadAccounts(selectedUserId),
        LocalStorage.loadNetWorthSummary(selectedUserId),
        LocalStorage.loadNetWorthHistory(selectedUserId),
      ]);

      // Fetch the current balance for each account (most recent)
      const accountsWithBalances: Account[] = await Promise.all(
        accts.map(async (acct) => {
          const balances = await LocalStorage.loadAccountBalances(acct.id);
          return { ...acct, currentBalance: balances[0]?.balance ?? 0 };
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
    LocalStorage.getTellerConfig().then(config => {
      setTellerEnabled(config.enabled);
      setTellerConnected((config.enrollments?.length ?? 0) > 0);
    });
  }, []);

  const handleRefreshBalances = async () => {
    setRefreshing(true);
    try {
      const result = await LocalStorage.tellerRefreshBalances();
      toast.success(`Refreshed ${result.refreshed} account balances`, { position: 'bottom-right', autoClose: 3000 });
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
      await LocalStorage.addAccountBalance(balanceAccount.id, {
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

  const netWorthColor = (summary?.netWorth ?? 0) >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400';

  // Format chart dates for x-axis
  const chartData = history.map(h => ({
    ...h,
    dateLabel: new Date(h.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
  }));

  // When a single user is selected, show flat assets/liabilities lists.
  // When "All Users" is selected, group accounts per user.
  const userGroups: { user: User | null; assets: Account[]; liabilities: Account[] }[] =
    selectedUserId !== null
      ? [{
          user: users.find(u => u.id === selectedUserId) ?? null,
          assets: accounts.filter(a => a.type === 'asset'),
          liabilities: accounts.filter(a => a.type === 'liability'),
        }]
      : users
          .map(user => ({
            user,
            assets: accounts.filter(a => a.userId === user.id && a.type === 'asset'),
            liabilities: accounts.filter(a => a.userId === user.id && a.type === 'liability'),
          }))
          .filter(g => g.assets.length > 0 || g.liabilities.length > 0);

  const showUserHeaders = selectedUserId === null && userGroups.length > 1;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Net Worth</h2>
        <div className="flex items-center gap-2">
          {tellerEnabled && tellerConnected && (
            <button
              onClick={handleRefreshBalances}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Refresh Balances
            </button>
          )}
          <button
            onClick={() => navigate('/settings?section=accounts')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            title="Go to Settings to manage accounts"
          >
            Manage Accounts
            <ExternalLink size={14} className="opacity-70" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Assets</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatCurrency(summary?.totalAssets ?? 0)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Liabilities</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(summary?.totalLiabilities ?? 0)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Net Worth</p>
              <p className={`text-2xl font-bold ${netWorthColor}`}>
                {formatCurrency(summary?.netWorth ?? 0)}
              </p>
            </div>
          </div>

          {/* Net worth history chart */}
          {chartData.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Net Worth Over Time</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
                    tick={{ fontSize: 12, fill: tickFill }}
                    stroke={gridStroke}
                  />
                  <YAxis
                    tickFormatter={v => `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    tick={{ fontSize: 12, fill: tickFill }}
                    stroke={gridStroke}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="netWorth"
                    name="Net Worth"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Accounts sections — flat when one user selected, grouped per user otherwise */}
          {accounts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              No accounts yet.{' '}
              <button
                onClick={() => navigate('/settings?section=accounts')}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Add one in Settings.
              </button>
            </p>
          ) : (
            <div className="space-y-8">
              {userGroups.map(({ user, assets, liabilities }) => {
                const groupAssetTotal = assets.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
                const groupLiabilityTotal = liabilities.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
                const groupNetWorth = groupAssetTotal - groupLiabilityTotal;
                const groupNetWorthColor = groupNetWorth >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400';

                return (
                  <div key={user?.id ?? 'single'} className="space-y-5">
                    {/* Per-user header — only shown in "All Users" mode with multiple users */}
                    {showUserHeaders && user && (
                      <div className="flex items-center gap-3 pb-2 border-b border-gray-200 dark:border-gray-800">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{user.name}</h3>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Assets {formatCurrency(groupAssetTotal)}
                          {' · '}
                          Liabilities {formatCurrency(groupLiabilityTotal)}
                          {' · '}
                          <span className={groupNetWorthColor}>Net {formatCurrency(groupNetWorth)}</span>
                        </span>
                      </div>
                    )}

                    {/* Assets */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Assets</h4>
                        <span className="text-sm font-medium text-green-600 dark:text-green-400">
                          {formatCurrency(showUserHeaders ? groupAssetTotal : (summary?.totalAssets ?? 0))}
                        </span>
                      </div>
                      {assets.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 py-3 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                          No asset accounts.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {assets.map(account => (
                            <AccountRow
                              key={account.id}
                              account={account}
                              onUpdateBalance={setBalanceAccount}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Liabilities */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Liabilities</h4>
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">
                          {formatCurrency(showUserHeaders ? groupLiabilityTotal : (summary?.totalLiabilities ?? 0))}
                        </span>
                      </div>
                      {liabilities.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500 py-3 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                          No liability accounts.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {liabilities.map(account => (
                            <AccountRow
                              key={account.id}
                              account={account}
                              onUpdateBalance={setBalanceAccount}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
    </div>
  );
};
