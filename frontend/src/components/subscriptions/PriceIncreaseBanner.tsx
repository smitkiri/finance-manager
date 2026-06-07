import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { PriceChangeInfo } from '../../types';

interface Props {
  info: PriceChangeInfo;
}

export const PriceIncreaseBanner: React.FC<Props> = ({ info }) => (
  <div
    role="status"
    className="flex items-center gap-2 px-3 py-2 text-xs rounded-md
               bg-amber-50 dark:bg-amber-900/20
               text-amber-800 dark:text-amber-300
               border border-amber-200 dark:border-amber-900/40"
  >
    <TrendingUp size={14} className="shrink-0" />
    <span>
      Price went up by{' '}
      <strong>
        ${info.delta_amount.toFixed(2)} ({info.percent_change.toFixed(1)}%)
      </strong>{' '}
      since {info.period_label}
    </span>
  </div>
);
