import { Expense, ReportFilter, ReportData, Report } from '../types';
import { generateId } from '../utils';

export const applyReportFilters = (expenses: Expense[], filters: ReportFilter): Expense[] => {
  return expenses.filter(expense => {
    // Date range filter
    if (filters.dateRange) {
      const expenseDate = new Date(expense.date);
      if (expenseDate < filters.dateRange.start || expenseDate > filters.dateRange.end) {
        return false;
      }
    }

    // Category filter
    if (filters.categories && filters.categories.length > 0) {
      if (!filters.categories.includes(expense.category)) {
        return false;
      }
    }

    // Label filter
    if (filters.labels && filters.labels.length > 0) {
      const expenseLabels = expense.labels || [];
      if (!filters.labels.some(label => expenseLabels.includes(label))) {
        return false;
      }
    }

    // Type filter
    if (filters.types && filters.types.length > 0) {
      if (!filters.types.includes(expense.type)) {
        return false;
      }
    }

    // Source filter
    if (filters.sources && filters.sources.length > 0) {
      const expenseSourceId = expense.metadata?.sourceId;
      if (!expenseSourceId || !filters.sources.includes(expenseSourceId)) {
        return false;
      }
    }

    // Amount range filter
    if (filters.minAmount !== undefined && expense.amount < filters.minAmount) {
      return false;
    }
    if (filters.maxAmount !== undefined && expense.amount > filters.maxAmount) {
      return false;
    }

    return true;
  });
};

export const generateReportData = (
  report: Report,
  filteredExpenses: Expense[]
): ReportData => {
  // Calculate category breakdown
  const categoryBreakdown: { [category: string]: number } = {};
  let totalExpenses = 0;
  let totalIncome = 0;

  filteredExpenses.forEach(expense => {
    if (expense.type === 'expense') {
      totalExpenses += expense.amount;
      categoryBreakdown[expense.category] = (categoryBreakdown[expense.category] || 0) + expense.amount;
    } else {
      totalIncome += expense.amount;
    }
  });

  // Calculate monthly data
  const monthlyData = filteredExpenses.reduce((acc, exp) => {
    const month = new Date(exp.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    const existing = acc.find(item => item.month === month);
    
    if (existing) {
      if (exp.type === 'expense') {
        existing.expenses += Math.abs(exp.amount);
      } else {
        existing.income += exp.amount;
      }
    } else {
      acc.push({
        month,
        expenses: exp.type === 'expense' ? Math.abs(exp.amount) : 0,
        income: exp.type === 'income' ? exp.amount : 0,
      });
    }
    
    return acc;
  }, [] as { month: string; expenses: number; income: number }[]);

  return {
    report,
    transactions: filteredExpenses,
    categoryBreakdown,
    totalExpenses,
    totalIncome,
    netAmount: totalIncome - totalExpenses,
    monthlyData: monthlyData.sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime())
  };
};

export const createReport = (
  name: string,
  description: string,
  filters: ReportFilter,
  expenses: Expense[]
): Report => {
  const filteredExpenses = applyReportFilters(expenses, filters);
  const totalAmount = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  return {
    id: generateId(),
    name,
    description,
    filters,
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    transactionCount: filteredExpenses.length,
    totalAmount
  };
}; 