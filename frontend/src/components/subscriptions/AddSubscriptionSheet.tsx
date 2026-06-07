import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Sheet } from '../ui/Sheet';
import { ApiClient } from '../../utils/apiClient';
import type { SubscriptionCadence } from '../../types';
import { TransactionPicker } from './TransactionPicker';

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const CADENCES: SubscriptionCadence[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'];

export const AddSubscriptionSheet: React.FC<Props> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState<SubscriptionCadence>('monthly');
  const [amount, setAmount] = useState('');
  const [pickedTxnIds, setPickedTxnIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canSubmit = name.trim() && amount && !Number.isNaN(parseFloat(amount));

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const created = await ApiClient.createSubscription({
        name: name.trim(),
        cadence,
        expected_amount: parseFloat(amount),
        transactionIds: pickedTxnIds,
      });
      toast.success(`Created "${created.name}"`);
      onCreated(created.id);
    } catch {
      toast.error('Failed to create subscription');
    } finally {
      setBusy(false);
    }
  };

  if (pickerOpen) {
    return (
      <Sheet isOpen onClose={onClose} title="Pick transactions">
        <TransactionPicker
          onSelect={(ids) => {
            setPickedTxnIds(ids);
            setPickerOpen(false);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      </Sheet>
    );
  }

  const footer = (
    <div className="flex gap-2">
      <button
        onClick={onClose}
        className="flex-1 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700"
      >
        Cancel
      </button>
      <button
        onClick={submit}
        disabled={!canSubmit || busy}
        className="flex-1 py-3 min-h-[48px] rounded-lg bg-blue-600 text-white disabled:opacity-50"
      >
        {busy ? 'Creating…' : 'Create'}
      </button>
    </div>
  );

  return (
    <Sheet isOpen onClose={onClose} title="Add subscription" footer={footer}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500">Cadence</span>
          <select
            value={cadence}
            onChange={(e) => setCadence(e.target.value as SubscriptionCadence)}
            className="mt-1 w-full px-3 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500">Expected amount</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full px-3 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
          />
        </label>

        <div>
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full py-3 min-h-[48px] rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300"
          >
            {pickedTxnIds.length > 0
              ? `Selected ${pickedTxnIds.length} starting transaction${pickedTxnIds.length === 1 ? '' : 's'}`
              : 'Pick starting transactions (optional)'}
          </button>
        </div>
      </div>
    </Sheet>
  );
};
