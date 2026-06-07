import React from 'react';
import { Repeat } from 'lucide-react';
import type { Subscription } from '../../types';

interface Props {
  sub: Subscription;
  onClick: () => void;
}

const STATUS_LABEL: Record<Subscription['status'], string> = {
  active: 'Active',
  possibly_cancelled: 'Possibly cancelled',
  cancelled: 'Cancelled',
  manual: 'Manual',
};

export const SubscriptionCard: React.FC<Props> = ({ sub, onClick }) => (
  <button
    onClick={onClick}
    className="w-full text-left p-4 min-h-[80px] rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Repeat size={16} className="text-gray-400" />
          <span className="font-medium text-gray-900 dark:text-white truncate">{sub.name}</span>
        </div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 capitalize">
          {sub.cadence} · {sub.last_seen ? `last ${sub.last_seen}` : 'no charges'} ·{' '}
          {STATUS_LABEL[sub.status]}
        </div>
      </div>
      <div className="text-sm md:text-xs font-semibold shrink-0 text-red-600 dark:text-red-400">
        -${sub.expected_amount.toFixed(2)}
      </div>
    </div>
  </button>
);
