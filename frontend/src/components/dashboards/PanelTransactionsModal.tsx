import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DashboardPanel, Dashboard, Expense } from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { formatCurrency } from '../../utils';
import { ITEMS_PER_PAGE } from '../../constants';
import { Sheet } from '../ui/Sheet';

interface PanelTransactionsModalProps {
  panel: DashboardPanel;
  dashboard: Dashboard;
  dateRange: { start: Date; end: Date };
  selectedUserId: string | null;
  onClose: () => void;
}

export const PanelTransactionsModal: React.FC<PanelTransactionsModalProps> = ({
  panel,
  dashboard: _dashboard,
  dateRange,
  selectedUserId,
  onClose,
}) => {
  const [transactions, setTransactions] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const fetchPage = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      const result = await ApiClient.previewPanelTransactions({
        filterGroups: panel.filterGroups,
        userId: selectedUserId,
        dateFrom: dateRange.start.toISOString().slice(0, 10),
        dateTo: dateRange.end.toISOString().slice(0, 10),
        limit: ITEMS_PER_PAGE,
        offset: (pageNum - 1) * ITEMS_PER_PAGE,
      });
      setTransactions(result.transactions);
      setTotal(result.total);
      setLoading(false);
    },
    [panel, dateRange, selectedUserId]
  );

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  const title = (
    <div>
      <div className="text-lg font-semibold text-gray-900 dark:text-white truncate">
        {panel.title}
      </div>
      {!loading && (
        <p className="text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
          {total} transaction{total === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );

  const footer =
    totalPages > 1 ? (
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Previous page"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed rounded"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Next page"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed rounded"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    ) : undefined;

  return (
    <Sheet isOpen={true} onClose={onClose} title={title} footer={footer}>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-gray-500 dark:text-gray-400">
          No transactions match this panel's filters
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="md:hidden divide-y divide-gray-100 dark:divide-gray-800 -mx-4">
            {transactions.map((tx) => (
              <li key={tx.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {tx.description}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <span>{tx.date.toString().slice(0, 10)}</span>
                      <span>•</span>
                      <span className="truncate">{tx.category}</span>
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold whitespace-nowrap ${
                      tx.type === 'income'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {formatCurrency(tx.amount)}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Date
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Description
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Category
                </th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {tx.date.toString().slice(0, 10)}
                  </td>
                  <td className="px-6 py-3 text-gray-900 dark:text-white truncate max-w-[250px]">
                    {tx.description}
                  </td>
                  <td className="px-6 py-3 text-gray-600 dark:text-gray-400">{tx.category}</td>
                  <td
                    className={`px-6 py-3 text-right font-medium whitespace-nowrap ${
                      tx.type === 'income'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {formatCurrency(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Sheet>
  );
};
