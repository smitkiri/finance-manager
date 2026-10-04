import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Tag,
  DollarSign,
  Clock,
  Database,
  ArrowRightLeft,
  Repeat,
  Copy,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { Expense, Subscription, TransferGroupDetail } from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { formatDate } from '../../utils';
import { countState } from '../../utils/transferGroups';
import { TransferGroupSelector } from './TransferGroupSelector';
import { TransferGroupSection } from './TransferGroupSection';
import { Sheet } from '../ui/Sheet';
import { CountedAmount } from '../ui/CountedAmount';

interface TransactionDetailsModalProps {
  transaction: Expense | null;
  isOpen: boolean;
  onClose: () => void;
  onExcludeToggle?: (transactionId: string, exclude: boolean) => void;
  /** Create (no groupId) or replace the members of a transfer/refund group. */
  onSaveTransferGroup?: (anchorId: string, memberIds: string[], groupId?: string) => void;
  onUnlinkTransferGroup?: (groupId: string) => void;
  onToggleTransferGroupInclude?: (groupId: string, include: boolean) => void;
  onOpenTransaction?: (transaction: Expense) => void;
  onDuplicate?: (transaction: Expense) => void;
  selectedUserId?: string | null;
}

interface SelectorState {
  anchor: Expense;
  memberIds?: string[];
  groupId?: string;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onExcludeToggle,
  onSaveTransferGroup,
  onUnlinkTransferGroup,
  onToggleTransferGroupInclude,
  onOpenTransaction,
  onDuplicate,
  selectedUserId = null,
}) => {
  const [selector, setSelector] = useState<SelectorState | null>(null);
  const [subPicker, setSubPicker] = useState(false);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!subPicker || !transaction) return;
    void ApiClient.listSubscriptions({
      status: ['active', 'manual', 'possibly_cancelled'],
    }).then((res) => setSubs(res.subscriptions));
  }, [subPicker, transaction]);

  if (!isOpen || !transaction) return null;

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const isTransfer = !!transaction.transferGroup;
  const isExcludedFromCalculations =
    transaction.excludedFromCalculations === true ||
    countState(transaction, selectedUserId) === 'offset';

  const handleExcludeToggle = (exclude: boolean) => {
    if (onExcludeToggle) {
      onExcludeToggle(transaction.id, exclude);
    }
  };

  const openGroupEditor = (group: TransferGroupDetail) => {
    const [anchor, ...members] = group.transactions;
    setSelector({ anchor, memberIds: members.map((m) => m.id), groupId: group.id });
  };

  const showInlineActions = !isTransfer && (onExcludeToggle || onSaveTransferGroup);

  const footer = (
    <div className="flex flex-col gap-2">
      {showInlineActions && onExcludeToggle && (
        <button
          type="button"
          onClick={() => handleExcludeToggle(!isExcludedFromCalculations)}
          className={`w-full py-3 min-h-[48px] text-sm font-medium rounded-lg transition-colors ${
            isExcludedFromCalculations
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {isExcludedFromCalculations ? 'Include in Calculations' : 'Exclude from Calculations'}
        </button>
      )}
      {showInlineActions && onSaveTransferGroup && (
        <button
          type="button"
          onClick={() => setSelector({ anchor: transaction })}
          className="w-full py-3 min-h-[48px] flex items-center justify-center space-x-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
        >
          <ArrowRightLeft size={16} />
          <span>Mark as Transfer/Refund</span>
        </button>
      )}
      {!isTransfer && transaction.type === 'expense' && (
        <button
          type="button"
          onClick={() => setSubPicker((v) => !v)}
          className="w-full py-3 min-h-[48px] flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          <Repeat size={16} />
          Add to subscription
        </button>
      )}
      {onDuplicate && (
        <button
          type="button"
          onClick={() => onDuplicate(transaction)}
          className="w-full py-3 min-h-[48px] flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Copy size={16} />
          Duplicate Transaction
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="w-full py-3 min-h-[48px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
      >
        Close
      </button>
    </div>
  );

  const title = (
    <div className="flex items-center space-x-3">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center ${
          transaction.type === 'expense'
            ? 'bg-red-100 dark:bg-red-900/30'
            : 'bg-green-100 dark:bg-green-900/30'
        }`}
      >
        <DollarSign
          size={18}
          className={
            transaction.type === 'expense'
              ? 'text-red-600 dark:text-red-400'
              : 'text-green-600 dark:text-green-400'
          }
        />
      </div>
      <div>
        <div className="text-base font-semibold text-gray-900 dark:text-white">
          Transaction Details
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {transaction.type === 'expense' ? 'Expense' : 'Income'}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <Sheet isOpen={isOpen} onClose={onClose} title={title} footer={footer}>
        <div className="space-y-6">
          {isTransfer && (
            <TransferGroupSection
              transaction={transaction}
              selectedUserId={selectedUserId}
              onOpenTransaction={onOpenTransaction}
              onEdit={onSaveTransferGroup ? openGroupEditor : undefined}
              onUnlink={onUnlinkTransferGroup}
              onToggleInclude={onToggleTransferGroupInclude}
            />
          )}

          {!isTransfer && (
            <div className="flex items-center space-x-2">
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  isExcludedFromCalculations
                    ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                    : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700'
                }`}
              >
                {isExcludedFromCalculations
                  ? 'Excluded from calculations'
                  : 'Included in calculations'}
              </span>
            </div>
          )}

          <div className="text-center">
            <CountedAmount expense={transaction} selectedUserId={selectedUserId} size="lg" />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Description
            </h3>
            <p className="text-gray-700 dark:text-gray-300 break-words">
              {transaction.description}
            </p>
          </div>

          {subPicker && (
            <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-800 max-h-48 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setSubPicker(false);
                  onClose();
                  navigate('/subscriptions');
                }}
                className="w-full text-left py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm text-blue-600"
              >
                + New subscription…
              </button>
              {subs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={async () => {
                    try {
                      await ApiClient.addSubscriptionMembers(s.id, [transaction.id]);
                      setSubPicker(false);
                      toast.success(`Added to "${s.name}"`);
                    } catch {
                      toast.error('Failed to add to subscription');
                    }
                  }}
                  className="w-full text-left py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm flex justify-between"
                >
                  <span>{s.name}</span>
                  <span className="text-xs text-gray-500 capitalize">{s.cadence}</span>
                </button>
              ))}
              {subs.length === 0 && (
                <div className="text-xs text-gray-500 py-2 px-2">
                  No matching subscriptions yet.
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <Calendar size={16} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-gray-500 dark:text-gray-400">Transaction Date</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {formatDate(transaction.date)}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <Tag size={16} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-gray-500 dark:text-gray-400">Category</p>
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {transaction.category}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-xs text-white font-medium">
                  {transaction.user.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-gray-500 dark:text-gray-400">User</p>
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {transaction.user}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <Database size={16} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-gray-500 dark:text-gray-400">Source</p>
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {transaction.metadata?.sourceName || 'Manual Entry'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <Clock size={16} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-gray-500 dark:text-gray-400">Created At</p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {transaction.metadata?.importedAt
                    ? formatDateTime(transaction.metadata.importedAt)
                    : 'Unknown'}
                </p>
              </div>
            </div>
          </div>

          {transaction.labels && transaction.labels.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Labels</h4>
              <div className="flex flex-wrap gap-2">
                {transaction.labels.map((label, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {transaction.metadata && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Creation Details
              </h3>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 break-words">
                {transaction.metadata.sourceId && (
                  <p>
                    <span className="font-medium">Source ID:</span> {transaction.metadata.sourceId}
                  </p>
                )}
                <p>
                  <span className="font-medium">Created at:</span>{' '}
                  {formatDateTime(transaction.metadata.importedAt)}
                </p>
                {transaction.importId && (
                  <p>
                    <span className="font-medium">Import ID:</span> {transaction.importId}
                  </p>
                )}
                {transaction.metadata?.teller?.details && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      Bank Details
                    </p>
                    {transaction.metadata.teller.details.counterparty?.name && (
                      <p>
                        <span className="font-medium">Merchant:</span>{' '}
                        {transaction.metadata.teller.details.counterparty.name}
                      </p>
                    )}
                    {transaction.metadata.teller.details.category && (
                      <p>
                        <span className="font-medium">Bank Category:</span>{' '}
                        {transaction.metadata.teller.details.category}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Sheet>

      {selector && (
        <TransferGroupSelector
          isOpen
          onClose={() => setSelector(null)}
          anchor={selector.anchor}
          initialMemberIds={selector.memberIds}
          onConfirm={(memberIds) => {
            onSaveTransferGroup?.(selector.anchor.id, memberIds, selector.groupId);
            setSelector(null);
          }}
        />
      )}
    </>
  );
};
