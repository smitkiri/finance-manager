// Pagination
export const ITEMS_PER_PAGE = 30;

// Labels
export const MAX_LABELS_PER_TRANSACTION = 3;

// Date ranges
export const DEFAULT_DATE_RANGE = {
  start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of current month
  end: new Date() // Today
};

// Chart colors
export const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
];

// File types
export const CSV_FILE_TYPE = '.csv';

// Storage keys
export const STORAGE_KEYS = {
  EXPENSES: 'expenses',
  CATEGORIES: 'categories',
  COLUMN_MAPPINGS: 'column-mappings',
  DATE_RANGE: 'date-range'
} as const; 