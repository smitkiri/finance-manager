import { Expense, ExpenseStats, DateRange } from './types';

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
  const totalExpenses = expenses
    .filter(exp => exp.type === 'expense')
    .reduce((sum, exp) => sum + Math.abs(exp.amount), 0);
    
  const totalIncome = expenses
    .filter(exp => exp.type === 'income')
    .reduce((sum, exp) => sum + exp.amount, 0);
    
  const netAmount = totalIncome - totalExpenses;
  
  const categoryBreakdown: { [key: string]: number } = {};
  expenses
    .filter(exp => exp.type === 'expense')
    .forEach(exp => {
      categoryBreakdown[exp.category] = (categoryBreakdown[exp.category] || 0) + Math.abs(exp.amount);
    });
    
  const monthlyData = expenses.reduce((acc, exp) => {
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
    totalExpenses,
    totalIncome,
    netAmount,
    categoryBreakdown,
    monthlyData: monthlyData.sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime()),
  };
};

export const filterExpensesByDateRange = (expenses: Expense[], dateRange: DateRange): Expense[] => {
  return expenses.filter(expense => {
    const expenseDate = new Date(expense.date);
    return expenseDate >= dateRange.start && expenseDate <= dateRange.end;
  });
};

export const parseCSV = (csvText: string): Expense[] => {
  const lines = csvText.trim().split('\n');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const headers = lines[0].split(',');
  
  return lines.slice(1)
    .filter((line) => {
      const values = line.split(',');
      const type = values[4] || '';
      // Ignore rows with type "Payment"
      return type !== 'Payment';
    })
    .map((line, index) => {
      const values = line.split(',');
      const amount = parseFloat(values[5]) || 0;
      
      return {
        id: generateId(),
        date: values[0],
        description: values[2],
        category: values[3] || 'Uncategorized',
        amount: Math.abs(amount),
        type: amount < 0 ? 'expense' : 'income',
        memo: values[6] || '',
      };
    });
}; 