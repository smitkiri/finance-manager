import type { BudgetCategory, BudgetHistoryEntry } from '../types';

// Months are 'YYYY-MM' strings, which sort and compare lexically.
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
export const formatWhole = (amount: number): string => wholeDollars.format(amount);

const toMonth = (year: number, monthIndex: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

/** The most recent fully ended month, in local time. */
export function lastFullMonth(today: Date): string {
  return shiftMonth(toMonth(today.getFullYear(), today.getMonth()), -1);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + delta;
  return toMonth(Math.floor(index / 12), index % 12);
}

export function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Clamp a `?month=` value to [earliestMonth, lastFullMonth]. */
export function resolveMonthParam(
  param: string | null,
  today: Date,
  earliestMonth: string | null
): string {
  const latest = lastFullMonth(today);
  if (!param || !MONTH_PATTERN.test(param) || param > latest) return latest;
  if (earliestMonth && param < earliestMonth) return earliestMonth;
  return param;
}

export function isOver(limit: number, actual: number): boolean {
  return actual > limit;
}

const usedRatio = (row: BudgetCategory): number => (row.limit === 0 ? 0 : row.actual / row.limit);

/** Most over first, then within-limit rows by share of the limit used. */
export function sortBudgetRows(rows: BudgetCategory[]): BudgetCategory[] {
  return [...rows].sort((a, b) => {
    const aOver = isOver(a.limit, a.actual);
    const bOver = isOver(b.limit, b.actual);
    if (aOver !== bOver) return aOver ? -1 : 1;
    const diff = aOver ? b.actual - b.limit - (a.actual - a.limit) : usedRatio(b) - usedRatio(a);
    return diff !== 0 ? diff : a.category.localeCompare(b.category);
  });
}

export function historyCellState(entry: BudgetHistoryEntry): 'over' | 'within' | 'none' {
  if (entry.limit === null || !entry.hasData) return 'none';
  return isOver(entry.limit, entry.actual) ? 'over' : 'within';
}
