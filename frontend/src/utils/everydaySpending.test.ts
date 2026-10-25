import { describe, it, expect } from 'vitest';
import { getCountedMonths, summarizeEverydaySpending } from './everydaySpending';

const today = new Date(2026, 9, 25); // Oct 25 2026
const fullRange = { start: new Date(2026, 3, 1), end: new Date(2026, 8, 30) }; // Apr 1 – Sep 30

const MONTHS = ['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'];

const rowsFor = (category: string, amounts: number[], months = MONTHS) =>
  months.map((month, i) => ({ month, [category]: amounts[i] }));

describe('getCountedMonths', () => {
  it('counts every full month in the range', () => {
    expect(getCountedMonths(fullRange, today)).toEqual(MONTHS);
  });

  it('drops partial first and last months', () => {
    const range = { start: new Date(2026, 3, 15), end: new Date(2026, 8, 20) };
    expect(getCountedMonths(range, today)).toEqual([
      'May 2026',
      'Jun 2026',
      'Jul 2026',
      'Aug 2026',
    ]);
  });

  it('excludes the current month even when the range covers it', () => {
    const toToday = { start: new Date(2026, 3, 1), end: new Date(2026, 9, 25) };
    expect(getCountedMonths(toToday, today).at(-1)).toBe('Sep 2026');
    const toMonthEnd = { start: new Date(2026, 3, 1), end: new Date(2026, 9, 31) };
    expect(getCountedMonths(toMonthEnd, today).at(-1)).toBe('Sep 2026');
  });

  it('returns nothing when the range sits inside the current month', () => {
    const range = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 25) };
    expect(getCountedMonths(range, today)).toEqual([]);
  });

  it('uses local dates, not UTC, at month boundaries', () => {
    // Late-evening local times that would roll into the next/previous day in UTC
    const range = { start: new Date(2026, 3, 1, 0, 0, 0), end: new Date(2026, 8, 30, 23, 59, 59) };
    expect(getCountedMonths(range, today)).toEqual(MONTHS);
  });
});

describe('summarizeEverydaySpending', () => {
  const base = { range: fullRange, today, knownCategories: ['Groceries', 'Food & Drink', 'Gas'] };

  it('uses the median for an odd number of months', () => {
    const range = { start: new Date(2026, 3, 1), end: new Date(2026, 7, 31) }; // Apr–Aug
    const summary = summarizeEverydaySpending({
      ...base,
      range,
      monthlyCategoryData: rowsFor('Groceries', [540, 600, 612, 690, 580]),
      pinned: ['Groceries'],
    });
    const row = summary.rows[0];
    expect(row.typical).toBe(600);
    expect(row.min).toBe(540);
    expect(row.max).toBe(690);
    expect(row.months.some((m) => m.isSpike)).toBe(false);
  });

  it('averages the two middle months for an even count', () => {
    const range = { start: new Date(2026, 3, 1), end: new Date(2026, 6, 31) }; // Apr–Jul
    const summary = summarizeEverydaySpending({
      ...base,
      range,
      monthlyCategoryData: rowsFor('Gas', [100, 200, 300, 400]),
      pinned: ['Gas'],
    });
    expect(summary.rows[0].typical).toBe(250);
  });

  it('counts months missing from the data as $0', () => {
    const data = rowsFor('Gas', [150, 160, 0, 170, 180, 190]).filter((r) => r.month !== 'Jun 2026');
    const summary = summarizeEverydaySpending({
      ...base,
      monthlyCategoryData: data,
      pinned: ['Gas'],
    });
    const row = summary.rows[0];
    expect(row.months.map((m) => m.month)).toEqual(MONTHS);
    expect(row.months.find((m) => m.month === 'Jun 2026')?.amount).toBe(0);
    expect(row.min).toBe(0);
  });

  it('flags spike months without letting them move the typical value', () => {
    const summary = summarizeEverydaySpending({
      ...base,
      monthlyCategoryData: rowsFor('Food & Drink', [400, 390, 1450, 410, 360, 405]),
      pinned: ['Food & Drink'],
    });
    const row = summary.rows[0];
    expect(row.typical).toBe(402.5);
    expect(row.max).toBe(1450);
    expect(row.months.filter((m) => m.isSpike).map((m) => m.month)).toEqual(['Jun 2026']);
    expect(row.plainMean).toBeCloseTo(569.17, 2);
  });

  it('handles a pinned category with no spending', () => {
    const summary = summarizeEverydaySpending({
      ...base,
      monthlyCategoryData: rowsFor('Groceries', [1, 2, 3, 4, 5, 6]),
      pinned: ['Gas'],
    });
    const row = summary.rows[0];
    expect(row.typical).toBe(0);
    expect(row.months.every((m) => m.amount === 0 && !m.isSpike)).toBe(true);
    expect(row.plainMean).toBe(0);
  });

  it('skips pinned names that are not household categories', () => {
    const summary = summarizeEverydaySpending({
      ...base,
      monthlyCategoryData: rowsFor('Gas', [1, 1, 1, 1, 1, 1]),
      pinned: ['Gas', 'Old Category'],
    });
    expect(summary.rows.map((r) => r.category)).toEqual(['Gas']);
  });

  it('keeps pinned order and sums typical values', () => {
    const data = MONTHS.map((month) => ({ month, Groceries: 600, Gas: 150 }));
    const summary = summarizeEverydaySpending({
      ...base,
      monthlyCategoryData: data,
      pinned: ['Gas', 'Groceries'],
    });
    expect(summary.rows.map((r) => r.category)).toEqual(['Gas', 'Groceries']);
    expect(summary.totalTypical).toBe(750);
    expect(summary.countedMonths).toEqual(MONTHS);
  });

  it('returns an empty summary when no full months are counted', () => {
    const summary = summarizeEverydaySpending({
      ...base,
      range: { start: new Date(2026, 9, 1), end: new Date(2026, 9, 25) },
      monthlyCategoryData: [{ month: 'Oct 2026', Gas: 50 }],
      pinned: ['Gas'],
    });
    expect(summary).toEqual({ rows: [], totalTypical: 0, countedMonths: [] });
  });
});
