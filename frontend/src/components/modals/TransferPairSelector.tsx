import React, { useState, useEffect, useMemo } from 'react';
import { Search, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils';
import { ApiClient } from '../../utils/apiClient';
import { Sheet } from '../ui/Sheet';
import { ListRow } from '../ui/ListRow';

interface TransferPairSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (pairTransactionId: string) => void;
  currentTransaction: Expense;
}

export const TransferPairSelector: React.FC<TransferPairSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentTransaction,
}) => {
  const [searchText, setSearchText] = useState('');
  const [allTransactions, setAllTransactions] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

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
    if (isOpen) setSearchText('');
  }, [isOpen]);

  const availableTransactions = useMemo(() => {
    const filtered = allTransactions.filter((t) => {
      if (t.id === currentTransaction.id) return false;
      if (t.transferInfo?.isTransfer) return false;
      if (t.type === currentTransaction.type) return false;

      if (searchText) {
        const searchLower = searchText.toLowerCase();
        return (
          t.description.toLowerCase().includes(searchLower) ||
          t.category.toLowerCase().includes(searchLower) ||
          t.user.toLowerCase().includes(searchLower) ||
          formatDate(t.date).toLowerCase().includes(searchLower)
        );
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const currentAmount = currentTransaction.amount;

      const sameUserA = a.user === currentTransaction.user;
      const sameUserB = b.user === currentTransaction.user;
      if (sameUserA && !sameUserB) return -1;
      if (!sameUserA && sameUserB) return 1;

      const diffA = Math.abs(a.amount - currentAmount);
      const diffB = Math.abs(b.amount - currentAmount);

      if (diffA === 0 && diffB !== 0) return -1;
      if (diffB === 0 && diffA !== 0) return 1;
      if (diffA === 0 && diffB === 0) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }

      if (diffA !== diffB) {
        return diffA - diffB;
      }

      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [allTransactions, currentTransaction, searchText]);

  const handleSelect = (transactionId: string) => {
    onSelect(transactionId);
    onClose();
  };

  const title = (
    <div className="flex items-center space-x-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-purple-100 dark:bg-purple-900/30 flex-shrink-0">
        <ArrowRightLeft size={18} className="text-purple-600 dark:text-purple-400" />
      </div>
      <div className="min-w-0">
        <div className="text-base font-semibold text-gray-900 dark:text-white truncate">
          Select Transfer Pair
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          Choose the transaction to pair with this one
        </p>
      </div>
    </div>
  );

  const footer = (
    <button
      onClick={onClose}
      className="w-full py-3 min-h-[48px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
    >
      Cancel
    </button>
  );

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title={title} footer={footer}>
      <div className="space-y-4">
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
          <p className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-2">
            Current Transaction:
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">
                {currentTransaction.description}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {formatDate(currentTransaction.date)} • {currentTransaction.category}
              </p>
            </div>
            <div
              className={`text-lg font-bold flex-shrink-0 ${
                currentTransaction.type === 'expense'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400'
              }`}
            >
              {currentTransaction.type === 'expense' ? '-' : '+'}
              {formatCurrency(currentTransaction.amount)}
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
                : 'No available transactions to pair with. The transaction must be the opposite type (income/expense).'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {availableTransactions.map((transaction) => {
              const isExactMatch = transaction.amount === currentTransaction.amount;
              const isSameUser = transaction.user === currentTransaction.user;
              const amountColor =
                transaction.type === 'expense'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-green-600 dark:text-green-400';
              return (
                <ListRow
                  key={transaction.id}
                  onClick={() => handleSelect(transaction.id)}
                  ariaLabel={`Select ${transaction.description}`}
                  primary={
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="truncate">{transaction.description}</span>
                      {isExactMatch && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200">
                          Exact Match
                        </span>
                      )}
                      {!isSameUser && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200">
                          Different User
                        </span>
                      )}
                    </div>
                  }
                  amount={
                    <span className={amountColor}>
                      {transaction.type === 'expense' ? '-' : '+'}
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
