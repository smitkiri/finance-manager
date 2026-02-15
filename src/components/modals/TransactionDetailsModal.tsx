import React, { useState } from 'react';
import { X, Calendar, Tag, DollarSign, Clock, Database, ArrowRightLeft } from 'lucide-react';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils';
import { getTransferPair } from '../../utils/transferDetection';
import { TransferPairSelector } from './TransferPairSelector';

interface TransactionDetailsModalProps {
  transaction: Expense | null;
  isOpen: boolean;
  onClose: () => void;
  onTransferOverride?: (transactionId: string, includeInCalculations: boolean) => void;
  onExcludeToggle?: (transactionId: string, exclude: boolean) => void;
  onMarkAsTransferRefund?: (transactionId: string, pairTransactionId: string) => void;
  allTransactions?: Expense[];
  selectedUserId?: string | null;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onTransferOverride,
  onExcludeToggle,
  onMarkAsTransferRefund,
  allTransactions = [],
  selectedUserId
}) => {
  const [isPairSelectorOpen, setIsPairSelectorOpen] = useState(false);

  if (!isOpen || !transaction) return null;

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const transferPair = transaction.transferInfo?.isTransfer ? getTransferPair(transaction, allTransactions) : null;
  const isTransfer = transaction.transferInfo?.isTransfer;
  
  // Use the same logic as filterTransfersForCalculations to determine if excluded
  const isExcludedFromCalculations = (() => {
    // Exclude if top-level excludedFromCalculations is true (manual exclusion)
    if (transaction.excludedFromCalculations === true) return true;
    
    // For transfers, check transfer-specific exclusion logic
    if (transaction.transferInfo?.isTransfer) {
      // Include if user has explicitly overridden the exclusion
      if (transaction.transferInfo.userOverride !== undefined) {
        return transaction.transferInfo.excludedFromCalculations;
      }
      
      // Handle different transfer types based on user selection
      if (transaction.transferInfo.transferType === 'user') {
        // User transfers: exclude when "All users" is selected, include when specific user is selected
        return selectedUserId === null;
      } else if (transaction.transferInfo.transferType === 'self') {
        // Transfer/Refunds: always exclude from calculations (they cancel each other out)
        return transaction.transferInfo.excludedFromCalculations;
      }
      
      // Default behavior: exclude transfers from calculations
      return transaction.transferInfo.excludedFromCalculations;
    }
    
    // Non-transfer transactions are included unless manually excluded
    return false;
  })();

  const handleTransferOverride = (includeInCalculations: boolean) => {
    if (onTransferOverride) {
      onTransferOverride(transaction.id, includeInCalculations);
    }
  };

  const handleExcludeToggle = (exclude: boolean) => {
    if (onExcludeToggle) {
      onExcludeToggle(transaction.id, exclude);
    }
  };

  const handleMarkAsTransferRefund = (pairTransactionId: string) => {
    if (onMarkAsTransferRefund) {
      onMarkAsTransferRefund(transaction.id, pairTransactionId);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-slide-up border border-white/20 dark:border-slate-700/50" onClick={(e) => e.stopPropagation()}>
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
            {/* Transfer Alert */}
            {isTransfer && (
              <div className={`${
                transaction.transferInfo?.transferType === 'user' 
                  ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700'
                  : 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700'
              } rounded-lg p-4`}>
                <div className="flex items-start space-x-3">
                  <ArrowRightLeft size={20} className={`${
                    transaction.transferInfo?.transferType === 'user' 
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-purple-600 dark:text-purple-400'
                  } mt-0.5`} />
                  <div className="flex-1">
                    <h3 className={`font-semibold mb-1 ${
                      transaction.transferInfo?.transferType === 'user' 
                        ? 'text-orange-800 dark:text-orange-200'
                        : 'text-purple-800 dark:text-purple-200'
                    }`}>
                      {transaction.transferInfo?.transferType === 'user' ? 'User Transfer' : 'Transfer/Refund'} Detected
                    </h3>
                    <p className={`text-sm mb-3 ${
                      transaction.transferInfo?.transferType === 'user' 
                        ? 'text-orange-700 dark:text-orange-300'
                        : 'text-purple-700 dark:text-purple-300'
                    }`}>
                      {transaction.transferInfo?.transferType === 'user' 
                        ? 'This transaction appears to be part of a transfer between different users. User transfers are included in calculations when a specific user is selected, but excluded when viewing "All users".'
                        : 'This transaction appears to be part of a transfer within the same user account. Transfers/Refunds are excluded from calculations by default to avoid double-counting.'
                      }
                    </p>
                    
                    {transferPair && (
                      <div className="bg-white dark:bg-slate-700 rounded-lg p-3 mb-3">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Transfer Pair:</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-700 dark:text-gray-300">
                              {transferPair.debit.description} ({transferPair.debit.metadata?.sourceName || 'Manual'}) - {transferPair.debit.user}
                            </span>
                            <span className="text-red-600 dark:text-red-400 font-medium">
                              -{formatCurrency(transferPair.debit.amount)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-gray-700 dark:text-gray-300">
                              {transferPair.credit.description} ({transferPair.credit.metadata?.sourceName || 'Manual'}) - {transferPair.credit.user}
                            </span>
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              +{formatCurrency(transferPair.credit.amount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        isExcludedFromCalculations
                          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                          : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                      }`}>
                        {isExcludedFromCalculations ? 'Excluded from calculations' : 'Included in calculations'}
                      </span>
                    </div>
                    
                    {onTransferOverride && (
                      <div className="mt-3 flex space-x-2">
                        <button
                          onClick={() => handleTransferOverride(true)}
                          disabled={!isExcludedFromCalculations}
                          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                            !isExcludedFromCalculations
                              ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700 cursor-not-allowed'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          Include in Calculations
                        </button>
                        <button
                          onClick={() => handleTransferOverride(false)}
                          disabled={isExcludedFromCalculations}
                          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                            isExcludedFromCalculations
                              ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700 cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                        >
                          Exclude from Calculations
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Exclude from calculations for any transaction */}
            {!isTransfer && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    isExcludedFromCalculations
                      ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                      : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                  }`}>
                    {isExcludedFromCalculations ? 'Excluded from calculations' : 'Included in calculations'}
                  </span>
                  {onExcludeToggle && (
                    <button
                      onClick={() => handleExcludeToggle(!isExcludedFromCalculations)}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                        isExcludedFromCalculations
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-red-600 text-white hover:bg-red-700'
                      }`}
                    >
                      {isExcludedFromCalculations ? 'Include in Calculations' : 'Exclude from Calculations'}
                    </button>
                  )}
                </div>
                {onMarkAsTransferRefund && (
                  <button
                    onClick={() => setIsPairSelectorOpen(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                  >
                    <ArrowRightLeft size={16} />
                    <span>Mark as Transfer/Refund</span>
                  </button>
                )}
              </div>
            )}

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

              {/* User */}
              <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <span className="text-xs text-white font-medium">
                    {transaction.user.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">User</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {transaction.user}
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
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Labels
                </h4>
                <div className="flex flex-wrap gap-2">
                  {transaction.labels.map((label, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                      {label}
                    </span>
                  ))}
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

      {/* Transfer Pair Selector */}
      <TransferPairSelector
        isOpen={isPairSelectorOpen}
        onClose={() => setIsPairSelectorOpen(false)}
        onSelect={handleMarkAsTransferRefund}
        currentTransaction={transaction}
        allTransactions={allTransactions}
      />
    </div>
  );
}; 