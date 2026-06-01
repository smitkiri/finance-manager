// Props: summary totals, optional 1-month delta, and a formatter.
import React from 'react';
import { NetWorthSummary } from '../../types';

interface NetWorthKpisProps {
  summary: NetWorthSummary | null;
  netWorthChange: number | null;
  formatCurrency: (n: number) => string;
}

export const NetWorthKpis: React.FC<NetWorthKpisProps> = ({
  summary,
  netWorthChange,
  formatCurrency,
}) => {
  const netWorthColor =
    (summary?.netWorth ?? 0) >= 0
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Net Worth</p>
        <p className={`text-2xl md:text-xl font-bold tabular-nums ${netWorthColor}`}>
          {formatCurrency(summary?.netWorth ?? 0)}
        </p>
        {netWorthChange !== null && (
          <p
            className={`text-sm mt-1 font-medium ${netWorthChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {netWorthChange >= 0 ? '+' : ''}
            {formatCurrency(netWorthChange)} vs 1mo ago
          </p>
        )}
      </div>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Assets</p>
        <p className="text-2xl md:text-xl font-bold text-green-600 dark:text-green-400 tabular-nums">
          {formatCurrency(summary?.totalAssets ?? 0)}
        </p>
      </div>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Liabilities</p>
        <p className="text-2xl md:text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">
          {formatCurrency(summary?.totalLiabilities ?? 0)}
        </p>
      </div>
    </div>
  );
};
