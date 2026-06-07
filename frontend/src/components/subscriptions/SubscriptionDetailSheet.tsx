import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Lock, Plus, Trash2, X as XIcon } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import type { SubscriptionCadence, SubscriptionDetail } from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { TransactionPicker } from './TransactionPicker';

interface Props {
  subscriptionId: string;
  onClose: () => void;
  onChanged: () => void;
}

const CADENCES: SubscriptionCadence[] = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'];

export const SubscriptionDetailSheet: React.FC<Props> = ({
  subscriptionId,
  onClose,
  onChanged,
}) => {
  const [sub, setSub] = useState<SubscriptionDetail | null>(null);
  const [picker, setPicker] = useState(false);
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState<SubscriptionCadence>('monthly');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    void ApiClient.getSubscription(subscriptionId).then((s) => {
      setSub(s);
      setName(s.name);
      setCadence(s.cadence);
      setAmount(String(s.expected_amount));
    });
  }, [subscriptionId]);

  if (!sub) return null;

  const persistField = async (patch: {
    name?: string;
    cadence?: SubscriptionCadence;
    expected_amount?: number;
  }) => {
    const updated = await ApiClient.patchSubscription(sub.id, patch);
    setSub({ ...sub, ...updated });
    onChanged();
  };

  const removeMember = async (txnId: string) => {
    const updated = await ApiClient.removeSubscriptionMember(sub.id, txnId);
    setSub({
      ...sub,
      ...updated,
      members: sub.members.filter((m) => m.id !== txnId),
    });
    onChanged();
  };

  const addMembers = async (ids: string[]) => {
    setPicker(false);
    if (!ids.length) return;
    await ApiClient.addSubscriptionMembers(sub.id, ids);
    const fresh = await ApiClient.getSubscription(sub.id);
    setSub(fresh);
    onChanged();
    toast.success(`Added ${ids.length} transaction${ids.length === 1 ? '' : 's'}`);
  };

  const toggleCancelled = async () => {
    const newStatus = sub.status === 'cancelled' ? 'active' : 'cancelled';
    const updated = await ApiClient.patchSubscription(sub.id, { status: newStatus });
    setSub({ ...sub, ...updated });
    onChanged();
  };

  const deleteSub = async () => {
    if (!window.confirm('Delete this subscription? Member transactions will be unlinked.')) return;
    await ApiClient.deleteSubscription(sub.id);
    onChanged();
    onClose();
  };

  if (picker) {
    return (
      <Sheet isOpen onClose={onClose} title="Add transactions">
        <TransactionPicker
          type={sub.type}
          excludeIds={sub.members.map((m) => m.id)}
          onSelect={addMembers}
          onCancel={() => setPicker(false)}
        />
      </Sheet>
    );
  }

  const footer = (
    <div className="space-y-2">
      <button
        onClick={toggleCancelled}
        className="w-full py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700"
      >
        {sub.status === 'cancelled' ? 'Reactivate' : 'Mark cancelled'}
      </button>
      <button
        onClick={deleteSub}
        className="w-full py-3 min-h-[48px] rounded-lg text-red-600 border border-red-200 dark:border-red-900 flex items-center justify-center gap-2"
      >
        <Trash2 size={16} /> Delete subscription
      </button>
    </div>
  );

  return (
    <Sheet isOpen onClose={onClose} title={sub.name} footer={footer}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1">
            Name {sub.user_overrides.lockName && <Lock size={12} />}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name !== sub.name) void persistField({ name });
            }}
            className="mt-1 w-full px-3 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
          />
        </label>

        <label className="block">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1">
            Cadence {sub.user_overrides.lockCadence && <Lock size={12} />}
          </span>
          <select
            value={cadence}
            onChange={(e) => {
              const v = e.target.value as SubscriptionCadence;
              setCadence(v);
              void persistField({ cadence: v });
            }}
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
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 flex items-center gap-1">
            Expected amount {sub.user_overrides.lockAmount && <Lock size={12} />}
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => {
              const n = parseFloat(amount);
              if (!Number.isNaN(n) && n !== sub.expected_amount) {
                void persistField({ expected_amount: n });
              }
            }}
            inputMode="decimal"
            className="mt-1 w-full px-3 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
          />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Members ({sub.members.length})
            </h3>
            <button
              onClick={() => setPicker(true)}
              className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:px-3 md:py-1 flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm"
            >
              <Plus size={16} /> <span className="hidden md:inline">Add</span>
            </button>
          </div>
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
            {sub.members.map((m) => (
              <li key={m.id} className="py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {m.description}
                  </div>
                  <div className="text-xs text-gray-500">
                    {m.date} · ${Number(m.amount).toFixed(2)}
                  </div>
                </div>
                <button
                  onClick={() => void removeMember(m.id)}
                  aria-label="Remove member"
                  className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-400 hover:text-red-500"
                >
                  <XIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
};
