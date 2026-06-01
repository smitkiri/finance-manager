// Props: accounts grouped by user, summary totals, currency formatter,
// formatDate, and the handler that opens the per-account balance modal.
import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ChevronDown,
  ChevronUp,
  History,
  Minus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Account, AccountBalance, NetWorthSummary, User } from '../../types';
import { ApiClient } from '../../utils/apiClient';

interface BalanceDeltaProps {
  previousBalance?: number;
  currentBalance?: number;
  accountType: 'asset' | 'liability';
  formatCurrency: (n: number) => string;
}

const BalanceDelta: React.FC<BalanceDeltaProps> = ({
  previousBalance,
  currentBalance,
  accountType,
  formatCurrency,
}) => {
  const neutralClass = 'text-gray-400 dark:text-gray-500';

  if (previousBalance === undefined || currentBalance === undefined) {
    return <span className={`text-xs font-medium mt-0.5 ${neutralClass}`}>—</span>;
  }

  const delta = currentBalance - previousBalance;

  if (delta === 0) {
    return (
      <span className={`text-xs font-medium flex items-center gap-1 mt-0.5 ${neutralClass}`}>
        <Minus size={12} />
        {formatCurrency(0)}
      </span>
    );
  }

  const isAsset = accountType === 'asset';
  const isGood = (delta > 0 && isAsset) || (delta < 0 && !isAsset);
  const colorClass = isGood
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
  const Icon = delta > 0 ? TrendingUp : TrendingDown;

  return (
    <span className={`text-xs font-medium flex items-center gap-1 mt-0.5 ${colorClass}`}>
      <Icon size={12} />
      {formatCurrency(Math.abs(delta))}
    </span>
  );
};

interface AccountRowProps {
  account: Account;
  onUpdateBalance: (account: Account) => void;
  formatCurrency: (n: number) => string;
  formatDate: (dateStr: string) => string;
}

const AccountRow: React.FC<AccountRowProps> = ({
  account,
  onUpdateBalance,
  formatCurrency,
  formatDate,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<AccountBalance[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const balances = await ApiClient.loadAccountBalances(account.id);
    setHistory(balances);
    setLoadingHistory(false);
  }, [account.id]);

  const handleExpand = () => {
    if (!expanded) loadHistory();
    setExpanded((e) => !e);
  };

  const handleDeleteBalance = async (balanceId: string) => {
    try {
      await ApiClient.deleteAccountBalance(account.id, balanceId);
      setHistory((prev) => prev.filter((b) => b.id !== balanceId));
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
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 md:px-4 py-3 bg-white dark:bg-gray-900">
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-900 dark:text-white truncate block">
            {account.name}
          </span>
        </div>
        <div className="flex items-center gap-2 md:gap-3 ml-auto">
          <div className="flex flex-col items-end">
            <span className={`text-base font-semibold tabular-nums ${balanceColor}`}>
              {account.currentBalance !== undefined ? formatCurrency(account.currentBalance) : '—'}
            </span>
            <BalanceDelta
              previousBalance={account.previousBalance}
              currentBalance={account.currentBalance}
              accountType={account.type}
              formatCurrency={formatCurrency}
            />
          </div>
          <button
            onClick={() => onUpdateBalance(account)}
            className="px-3 min-h-[44px] md:min-h-0 md:py-1 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            Update
          </button>
          <button
            onClick={handleExpand}
            aria-label="View history"
            title="View history"
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <History size={16} />
          </button>
          <button
            onClick={handleExpand}
            aria-label={expanded ? 'Collapse history' : 'Expand history'}
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 px-3 md:px-4 py-3 overflow-x-auto">
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
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatDate(entry.date as string)}
                    </td>
                    <td
                      className={`py-1.5 text-right font-medium tabular-nums whitespace-nowrap ${balanceColor}`}
                    >
                      {formatCurrency(entry.balance)}
                    </td>
                    <td className="py-1.5 pl-4 text-gray-500 dark:text-gray-400">
                      {entry.note || '—'}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => handleDeleteBalance(entry.id)}
                        className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 inline-flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete entry"
                        aria-label="Delete entry"
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

export interface UserGroup {
  user: User | null;
  assets: Account[];
  liabilities: Account[];
}

interface AccountListProps {
  accounts: Account[];
  userGroups: UserGroup[];
  showUserHeaders: boolean;
  summary: NetWorthSummary | null;
  onUpdateBalance: (account: Account) => void;
  formatCurrency: (n: number) => string;
  formatDate: (dateStr: string) => string;
}

export const AccountList: React.FC<AccountListProps> = ({
  accounts,
  userGroups,
  showUserHeaders,
  summary,
  onUpdateBalance,
  formatCurrency,
  formatDate,
}) => {
  const navigate = useNavigate();

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
        No accounts yet.{' '}
        <button
          onClick={() => navigate('/settings?section=accounts')}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Add one in Settings.
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {userGroups.map(({ user, assets, liabilities }) => {
        const groupAssetTotal = assets.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
        const groupLiabilityTotal = liabilities.reduce((s, a) => s + (a.currentBalance ?? 0), 0);
        const groupNetWorth = groupAssetTotal - groupLiabilityTotal;
        const groupNetWorthColor =
          groupNetWorth >= 0
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-red-600 dark:text-red-400';

        return (
          <div key={user?.id ?? 'single'} className="space-y-5">
            {showUserHeaders && user && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  {user.name}
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Assets {formatCurrency(groupAssetTotal)}
                  {' · '}
                  Liabilities {formatCurrency(groupLiabilityTotal)}
                  {' · '}
                  <span className={groupNetWorthColor}>Net {formatCurrency(groupNetWorth)}</span>
                </span>
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Assets</h4>
                <span className="text-sm font-medium text-green-600 dark:text-green-400 tabular-nums">
                  {formatCurrency(showUserHeaders ? groupAssetTotal : (summary?.totalAssets ?? 0))}
                </span>
              </div>
              {assets.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-3 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                  No asset accounts.
                </p>
              ) : (
                <div className="space-y-2">
                  {assets.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      onUpdateBalance={onUpdateBalance}
                      formatCurrency={formatCurrency}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Liabilities
                </h4>
                <span className="text-sm font-medium text-red-600 dark:text-red-400 tabular-nums">
                  {formatCurrency(
                    showUserHeaders ? groupLiabilityTotal : (summary?.totalLiabilities ?? 0)
                  )}
                </span>
              </div>
              {liabilities.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-3 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                  No liability accounts.
                </p>
              ) : (
                <div className="space-y-2">
                  {liabilities.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      onUpdateBalance={onUpdateBalance}
                      formatCurrency={formatCurrency}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
