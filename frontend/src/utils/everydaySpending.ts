import type { DateRange } from '../types';

// A month is a spike when it is at least this multiple of the typical month.
export const SPIKE_MULTIPLE = 2;

export interface EverydayMonth {
  month: string;
  amount: number;
  isSpike: boolean;
}

export interface EverydayRow {
  category: string;
  typical: number;
  min: number;
  max: number;
  plainMean: number;
  months: EverydayMonth[];
}

export interface EverydaySummary {
  rows: EverydayRow[];
  totalTypical: number;
  countedMonths: string[];
}

// Matches Postgres to_char(date, 'Mon YYYY') used by /api/stats
const monthLabel = (year: number, month: number): string =>
  new Date(year, month, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

const dayKey = (d: Date): number => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();

/**
 * Full calendar months inside the range, oldest first, excluding the current
 * month. All comparisons use local dates so a range picked in the browser's
 * timezone is not shifted by UTC conversion.
 */
export function getCountedMonths(range: DateRange, today: Date): string[] {
  const startKey = dayKey(range.start);
  const endKey = dayKey(range.end);
  const currentMonthIndex = today.getFullYear() * 12 + today.getMonth();

  const months: string[] = [];
  let year = range.start.getFullYear();
  let month = range.start.getMonth();
  while (year * 12 + month < currentMonthIndex) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    if (dayKey(first) > endKey) break;
    if (dayKey(first) >= startKey && dayKey(last) <= endKey) {
      months.push(monthLabel(year, month));
    }
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export function summarizeEverydaySpending(args: {
  monthlyCategoryData: Record<string, string | number>[];
  pinned: string[];
  knownCategories: string[];
  range: DateRange;
  today: Date;
}): EverydaySummary {
  const { monthlyCategoryData, pinned, knownCategories, range, today } = args;
  const countedMonths = getCountedMonths(range, today);
  if (countedMonths.length === 0) return { rows: [], totalTypical: 0, countedMonths: [] };

  const byMonth = new Map(monthlyCategoryData.map((row) => [String(row.month), row]));
  const known = new Set(knownCategories);

  const rows = pinned
    .filter((category) => known.has(category))
    .map((category): EverydayRow => {
      const amounts = countedMonths.map((month) => Number(byMonth.get(month)?.[category] ?? 0));
      const typical = median(amounts);
      return {
        category,
        typical,
        min: Math.min(...amounts),
        max: Math.max(...amounts),
        plainMean: amounts.reduce((sum, a) => sum + a, 0) / amounts.length,
        months: countedMonths.map((month, i) => ({
          month,
          amount: amounts[i],
          isSpike: typical > 0 && amounts[i] >= typical * SPIKE_MULTIPLE,
        })),
      };
    });

  return {
    rows,
    totalTypical: rows.reduce((sum, row) => sum + row.typical, 0),
    countedMonths,
  };
}
