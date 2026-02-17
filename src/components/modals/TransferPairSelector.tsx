import React, { useState, useMemo } from 'react';
import { X, Search, ArrowRightLeft } from 'lucide-react';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils';

interface TransferPairSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (pairTransactionId: string) => void;
  currentTransaction: Expense;
  allTransactions: Expense[];
}

export const TransferPairSelector: React.FC<TransferPairSelectorProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentTransaction,
  allTransactions
}) => {
  const [searchText, setSearchText] = useState('');

  // Filter and sort transactions that can be paired
  const availableTransactions = useMemo(() => {
    const filtered = allTransactions.filter(t => {
      // Exclude the current transaction
      if (t.id === currentTransaction.id) return false;
      
      // Exclude transactions that are already part of a transfer
      if (t.transferInfo?.isTransfer) return false;
      
      // Must be opposite type (income vs expense)
      if (t.type === currentTransaction.type) return false;
      
      // Must be same user (transfer/refund)
      if (t.user !== currentTransaction.user) return false;
      
      // Apply search filter
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        return (
          t.description.toLowerCase().includes(searchLower) ||
          t.category.toLowerCase().includes(searchLower) ||
          formatDate(t.date).toLowerCase().includes(searchLower)
        );
      }
      
      return true;
    });

    // Sort by match likelihood (exact amount match first, then by amount difference)
    return filtered.sort((a, b) => {
      const amountA = a.amount;
      const amountB = b.amount;
      const currentAmount = currentTransaction.amount;
      
      // Calculate amount difference
      const diffA = Math.abs(amountA - currentAmount);
      const diffB = Math.abs(amountB - currentAmount);
      
      // Exact matches first
      if (diffA === 0 && diffB !== 0) return -1;
      if (diffB === 0 && diffA !== 0) return 1;
      if (diffA === 0 && diffB === 0) {
        // If both are exact matches, sort by date (most recent first)
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      
      // Then sort by amount difference (smallest difference first)
      if (diffA !== diffB) {
        return diffA - diffB;
      }
      
      // If same difference, sort by date (most recent first)
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [allTransactions, currentTransaction, searchText]);

  const handleSelect = (transactionId: string) => {
    onSelect(transactionId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden animate-slide-up border border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
              <ArrowRightLeft size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Select Transfer Pair
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Choose the transaction to pair with this one
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Current Transaction Info */}
        <div className="p-6 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-700">
          <p className="text-sm font-medium text-purple-800 dark:text-purple-200 mb-2">
            Current Transaction:
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {currentTransaction.description}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {formatDate(currentTransaction.date)} • {currentTransaction.category}
              </p>
            </div>
            <div className={`text-lg font-bold ${
              currentTransaction.type === 'expense' 
                ? 'text-red-600 dark:text-red-400' 
                : 'text-green-600 dark:text-green-400'
            }`}>
              {currentTransaction.type === 'expense' ? '-' : '+'}
              {formatCurrency(currentTransaction.amount)}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        {/* Transaction List */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-400px)]">
          {availableTransactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {searchText 
                  ? 'No matching transactions found' 
                  : 'No available transactions to pair with. The transaction must be the opposite type (income/expense) and from the same user.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {availableTransactions.map((transaction) => {
                const isExactMatch = transaction.amount === currentTransaction.amount;
                return (
                  <button
                    key={transaction.id}
                    onClick={() => handleSelect(transaction.id)}
                    className={`w-full text-left p-4 rounded-lg border transition-all cursor-pointer ${
                      isExactMatch
                        ? 'border-purple-400 dark:border-purple-500 bg-purple-50 dark:bg-purple-900/30 hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40'
                        : 'border-gray-200 dark:border-gray-800 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="font-medium text-gray-900 dark:text-white truncate">
                            {transaction.description}
                          </p>
                          {isExactMatch && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200">
                              Exact Match
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {formatDate(transaction.date)}
                          </span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">•</span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {transaction.category}
                          </span>
                        </div>
                      </div>
                      <div className={`text-lg font-bold ml-4 ${
                        transaction.type === 'expense' 
                          ? 'text-red-600 dark:text-red-400' 
                          : 'text-green-600 dark:text-green-400'
                      }`}>
                        {transaction.type === 'expense' ? '-' : '+'}
                        {formatCurrency(transaction.amount)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

