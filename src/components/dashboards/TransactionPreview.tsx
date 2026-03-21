import React from 'react';
import { Expense } from '../../types';
import { formatCurrency } from '../../utils';

interface TransactionPreviewProps {
  transactions: Expense[];
  total: number;
  loading: boolean;
}

export const TransactionPreview: React.FC<TransactionPreviewProps> = ({ transactions, total, loading }) => {
  if (loading) {
    return (
      <div className="mt-4">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Loading preview...</div>
        <div className="space-y-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        {total === 0
          ? 'No transactions match these filters'
          : `${total} transaction${total === 1 ? '' : 's'} matched${total > transactions.length ? ` (showing ${transactions.length})` : ''}`}
      </div>
      {transactions.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Date</th>
                <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Description</th>
                <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {transactions.map(tx => (
                <tr key={tx.id} className="bg-white dark:bg-gray-900">
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {tx.date.toString().slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 text-gray-900 dark:text-white truncate max-w-[140px]">
                    {tx.description}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${
                    tx.type === 'income'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
