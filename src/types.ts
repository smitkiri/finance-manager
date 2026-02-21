export interface Expense {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  type: 'expense' | 'income';
  user: string;
  labels?: string[];
  metadata?: {
    sourceId?: string;
    sourceName?: string;
    importedAt: string;
  };
  transferInfo?: {
    isTransfer: boolean;
    transferId?: string;
    transferType?: 'user' | 'self'; // 'user' = between different users, 'self' = within same user
    excludedFromCalculations: boolean;
    userOverride?: boolean;
  };
  excludedFromCalculations?: boolean;
}

export interface User {
  id: string;
  name: string;
  createdAt: string;
}

export interface Category {
  name: string;
  color: string;
  icon: string;
}

export interface TransactionFormData {
  date: string;
  description: string;
  category: string;
  amount: string;
  type: 'expense' | 'income';
  user: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface ExpensePageResponse {
  expenses: Expense[];
  total: number;
}

export interface ExpenseStats {
  totalExpenses: number;
  totalIncome: number;
  netAmount: number;
  categoryBreakdown: { [key: string]: number };
  monthlyData: { month: string; expenses: number; income: number }[];
}

/** Dashboard stats from API (aggregates only, no full list) */
export interface DashboardStats extends ExpenseStats {
  incomeCategoryBreakdown?: { [key: string]: number };
  monthlyCategoryData?: Record<string, string | number>[];
  topExpenses?: Array<{ id: string; date: string; description: string; category: string; amount: number; type: 'expense'; user: string }>;
  topIncome?: Array<{ id: string; date: string; description: string; category: string; amount: number; type: 'income'; user: string }>;
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

// CSV Source Types
export type StandardizedColumn = 'Transaction Date' | 'Description' | 'Category' | 'Amount';

export interface Source {
  id: string;
  name: string;
  mappings: {
    csvColumn: string;
    standardColumn: StandardizedColumn | 'Ignore';
  }[];
  flipIncomeExpense?: boolean;
  createdAt: string;
  lastUsed: string;
}

export interface CSVPreview {
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

// New types for reports
export interface ReportFilter {
  dateRange?: DateRange;
  categories?: string[];
  labels?: string[];
  types?: ('expense' | 'income')[];
  sources?: string[];
  minAmount?: number;
  maxAmount?: number;
}

export interface Report {
  id: string;
  name: string;
  description?: string;
  filters: ReportFilter;
  createdAt: string;
  lastModified: string;
  // These fields are optional and computed dynamically at runtime
  transactionCount?: number;
  totalAmount?: number;
}

// Net Worth types
export interface Account {
  id: string;
  userId: string;
  name: string;
  type: 'asset' | 'liability';
  createdAt: string;
  updatedAt: string;
  currentBalance?: number;
}

export interface AccountBalance {
  id: string;
  accountId: string;
  balance: number;
  date: string;
  note?: string;
  createdAt: string;
}

export interface NetWorthSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export interface NetWorthHistory {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export interface ReportData {
  report: Report;
  transactions: Expense[];
  categoryBreakdown: { [category: string]: number };
  totalExpenses: number;
  totalIncome: number;
  netAmount: number;
  monthlyData: { month: string; expenses: number; income: number }[];
} 