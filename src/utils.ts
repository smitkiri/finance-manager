import { Expense, ExpenseStats, DateRange } from './types';
// import { filterTransfersForCalculations } from './utils/transferDetection';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const calculateStats = (expenses: Expense[]): ExpenseStats => {
  // Expenses should already be filtered by transfer logic when passed from components
  // No need to filter again here as it would lose the user context
  const filteredExpenses = expenses;
  
  const totalExpenses = filteredExpenses
    .filter(exp => exp.type === 'expense')
    .reduce((sum, exp) => sum + Math.abs(exp.amount), 0);
    
  const totalIncome = filteredExpenses
    .filter(exp => exp.type === 'income')
    .reduce((sum, exp) => sum + exp.amount, 0);
    
  const netAmount = totalIncome - totalExpenses;
  
  const categoryBreakdown: { [key: string]: number } = {};
  filteredExpenses
    .filter(exp => exp.type === 'expense')
    .forEach(exp => {
      const category = exp.category || 'Uncategorized';
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + Math.abs(exp.amount);
    });
    
  // Use ISO string for sorting, displayMonth for chart
  const monthlyMap = new Map<string, { month: string; displayMonth: string; expenses: number; income: number }>();
  filteredExpenses.forEach(exp => {
    const date = new Date(exp.date);
    const isoMonth = date.toISOString().slice(0, 7); // YYYY-MM
    const displayMonth = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    if (!monthlyMap.has(isoMonth)) {
      monthlyMap.set(isoMonth, {
        month: isoMonth,
        displayMonth,
        expenses: 0,
        income: 0,
      });
    }
    const entry = monthlyMap.get(isoMonth)!;
    if (exp.type === 'expense') {
      entry.expenses += Math.abs(exp.amount);
    } else {
      entry.income += exp.amount;
    }
  });
  const monthlyData = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  // For backward compatibility, also provide month as displayMonth
  const chartMonthlyData = monthlyData.map(({ displayMonth, expenses, income }) => ({ month: displayMonth, expenses, income }));
  
  return {
    totalExpenses,
    totalIncome,
    netAmount,
    categoryBreakdown,
    monthlyData: chartMonthlyData,
  };
};

export const filterExpensesByDateRange = (expenses: Expense[], dateRange: DateRange): Expense[] => {
  return expenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return expenseDate >= dateRange.start && expenseDate <= dateRange.end;
  });
}; 