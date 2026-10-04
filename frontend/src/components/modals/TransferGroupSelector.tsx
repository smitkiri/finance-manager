import React, { useState, useEffect, useMemo } from 'react';
import { Search, ArrowRightLeft, Loader2, Check } from 'lucide-react';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils';
import { ApiClient } from '../../utils/apiClient';
import { allocate } from '../../utils/transferGroups';
import { Sheet } from '../ui/Sheet';
import { ListRow } from '../ui/ListRow';

interface TransferGroupSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  /** The "one" side of the group; selected rows offset it. */
  anchor: Expense;
  /** Pre-selected members when editing an existing group. */
  initialMemberIds?: string[];
  onConfirm: (memberIds: string[]) => void;
}

const signOf = (type: Expense['type']) => (type === 'expense' ? '-' : '+');

export const TransferGroupSelector: React.FC<TransferGroupSelectorProps> = ({
  isOpen,
  onClose,
  anchor,
  initialMemberIds,
  onConfirm,
}) => {
  const [searchText, setSearchText] = useState('');
  const [allTransactions, setAllTransactions] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const isEditing = !!initialMemberIds;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    ApiClient.loadExpenses()
      .then((loaded) => {
        if (!cancelled) {
          setAllTransactions(loaded);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSearchText('');
      setSelectedIds(initialMemberIds ?? []);
    }
    // Reset only when the sheet opens; initialMemberIds is a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const candidates = useMemo(
    () =>
      allTransactions.filter(
        (t) =>
          t.id !== anchor.id &&
          t.type !== anchor.type &&
          (!t.transferGroup || initialMemberIds?.includes(t.id))
      ),
    [allTransactions, anchor, initialMemberIds]
  );

  const availableTransactions = useMemo(() => {
    const searchLower = searchText.toLowerCase();
    const filtered = candidates.filter(
      (t) =>
        !searchText ||
        selectedIds.includes(t.id) ||
        t.description.toLowerCase().includes(searchLower) ||
        t.category.toLowerCase().includes(searchLower) ||
        t.user.toLowerCase().includes(searchLower) ||
        formatDate(t.date).toLowerCase().includes(searchLower)
    );

    return filtered.sort((a, b) => {
      const sameUserA = a.user === anchor.user;
      const sameUserB = b.user === anchor.user;
      if (sameUserA !== sameUserB) return sameUserA ? -1 : 1;

      const diffA = Math.abs(a.amount - anchor.amount);
      const diffB = Math.abs(b.amount - anchor.amount);
      if (diffA !== diffB) return diffA - diffB;

      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [candidates, anchor, searchText, selectedIds]);

  const selected = useMemo(
    () => candidates.filter((t) => selectedIds.includes(t.id)),
    [candidates, selectedIds]
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const preview = useMemo(() => {
    if (selected.length === 0) return null;
    const allocation = allocate(anchor, selected);
    const memberSign = signOf(selected[0].type);
    const selectedTotal = selected.reduce((sum, t) => sum + t.amount, 0);
    const anchorKeeps = allocation.get(anchor.id) ?? 0;
    const keepers = selected.filter((t) => (allocation.get(t.id) ?? 0) > 0);

    let outcome = 'Fully offset';
    if (anchorKeeps > 0) {
      outcome = `${signOf(anchor.type)}${formatCurrency(anchorKeeps)} stays counted on this transaction`;
    } else if (keepers.length === 1) {
      const keeper = keepers[0];
      outcome = `${memberSign}${formatCurrency(allocation.get(keeper.id) ?? 0)} stays counted on "${keeper.description}"`;
    } else if (keepers.length > 1) {
      const total = keepers.reduce((sum, t) => sum + (allocation.get(t.id) ?? 0), 0);
      outcome = `${memberSign}${formatCurrency(total)} stays counted across ${keepers.length} transactions`;
    }

    return {
      summary: `Selected ${selected.length} · ${memberSign}${formatCurrency(selectedTotal)} against ${signOf(anchor.type)}${formatCurrency(anchor.amount)}`,
      outcome,
    };
  }, [anchor, selected]);

  const confirmLabel = isEditing
    ? 'Save group'
    : `Link ${selected.length} transaction${selected.length === 1 ? '' : 's'}`;

  const title = (
    <div className="flex items-center space-x-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-purple-100 dark:bg-purple-900/30 flex-shrink-0">
        <ArrowRightLeft size={18} className="text-purple-600 dark:text-purple-400" />
      </div>
      <div className="min-w-0">
        <div className="text-base font-semibold text-gray-900 dark:text-white truncate">
          {isEditing ? 'Edit Transfer/Refund Group' : 'Mark as Transfer/Refund'}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          Pick one or more transactions that offset this one
        </p>
      </div>
    </div>
  );

  const footer = (
    <div className="space-y-3">
      <div
        aria-live="polite"
        className="rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 px-3 py-2"
      >
        {preview ? (
          <>
            <p className="text-xs text-purple-700 dark:text-purple-300">{preview.summary}</p>
            <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
              {preview.outcome}
            </p>
          </>
        ) : (
          <p className="text-sm text-purple-700 dark:text-purple-300">
            Whatever the two sides don't cancel out stays counted.
          </p>
        )}
      </div>
      <div className="flex flex-col-reverse gap-2 md:flex-row">
        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 min-h-[48px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onConfirm(selected.map((t) => t.id))}
          className="w-full py-3 min-h-[48px] bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={title} footer={footer}>
      <div className="space-y-4">
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
          <p className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-2">
            This transaction:
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">
                {anchor.description}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {formatDate(anchor.date)} • {anchor.category}
              </p>
            </div>
            <div
              className={`text-lg font-bold flex-shrink-0 ${
                anchor.type === 'expense'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            >
              {signOf(anchor.type)}
              {formatCurrency(anchor.amount)}
            </div>
          </div>
        </div>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={20}
          />
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-10 pr-4 py-3 min-h-[48px] text-base md:text-sm border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-purple-500 mr-2" />
            <span className="text-gray-500 dark:text-gray-400">Loading transactions...</span>
          </div>
        ) : availableTransactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              {searchText
                ? 'No matching transactions found'
                : 'No available transactions. They must be the opposite type (income/expense) and not already in a group.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {availableTransactions.map((transaction) => {
              const isSelected = selectedIds.includes(transaction.id);
              const isExactMatch = transaction.amount === anchor.amount;
              const amountColor =
                transaction.type === 'expense'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400';
              return (
                <ListRow
                  key={transaction.id}
                  onClick={() => toggle(transaction.id)}
                  ariaLabel={`${isSelected ? 'Deselect' : 'Select'} ${transaction.description}`}
                  primary={
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        aria-hidden="true"
                        className={`w-5 h-5 flex-shrink-0 rounded border flex items-center justify-center ${
                          isSelected
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {isSelected && <Check size={14} />}
                      </span>
                      <span className="truncate">{transaction.description}</span>
                      {isExactMatch && (
                        <span className="inline-flex flex-shrink-0 items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200">
                          Exact Match
                        </span>
                      )}
                    </div>
                  }
                  amount={
                    <span className={`text-sm ${amountColor}`}>
                      {signOf(transaction.type)}
                      {formatCurrency(transaction.amount)}
                    </span>
                  }
                  meta={
                    <span>
                      {formatDate(transaction.date)} • {transaction.category} • {transaction.user}
                    </span>
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
};
