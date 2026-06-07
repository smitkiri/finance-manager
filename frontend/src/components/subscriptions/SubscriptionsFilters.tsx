import React from 'react';
import type { SubscriptionStatus, SubscriptionType } from '../../types';

interface Props {
  status: SubscriptionStatus[];
  type: SubscriptionType | null;
  onStatusChange: (s: SubscriptionStatus[]) => void;
  onTypeChange: (t: SubscriptionType | null) => void;
}

const STATUS_OPTIONS: { label: string; value: SubscriptionStatus[] }[] = [
  { label: 'Active', value: ['active', 'possibly_cancelled'] },
  { label: 'Cancelled', value: ['cancelled'] },
  { label: 'Manual', value: ['manual'] },
  { label: 'All', value: ['active', 'possibly_cancelled', 'cancelled', 'manual'] },
];

const TYPE_OPTIONS: { label: string; value: SubscriptionType | null }[] = [
  { label: 'All types', value: null },
  { label: 'Expenses', value: 'expense' },
  { label: 'Income', value: 'income' },
];

const isSame = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export const SubscriptionsFilters: React.FC<Props> = ({
  status,
  type,
  onStatusChange,
  onTypeChange,
}) => (
  <div className="flex flex-wrap gap-2">
    {STATUS_OPTIONS.map((o) => (
      <button
        key={o.label}
        onClick={() => onStatusChange(o.value)}
        className={`min-h-[44px] md:min-h-0 md:py-1 px-3 rounded-full text-sm border ${
          isSame(status, o.value)
            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-transparent'
            : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'
        }`}
      >
        {o.label}
      </button>
    ))}
    <div className="w-px bg-gray-200 dark:bg-gray-800 mx-1 hidden md:block" />
    {TYPE_OPTIONS.map((o) => (
      <button
        key={o.label}
        onClick={() => onTypeChange(o.value)}
        className={`min-h-[44px] md:min-h-0 md:py-1 px-3 rounded-full text-sm border ${
          type === o.value
            ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-transparent'
            : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
