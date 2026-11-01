import React from 'react';
import { formatWhole, historyCellState, isOver } from '../../utils/budget';
import type { BudgetCategory, BudgetHistoryEntry } from '../../types';

interface BudgetRowProps {
  row: BudgetCategory;
  onEdit: (row: BudgetCategory) => void;
}

const CELL_CLASSES = {
  over: 'bg-red-600',
  within: 'bg-green-600',
  none: 'bg-gray-200 dark:bg-gray-700',
} as const;

const shortMonth = (month: string): string => {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const cellLabel = (entry: BudgetHistoryEntry): string => {
  const label = shortMonth(entry.month);
  if (entry.limit === null) return `${label}: no limit`;
  if (!entry.hasData) return `${label}: no data`;
  return `${label}: ${formatWhole(entry.actual)} of ${formatWhole(entry.limit)}`;
};

export const BudgetRow: React.FC<BudgetRowProps> = ({ row, onEdit }) => {
  const over = isOver(row.limit, row.actual);
  const fill = row.limit === 0 ? (row.actual > 0 ? 1 : 0) : Math.min(row.actual / row.limit, 1);

  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(row)}
        className="w-full text-left py-3 px-1 grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_9rem_auto] gap-x-4 gap-y-2 items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-md transition-colors"
      >
        <span className="min-w-0">
          <span
            data-testid="budget-row-name"
            className="block text-sm text-gray-900 dark:text-white truncate"
          >
            {row.category}
          </span>
          {!row.inCategoryList && (
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Category no longer in your list
            </span>
          )}
        </span>
        <span className="col-span-2 md:col-span-1 md:order-none order-last h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <span
            className={`block h-full rounded-full ${over ? 'bg-red-600' : 'bg-green-600'}`}
            style={{ width: `${fill * 100}%` }}
          />
        </span>
        <span
          className={`text-sm font-semibold tabular-nums text-right ${
            over ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
          }`}
        >
          {formatWhole(row.actual)} / {formatWhole(row.limit)}
        </span>
        <span className="col-span-2 md:col-span-1 order-last flex gap-1">
          {row.history.map((entry) => (
            <span
              key={entry.month}
              title={cellLabel(entry)}
              aria-label={cellLabel(entry)}
              className={`w-3 h-3 rounded-sm ${CELL_CLASSES[historyCellState(entry)]}`}
            />
          ))}
        </span>
      </button>
    </li>
  );
};
