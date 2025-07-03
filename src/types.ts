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

export interface Stats {
  totalExpenses: number;
  totalIncome: number;
  netAmount: number;
  averageExpense: number;
  averageIncome: number;
  expenseCount: number;
  incomeCount: number;
}

export interface CategoryStats {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

// CSV Mapping Types
export type StandardizedColumn = 'Transaction Date' | 'Description' | 'Category' | 'Amount';

export interface ColumnMapping {
  id: string;
  name: string;
  mappings: {
    csvColumn: string;
    standardColumn: StandardizedColumn | 'Ignore';
  }[];
  createdAt: string;
  lastUsed: string;
}

export interface CSVPreview {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
} 