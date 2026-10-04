import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { Expense, TransferGroupDetail } from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { formatCurrency, formatDate } from '../../utils';
import { countedAmount } from '../../utils/transferGroups';
import { CountedAmount } from '../ui/CountedAmount';

interface TransferGroupSectionProps {
  transaction: Expense;
  selectedUserId?: string | null;
  onOpenTransaction?: (transaction: Expense) => void;
  onEdit?: (group: TransferGroupDetail) => void;
  onUnlink?: (groupId: string) => void;
  onToggleInclude?: (groupId: string, include: boolean) => void;
}

const ACTION_BTN =
  'flex-1 px-3 py-2 min-h-[44px] text-xs font-medium rounded-lg border transition-colors';

/** Allocation ledger for the transfer/refund group a transaction belongs to. */
export const TransferGroupSection: React.FC<TransferGroupSectionProps> = ({
  transaction,
  selectedUserId = null,
  onOpenTransaction,
  onEdit,
  onUnlink,
  onToggleInclude,
}) => {
  const groupRef = transaction.transferGroup;
  const [group, setGroup] = useState<TransferGroupDetail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!groupRef) return;
    let cancelled = false;
    setError(false);
    ApiClient.getTransferGroup(groupRef.id)
      .then((detail) => {
        if (!cancelled) setGroup(detail);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // Refetch when this transaction's allocation changes, not just the group id.
  }, [groupRef, transaction.effectiveAmount]);

  if (!groupRef) return null;

  const isUserKind = groupRef.kind === 'user';
  const accent = isUserKind
    ? {
        box: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700',
        icon: 'text-orange-600 dark:text-orange-400',
        title: 'text-orange-800 dark:text-orange-200',
        body: 'text-orange-700 dark:text-orange-300',
      }
    : {
        box: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700',
        icon: 'text-purple-600 dark:text-purple-400',
        title: 'text-purple-800 dark:text-purple-200',
        body: 'text-purple-700 dark:text-purple-300',
      };

  const net = group
    ? group.transactions.reduce((sum, t) => {
        const counted = countedAmount(t, selectedUserId);
        return sum + (t.type === 'income' ? counted : -counted);
      }, 0)
    : 0;

  return (
    <section className={`border rounded-lg p-4 ${accent.box}`}>
      <div className="flex items-start gap-3">
        <ArrowRightLeft size={20} className={`${accent.icon} mt-0.5 flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold ${accent.title}`}>
            {isUserKind ? 'User Transfer' : 'Transfer/Refund'} group
            {group && ` · ${group.transactions.length} transactions`}
          </h3>
          <p className={`text-sm mt-1 ${accent.body}`}>
            These transactions offset each other; only what doesn&apos;t cancel out counts in
            totals.
            {isUserKind &&
              ' Transfers between household members count in full when viewing a single user.'}
          </p>
        </div>
      </div>

      <div className="mt-3 bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
        {error ? (
          <p className="p-3 text-sm text-red-600 dark:text-red-400">
            Couldn&apos;t load the group.
          </p>
        ) : !group ? (
          <div className="flex items-center justify-center p-4 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading group…
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {group.transactions.map((t) => {
                const isCurrent = t.id === transaction.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={isCurrent || !onOpenTransaction}
                      onClick={() => onOpenTransaction?.(t)}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={`w-full min-h-[44px] px-3 py-2 flex items-center justify-between gap-3 text-left ${
                        isCurrent
                          ? 'bg-gray-100 dark:bg-gray-700/60'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm text-gray-900 dark:text-white truncate">
                            {t.description}
                          </span>
                          {t.transferGroup?.role === 'anchor' && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200">
                              Anchor
                            </span>
                          )}
                        </span>
                        <span className="hidden md:block text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(t.date)}
                        </span>
                      </span>
                      <CountedAmount
                        expense={t}
                        selectedUserId={selectedUserId}
                        className="flex-shrink-0"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-3 py-2 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Counted in totals
              </span>
              <span
                className={`text-sm font-semibold tabular-nums ${
                  net === 0
                    ? 'text-gray-500 dark:text-gray-400'
                    : net > 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                }`}
              >
                {net > 0 ? '+' : net < 0 ? '-' : ''}
                {formatCurrency(Math.abs(net))}
              </span>
            </div>
          </>
        )}
      </div>

      {group && (onEdit || onToggleInclude || onUnlink) && (
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(group)}
              className={`${ACTION_BTN} bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`}
            >
              Edit group
            </button>
          )}
          {onToggleInclude && (
            <button
              type="button"
              onClick={() => onToggleInclude(group.id, !group.includeInCalculations)}
              className={`${ACTION_BTN} ${
                group.includeInCalculations
                  ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-700'
                  : 'bg-green-600 border-green-600 text-white hover:bg-green-700'
              }`}
            >
              {group.includeInCalculations ? 'Offset again' : 'Count in full'}
            </button>
          )}
          {onUnlink && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Unlink these transactions? They will all count in full.')) {
                  onUnlink(group.id);
                }
              }}
              className={`${ACTION_BTN} bg-white dark:bg-gray-800 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20`}
            >
              Unlink
            </button>
          )}
        </div>
      )}
    </section>
  );
};
