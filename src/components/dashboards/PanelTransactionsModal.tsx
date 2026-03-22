import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { DashboardPanel, Dashboard, Expense } from '../../types';
import { LocalStorage } from '../../utils/storage';
import { formatCurrency } from '../../utils';
import { ITEMS_PER_PAGE } from '../../constants';

interface PanelTransactionsModalProps {
  panel: DashboardPanel;
  dashboard: Dashboard;
  dateRange: { start: Date; end: Date };
  selectedUserId: string | null;
  onClose: () => void;
}

export const PanelTransactionsModal: React.FC<PanelTransactionsModalProps> = ({
  panel, dashboard, dateRange, selectedUserId, onClose,
}) => {
  const [transactions, setTransactions] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const fetchPage = useCallback(async (pageNum: number) => {
    setLoading(true);
    const result = await LocalStorage.previewPanelTransactions({
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
  }, [panel, dateRange, selectedUserId]);

  useEffect(() => { fetchPage(page); }, [page, fetchPage]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-40 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-3xl max-h-[80vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{panel.title}</h2>
              {!loading && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {total} transaction{total === 1 ? '' : 's'}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
            >
              <X size={18} />
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-gray-500 dark:text-gray-400">
                No transactions match this panel's filters
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">Date</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">Description</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">Category</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {tx.date.toString().slice(0, 10)}
                      </td>
                      <td className="px-6 py-3 text-gray-900 dark:text-white truncate max-w-[250px]">
                        {tx.description}
                      </td>
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-400">
                        {tx.category}
                      </td>
                      <td className={`px-6 py-3 text-right font-medium whitespace-nowrap ${
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
            )}
          </div>

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed rounded"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
