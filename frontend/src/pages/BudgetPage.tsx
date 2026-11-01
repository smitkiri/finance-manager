import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { ApiClient } from '../utils/apiClient';
import {
  formatMonthLabel,
  isOver,
  lastFullMonth,
  resolveMonthParam,
  shiftMonth,
  sortBudgetRows,
} from '../utils/budget';
import { BudgetRow } from '../components/budget/BudgetRow';
import type { BudgetCategory, BudgetMonthResponse } from '../types';

const NAV_BUTTON =
  'min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent';

const PRIMARY_BUTTON =
  'px-4 py-2 min-h-[44px] md:min-h-0 inline-flex items-center gap-2 rounded-md text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors';

export const BudgetPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<BudgetMonthResponse | null>(null);
  const [version] = useState(0);
  const [, setEditing] = useState<BudgetCategory | null>(null);
  const [, setAdding] = useState(false);

  const param = searchParams.get('month');
  const earliestMonth = data?.earliestMonth ?? null;
  const month = resolveMonthParam(param, new Date(), earliestMonth);
  const latestMonth = lastFullMonth(new Date());

  // Keep the URL on the clamped month so reloads and back land somewhere valid.
  useEffect(() => {
    if (param !== month) setSearchParams({ month }, { replace: true });
  }, [param, month, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    ApiClient.getBudgets(month)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load budget');
      });
    return () => {
      cancelled = true;
    };
  }, [month, version]);

  const goTo = (next: string) => setSearchParams({ month: next });

  const rows = data && data.month === month ? sortBudgetRows(data.categories) : [];
  const loaded = data !== null && data.month === month;
  const overCount = rows.filter((r) => isOver(r.limit, r.actual)).length;
  const showRows = loaded && rows.length > 0 && data.hasData;

  const addButton = (
    <button type="button" onClick={() => setAdding(true)} className={PRIMARY_BUTTON}>
      <Plus size={16} />
      Add a limit
    </button>
  );

  const renderBody = () => {
    if (!loaded) return null;
    if (rows.length === 0) {
      return (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Set a monthly limit on the categories you want to spend less on.
          </p>
          {addButton}
        </div>
      );
    }
    if (!data.hasData) {
      return (
        <p className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">
          {`No transactions imported for ${formatMonthLabel(month)} yet.`}
        </p>
      );
    }
    return (
      <ul className="divide-y divide-gray-200 dark:divide-gray-800">
        {rows.map((row) => (
          <BudgetRow key={row.category} row={row} onEdit={setEditing} />
        ))}
      </ul>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Budget</h1>
        {showRows && addButton}
      </div>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              className={NAV_BUTTON}
              disabled={earliestMonth === null || month <= earliestMonth}
              onClick={() => goTo(shiftMonth(month, -1))}
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-base font-medium text-gray-900 dark:text-white min-w-[9rem] text-center">
              {formatMonthLabel(month)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              className={NAV_BUTTON}
              disabled={month >= latestMonth}
              onClick={() => goTo(shiftMonth(month, 1))}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          {showRows && (
            <span
              className={`text-sm ${
                overCount > 0
                  ? 'font-semibold text-red-600 dark:text-red-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {`${overCount} of ${rows.length} over`}
            </span>
          )}
        </div>
        {renderBody()}
      </div>
    </div>
  );
};
