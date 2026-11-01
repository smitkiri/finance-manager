import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Sheet } from '../ui/Sheet';
import { ApiClient } from '../../utils/apiClient';
import { formatMonthLabel, formatWhole } from '../../utils/budget';

export type BudgetLimitSheetMode =
  | { kind: 'add'; availableCategories: string[] }
  | { kind: 'edit'; category: string; limit: number };

interface BudgetLimitSheetProps {
  isOpen: boolean;
  onClose: () => void;
  month: string;
  mode: BudgetLimitSheetMode;
  onSaved: () => void;
}

const WHOLE_DOLLARS = /^\d+$/;

const FIELD =
  'w-full px-3 py-3 min-h-[48px] md:py-2 md:min-h-0 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white';

export const BudgetLimitSheet: React.FC<BudgetLimitSheetProps> = ({
  isOpen,
  onClose,
  month,
  mode,
  onSaved,
}) => {
  const [category, setCategory] = useState(mode.kind === 'edit' ? mode.category : '');
  const [amount, setAmount] = useState(mode.kind === 'edit' ? String(mode.limit) : '');
  const [typical, setTypical] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode.kind !== 'add' || !category) return;
    let cancelled = false;
    setTypical(null);
    ApiClient.getBudgetTypical(category, month)
      .then((value) => {
        if (cancelled) return;
        setTypical(value);
        setAmount(value === null ? '' : String(value));
      })
      .catch(() => {
        if (!cancelled) setAmount('');
      });
    return () => {
      cancelled = true;
    };
  }, [mode.kind, category, month]);

  const save = async (next: number | null) => {
    setSaving(true);
    try {
      await ApiClient.saveBudget({ category, month, amount: next });
      toast.success(next === null ? 'Limit removed' : 'Budget saved');
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to save budget');
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && category !== '' && WHOLE_DOLLARS.test(amount);

  const footer = (
    <div className="flex items-center justify-between gap-3">
      {mode.kind === 'edit' ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(null)}
          className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-md text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
        >
          Remove limit
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        disabled={!canSave}
        onClick={() => void save(Number(amount))}
        className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-md text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={mode.kind === 'add' ? 'Add a limit' : `${mode.category} limit`}
      footer={footer}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {`Applies from ${formatMonthLabel(month)} onward.`}
        </p>
        {mode.kind === 'add' && (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Category</span>
            <select
              className={FIELD}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {mode.availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Monthly limit
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            className={FIELD}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {typical !== null && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{`Typical month: ${formatWhole(typical)}`}</p>
        )}
      </div>
    </Sheet>
  );
};
