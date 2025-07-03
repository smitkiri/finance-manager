export interface Expense {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  type: 'expense' | 'income';
  memo?: string;
}

export interface Category {
  name: string;
  color: string;
  icon: string;
}

export interface ExpenseFormData {
  date: string;
  description: string;
  category: string;
  amount: string;
  type: 'expense' | 'income';
  memo: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ExpenseStats {
  totalExpenses: number;
  totalIncome: number;
  netAmount: number;
  categoryBreakdown: { [key: string]: number };
  monthlyData: { month: string; expenses: number; income: number }[];
} 