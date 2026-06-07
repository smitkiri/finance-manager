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

const STATUS_CLASS: Record<Subscription['status'], string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  possibly_cancelled: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  manual: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
};

export const SubscriptionRow: React.FC<Props> = ({ sub, onClick }) => (
  <tr onClick={onClick} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
    <td className="py-3 px-4">
      <div className="flex items-center gap-2">
        <Repeat size={16} className="text-gray-400" />
        <span className="font-medium text-gray-900 dark:text-white">{sub.name}</span>
      </div>
    </td>
    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 capitalize">{sub.cadence}</td>
    <td className="py-3 px-4 text-sm md:text-xs font-medium text-gray-900 dark:text-white">
      ${sub.expected_amount.toFixed(2)}
    </td>
    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{sub.last_seen ?? '—'}</td>
    <td className="py-3 px-4">
      <span className={`px-2 py-1 rounded text-xs ${STATUS_CLASS[sub.status]}`}>
        {STATUS_LABEL[sub.status]}
      </span>
    </td>
  </tr>
);
