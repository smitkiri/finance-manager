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
    tellerTransactionId?: string;
    teller?: {
      details?: {
        counterparty?: { name?: string };
        category?: string;
      };
    };
  };
  transferInfo?: {
    isTransfer: boolean;
    transferId?: string;
    transferType?: 'user' | 'self'; // 'user' = between different users, 'self' = within same user
    excludedFromCalculations: boolean;
    userOverride?: boolean;
  };
  excludedFromCalculations?: boolean;
  importId?: string | null;
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
  topExpenses?: Array<{
    id: string;
    date: string;
    description: string;
    category: string;
    amount: number;
    type: 'expense';
    user: string;
  }>;
  topIncome?: Array<{
    id: string;
    date: string;
    description: string;
    category: string;
    amount: number;
    type: 'income';
    user: string;
  }>;
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
  tellerAccountId?: string | null;
  tellerEnrollmentId?: string | null;
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

export interface ImportSession {
  id: string;
  createdAt: string;
  userId: string | null;
  sourceId: string | null;
  sourceName: string;
  fileName: string | null;
  transactionCount: number;
}

export interface TellerCategoryMapping {
  tellerCategory: string;
  userCategory: string;
  transactionCount: number;
}

export interface TellerImportPreviewAccount {
  accountId: string;
  accountName: string;
  newCount: number;
  duplicateCount: number;
}

export interface TellerImportResult {
  accountId: string;
  accountName: string;
  sessionId: string;
  added: number;
  skipped: number;
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

// Personal Dashboards types
export interface Dashboard {
  id: string;
  name: string;
  isDefault: boolean;
  dateRangeStart: string; // YYYY-MM-DD
  dateRangeEnd: string; // YYYY-MM-DD
  panelCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FilterCondition {
  field: 'type' | 'category' | 'labels' | 'description' | 'amount';
  operator: string; // 'is' | 'is_not' | 'includes' | 'excludes' | 'matches' | 'gte' | 'lte'
  value: string | string[] | number;
}

export interface FilterGroup {
  conditions: FilterCondition[];
}

export interface LegendOptions {
  show: boolean;
  min: boolean;
  max: boolean;
  avg: boolean;
  total: boolean;
}

export interface DashboardPanel {
  id: string;
  dashboardId: string;
  title: string;
  chartType: 'bar' | 'line';
  seriesMode: 'two_series' | 'net_amount';
  netOrientation: 'income_positive' | 'expense_positive' | null;
  legendOptions: LegendOptions | null;
  filterGroups: FilterGroup[];
  panelOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PanelMonthData {
  month: string; // "YYYY-MM"
  income?: number;
  expenses?: number;
  net?: number;
}

export interface PanelData {
  panelId: string;
  data: PanelMonthData[];
}
