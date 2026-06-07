import React from 'react';
import { Plus, RefreshCw } from 'lucide-react';

interface Props {
  monthlyBurn: number;
  lastDetectedAt: string | null;
  detecting: boolean;
  onDetect: () => void;
  onAdd: () => void;
}

const fmtRel = (iso: string | null): string => {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

export const SubscriptionsHeader: React.FC<Props> = ({
  monthlyBurn,
  lastDetectedAt,
  detecting,
  onDetect,
  onAdd,
}) => (
  <div className="space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Subscriptions</h1>
        <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Monthly burn:{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            ${monthlyBurn.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onDetect}
          disabled={detecting}
          className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:px-3 md:py-2 flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium disabled:opacity-50"
          aria-label="Re-run detection"
        >
          <RefreshCw size={16} className={detecting ? 'animate-spin' : ''} />
          <span className="hidden md:inline">Re-run detection</span>
        </button>
        <button
          onClick={onAdd}
          className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:px-3 md:py-2 flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          aria-label="Add subscription"
        >
          <Plus size={16} />
          <span className="hidden md:inline">Add subscription</span>
        </button>
      </div>
    </div>
    <div className="text-xs text-gray-500 dark:text-gray-400">
      Last detected: {fmtRel(lastDetectedAt)}
    </div>
  </div>
);
