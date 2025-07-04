import React from 'react';
import { X, Calendar, Tag, DollarSign, FileText, Clock, Database } from 'lucide-react';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils';

interface TransactionDetailsModalProps {
  transaction: Expense | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
  transaction,
  isOpen,
  onClose
}) => {
  if (!isOpen || !transaction) return null;

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-slide-up border border-white/20 dark:border-slate-700/50">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/20 dark:border-slate-700/50">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              transaction.type === 'expense' 
                ? 'bg-red-100 dark:bg-red-900/30' 
                : 'bg-green-100 dark:bg-green-900/30'
            }`}>
              <DollarSign 
                size={20} 
                className={transaction.type === 'expense' 
                  ? 'text-red-600 dark:text-red-400' 
                  : 'text-green-600 dark:text-green-400'
                } 
              />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Transaction Details
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {transaction.type === 'expense' ? 'Expense' : 'Income'}
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

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Amount */}
            <div className="text-center">
              <div className={`text-3xl font-bold ${
                transaction.type === 'expense' 
                  ? 'text-red-600 dark:text-red-400' 
                  : 'text-green-600 dark:text-green-400'
              }`}>
                {transaction.type === 'expense' ? '-' : '+'}{formatCurrency(transaction.amount)}
              </div>
            </div>

            {/* Description */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Description
              </h3>
              <p className="text-gray-700 dark:text-gray-300">
                {transaction.description}
              </p>
            </div>

            {/* Basic Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Transaction Date */}
              <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <Calendar size={16} className="text-gray-500 dark:text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Transaction Date</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(transaction.date)}
                  </p>
                </div>
              </div>

              {/* Category */}
              <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <Tag size={16} className="text-gray-500 dark:text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Category</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {transaction.category}
                  </p>
                </div>
              </div>

              {/* Source */}
              <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <Database size={16} className="text-gray-500 dark:text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Source</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {transaction.metadata?.sourceName || 'Manual Entry'}
                  </p>
                </div>
              </div>

              {/* Created At */}
              <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <Clock size={16} className="text-gray-500 dark:text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Created At</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {transaction.metadata?.importedAt 
                      ? formatDateTime(transaction.metadata.importedAt)
                      : 'Unknown'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Labels */}
            {transaction.labels && transaction.labels.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Labels
                </h3>
                <div className="flex flex-wrap gap-2">
                  {transaction.labels.map((label, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-full border border-blue-200 dark:border-blue-700"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Memo */}
            {transaction.memo && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Memo
                </h3>
                <div className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <FileText size={16} className="text-gray-500 dark:text-gray-400 mt-0.5" />
                  <p className="text-gray-700 dark:text-gray-300">
                    {transaction.memo}
                  </p>
                </div>
              </div>
            )}

            {/* Metadata Details */}
            {transaction.metadata && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Creation Details
                </h3>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  {transaction.metadata.sourceId && (
                    <p><span className="font-medium">Source ID:</span> {transaction.metadata.sourceId}</p>
                  )}
                  <p><span className="font-medium">Created at:</span> {formatDateTime(transaction.metadata.importedAt)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-white/20 dark:border-slate-700/50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}; 