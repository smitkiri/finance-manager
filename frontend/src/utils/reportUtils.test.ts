import { describe, expect, it } from 'vitest';
import type { Expense, Report } from '../types';
import { applyReportFilters, generateReportData } from './reportUtils';

// Preserve the existing report calculation separately from dashboard accounting.
// A storage migration must retain these results, including the existing handling
// of exclusion flags and transfer-adjusted amounts.
const expenses: Expense[] = [
  { id: 'multi', amount: 10.1, labels: ['Flight', 'Hotel', 'Flight'] },
  { id: 'case', amount: 20.2, labels: ['flight'] },
  { id: 'empty', amount: 30.3, labels: [] },
  { id: 'excluded', amount: 40.4, labels: ['Flight'], excludedFromCalculations: true },
  { id: 'purchase', amount: 100, labels: ['Flight', 'Hotel'], effectiveAmount: 70 },
  { id: 'refund', amount: 30, type: 'income', labels: ['Hotel'], effectiveAmount: 0 },
].map((row) => ({
  date: '2024-01-15',
  description: 'Synthetic',
  category: 'Travel',
  user: 'alice',
  type: 'expense' as const,
  ...row,
})) as Expense[];

describe('label migration report baseline', () => {
  it('matches any exact label once, preserving case and empty-filter behavior', () => {
    expect(applyReportFilters(expenses, { labels: ['Flight', 'Hotel'] }).map((e) => e.id)).toEqual([
      'multi',
      'excluded',
      'purchase',
      'refund',
    ]);
    expect(applyReportFilters(expenses, { labels: ['flight'] }).map((e) => e.id)).toEqual(['case']);
    expect(applyReportFilters(expenses, { labels: ['FLIGHT'] })).toEqual([]);
    expect(applyReportFilters(expenses, { labels: ['Unknown'] })).toEqual([]);
    expect(applyReportFilters(expenses, { labels: [] })).toEqual(expenses);
  });

  it('retains report IDs, category totals and monthly totals after label deduplication', () => {
    const report: Report = {
      id: 'labels-report',
      name: 'Labels',
      filters: { labels: ['Flight', 'Hotel'] },
      createdAt: '2024-01-01',
      lastModified: '2024-01-01',
    };
    const result = generateReportData(report, applyReportFilters(expenses, report.filters));
    expect(result.transactions.map((e) => e.id)).toEqual([
      'multi',
      'excluded',
      'purchase',
      'refund',
    ]);
    expect(result.totalExpenses).toBeCloseTo(150.5, 8);
    expect(result.totalIncome).toBe(30);
    expect(result.netAmount).toBeCloseTo(-120.5, 8);
    expect(result.categoryBreakdown).toEqual({ Travel: 150.5 });
    expect(result.monthlyData).toEqual([{ month: 'Jan 2024', expenses: 150.5, income: 30 }]);

    const normalized = expenses.map((expense) => ({
      ...expense,
      labels: [...new Set(expense.labels)].sort(),
    }));
    const after = generateReportData(report, applyReportFilters(normalized, report.filters));
    expect(after.transactions.map((e) => e.id)).toEqual(result.transactions.map((e) => e.id));
    expect(after.totalExpenses).toBe(result.totalExpenses);
    expect(after.totalIncome).toBe(result.totalIncome);
    expect(after.categoryBreakdown).toEqual(result.categoryBreakdown);
    expect(after.monthlyData).toEqual(result.monthlyData);
  });
});
