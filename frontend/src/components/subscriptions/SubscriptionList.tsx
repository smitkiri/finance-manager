import React from 'react';
import type { Subscription } from '../../types';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SubscriptionRow } from './SubscriptionRow';
import { SubscriptionCard } from './SubscriptionCard';
import { PriceIncreaseBanner } from './PriceIncreaseBanner';

interface Props {
  subscriptions: Subscription[];
  onSelect: (sub: Subscription) => void;
}

export const SubscriptionList: React.FC<Props> = ({ subscriptions, onSelect }) => {
  const bp = useBreakpoint();

  if (subscriptions.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 dark:text-gray-400">
        No subscriptions yet. Try running detection or adding one manually.
      </div>
    );
  }

  if (bp === 'mobile') {
    return (
      <div className="space-y-3">
        {subscriptions.map((s) => (
          <SubscriptionCard key={s.id} sub={s} onClick={() => onSelect(s)} />
        ))}
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <tr>
          <th className="py-2 px-4">Name</th>
          <th className="py-2 px-4">Cadence</th>
          <th className="py-2 px-4">Amount</th>
          <th className="py-2 px-4">Last charged</th>
          <th className="py-2 px-4">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
        {subscriptions.map((s) => (
          <React.Fragment key={s.id}>
            <SubscriptionRow sub={s} onClick={() => onSelect(s)} />
            {s.price_change && (
              <tr>
                <td colSpan={5} className="px-4 pb-3">
                  <PriceIncreaseBanner info={s.price_change} />
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
};
