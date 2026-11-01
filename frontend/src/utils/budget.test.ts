import { describe, it, expect } from 'vitest';
import {
  formatMonthLabel,
  historyCellState,
  isOver,
  lastFullMonth,
  resolveMonthParam,
  shiftMonth,
  sortBudgetRows,
} from './budget';
import type { BudgetCategory } from '../types';

const row = (category: string, limit: number, actual: number): BudgetCategory => ({
  category,
  limit,
  actual,
  inCategoryList: true,
  history: [],
});

describe('lastFullMonth', () => {
  it('is the month before today', () => {
    expect(lastFullMonth(new Date(2026, 10, 5))).toBe('2026-10');
  });

  it('wraps to December in January', () => {
    expect(lastFullMonth(new Date(2026, 0, 3))).toBe('2025-12');
  });
});

describe('shiftMonth', () => {
  it('wraps across year boundaries', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
  });
});

describe('formatMonthLabel', () => {
  it('spells out the month', () => {
    expect(formatMonthLabel('2026-10')).toBe('October 2026');
  });
});

describe('resolveMonthParam', () => {
  const today = new Date(2026, 10, 5);

  it('falls back to the last full month for invalid or missing params', () => {
    expect(resolveMonthParam('garbage', today, null)).toBe('2026-10');
    expect(resolveMonthParam(null, today, null)).toBe('2026-10');
    expect(resolveMonthParam('2026-13', today, null)).toBe('2026-10');
  });

  it('clamps the current and future months to the last full month', () => {
    expect(resolveMonthParam('2026-11', today, null)).toBe('2026-10');
    expect(resolveMonthParam('2027-02', today, null)).toBe('2026-10');
  });

  it('clamps months before the earliest limit', () => {
    expect(resolveMonthParam('2026-01', today, '2026-03')).toBe('2026-03');
    expect(resolveMonthParam('2026-05', today, '2026-03')).toBe('2026-05');
  });
});

describe('isOver', () => {
  it('treats equal as within', () => {
    expect(isOver(300, 300)).toBe(false);
    expect(isOver(300, 300.01)).toBe(true);
  });
});

describe('sortBudgetRows', () => {
  it('sortBudgetRows handles zero limit', () => {
    const rows = [
      row('D', 0, 0),
      row('C', 650, 588),
      row('E', 0, 5),
      row('B', 200, 231),
      row('A', 300, 462),
    ];
    expect(sortBudgetRows(rows).map((r) => r.category)).toEqual(['A', 'B', 'E', 'C', 'D']);
  });

  it('breaks ties by name', () => {
    expect(sortBudgetRows([row('Z', 100, 50), row('M', 100, 50)]).map((r) => r.category)).toEqual([
      'M',
      'Z',
    ]);
  });
});

describe('historyCellState', () => {
  it('is none without a limit or without data', () => {
    expect(historyCellState({ month: '2026-10', limit: null, actual: 10, hasData: true })).toBe(
      'none'
    );
    expect(historyCellState({ month: '2026-10', limit: 300, actual: 0, hasData: false })).toBe(
      'none'
    );
  });

  it('compares actual to limit', () => {
    expect(historyCellState({ month: '2026-10', limit: 300, actual: 300, hasData: true })).toBe(
      'within'
    );
    expect(historyCellState({ month: '2026-10', limit: 300, actual: 301, hasData: true })).toBe(
      'over'
    );
  });
});
