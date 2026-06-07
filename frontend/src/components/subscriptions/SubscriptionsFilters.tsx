import React from 'react';
import type { SubscriptionStatus } from '../../types';

interface Props {
  status: SubscriptionStatus[];
  onStatusChange: (s: SubscriptionStatus[]) => void;
}

const STATUS_OPTIONS: { label: string; value: SubscriptionStatus[] }[] = [
  { label: 'Active', value: ['active', 'possibly_cancelled'] },
  { label: 'Cancelled', value: ['cancelled'] },
  { label: 'Manual', value: ['manual'] },
  { label: 'All', value: ['active', 'possibly_cancelled', 'cancelled', 'manual'] },
];

const isSame = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export const SubscriptionsFilters: React.FC<Props> = ({ status, onStatusChange }) => (
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
  </div>
);
