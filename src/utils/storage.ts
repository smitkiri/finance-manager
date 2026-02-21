import { Expense, CSVPreview, Report, ReportData, ExpensePageResponse, DateRange, DashboardStats, Account, AccountBalance, NetWorthSummary, NetWorthHistory } from '../types';

interface StorageMetadata {
  lastUpdated: string;
  totalExpenses: number;
  totalIncome: number;
  dateRange: {
    start: string;
    end: string;
  };
}

const SOURCES_STORAGE_KEY = 'sources';

export class LocalStorage {
  private static API_BASE = 'http://localhost:3001/api';

  static async saveExpenses(expenses: Expense[]): Promise<void> {
    try {
      const metadata: StorageMetadata = {
        lastUpdated: new Date().toISOString(),
        totalExpenses: expenses.filter(exp => exp.type === 'expense').length,
        totalIncome: expenses.filter(exp => exp.type === 'income').length,
        dateRange: {
          start: expenses.length > 0 ? expenses[expenses.length - 1].date : new Date().toISOString(),
          end: expenses.length > 0 ? expenses[0].date : new Date().toISOString()
        }
      };

      const response = await fetch(`${this.API_BASE}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expenses, metadata }),
      });

      if (!response.ok) {
        throw new Error('Failed to save expenses');
      }

      console.log(`Saved ${expenses.length} expenses to server`);
    } catch (error) {
      console.error('Error saving expenses:', error);
      // Fallback to localStorage if server is not available
      localStorage.setItem('expenses', JSON.stringify(expenses));
      console.log('Saved to localStorage as fallback');
    }
  }

  static async loadExpenses(): Promise<Expense[]> {
    try {
      const response = await fetch(`${this.API_BASE}/expenses`);
      
      if (!response.ok) {
        throw new Error('Failed to load expenses from server');
      }

      const expenses = await response.json();
      console.log(`Loaded ${expenses.length} expenses from server`);
      return expenses;
    } catch (error) {
      console.error('Error loading expenses from server:', error);
      // Fallback to localStorage
      const stored = localStorage.getItem('expenses');
      if (stored) {
        const expenses = JSON.parse(stored);
        console.log(`Loaded ${expenses.length} expenses from localStorage`);
        return expenses;
      }
      return [];
    }
  }

  /** Options for server-side paginated and filtered expense list */
  static async loadExpensesPage(options: {
    limit: number;
    offset: number;
    dateRange?: DateRange;
    userId?: string | null;
    categories?: string[];
    labels?: string[];
    types?: ('expense' | 'income')[];
    sources?: string[];
    minAmount?: number;
    maxAmount?: number;
    searchText?: string;
  }): Promise<ExpensePageResponse> {
    const {
      limit,
      offset,
      dateRange,
      userId,
      categories,
      labels,
      types,
      sources,
      minAmount,
      maxAmount,
      searchText
    } = options;

    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (dateRange?.start) params.set('dateFrom', typeof dateRange.start === 'string' ? dateRange.start : dateRange.start.toISOString().slice(0, 10));
    if (dateRange?.end) params.set('dateTo', typeof dateRange.end === 'string' ? dateRange.end : dateRange.end.toISOString().slice(0, 10));
    if (userId != null && userId !== '') params.set('userId', userId);
    if (categories?.length) params.set('categories', categories.join(','));
    if (labels?.length) params.set('labels', labels.join(','));
    if (types?.length) params.set('types', types.join(','));
    if (sources?.length) params.set('sources', sources.join(','));
    if (minAmount != null) params.set('minAmount', String(minAmount));
    if (maxAmount != null) params.set('maxAmount', String(maxAmount));
    if (searchText?.trim()) params.set('search', searchText.trim());

    try {
      const response = await fetch(`${this.API_BASE}/expenses?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to load expenses page from server');
      }
      const data = await response.json();
      // Backend may return { expenses, total } (paginated) or a plain array (legacy)
      if (Array.isArray(data)) {
        return { expenses: data, total: data.length };
      }
      const expenses = Array.isArray(data?.expenses) ? data.expenses : [];
      const total = typeof data?.total === 'number' ? data.total : expenses.length;
      return { expenses, total };
    } catch (error) {
      console.error('Error loading expenses page:', error);
      return { expenses: [], total: 0 };
    }
  }

  static async loadStats(options: {
    dateRange: DateRange;
    userId?: string | null;
  }): Promise<DashboardStats | null> {
    const { dateRange, userId } = options;
    const params = new URLSearchParams();
    if (dateRange?.start) params.set('dateFrom', typeof dateRange.start === 'string' ? dateRange.start : dateRange.start.toISOString().slice(0, 10));
    if (dateRange?.end) params.set('dateTo', typeof dateRange.end === 'string' ? dateRange.end : dateRange.end.toISOString().slice(0, 10));
    if (userId != null && userId !== '') params.set('userId', userId);
    try {
      const response = await fetch(`${this.API_BASE}/stats?${params.toString()}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data as DashboardStats;
    } catch (error) {
      console.error('Error loading stats:', error);
      return null;
    }
  }

  static async importCSVData(csvText: string): Promise<Expense[]> {
    try {
      const response = await fetch(`${this.API_BASE}/import-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvText }),
      });

      if (!response.ok) {
        throw new Error('Failed to import CSV');
      }

      const result = await response.json();
      console.log(`Imported ${result.imported} new expenses, total: ${result.total}`);
      
      // Reload all expenses after import
      return await this.loadExpenses();
    } catch (error) {
      console.error('Error importing CSV data:', error);
      throw error;
    }
  }

  static async addExpense(expense: Expense): Promise<Expense[]> {
    try {
      // Load existing expenses
      const existingExpenses = await this.loadExpenses();
      
      // Add new expense at the beginning (most recent first)
      const updatedExpenses = [expense, ...existingExpenses];
      
      // Save updated data
      await this.saveExpenses(updatedExpenses);
      
      console.log(`Added new expense, total: ${updatedExpenses.length}`);
      return updatedExpenses;
    } catch (error) {
      console.error('Error adding expense:', error);
      throw error;
    }
  }

  static async updateExpense(updatedExpense: Expense): Promise<Expense> {
    try {
      const response = await fetch(`${this.API_BASE}/expenses/${updatedExpense.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedExpense),
      });

      if (!response.ok) {
        throw new Error('Failed to update expense on server');
      }

      const returnedExpense = await response.json();
      console.log(`Updated expense ${updatedExpense.id}`);
      return returnedExpense;
    } catch (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
  }

  static async deleteExpense(expenseId: string): Promise<Expense[]> {
    try {
      // Load existing expenses
      const existingExpenses = await this.loadExpenses();
      
      // Remove the expense
      const updatedExpenses = existingExpenses.filter(exp => exp.id !== expenseId);
      
      // Save updated data
      await this.saveExpenses(updatedExpenses);
      
      console.log(`Deleted expense ${expenseId}, total: ${updatedExpenses.length}`);
      return updatedExpenses;
    } catch (error) {
      console.error('Error deleting expense:', error);
      throw error;
    }
  }

  static mergeExpenses(existing: Expense[], newExpenses: Expense[]): Expense[] {
    const merged = [...existing];
    
    for (const newExpense of newExpenses) {
      // Check if expense already exists (same date, description, and amount)
      const exists = merged.some(exp => 
        exp.date === newExpense.date &&
        exp.description === newExpense.description &&
        exp.amount === newExpense.amount &&
        exp.type === newExpense.type
      );
      
      if (!exists) {
        merged.push(newExpense);
      }
    }
    
    // Sort by date (most recent first)
    return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  static async getMetadata(): Promise<StorageMetadata | null> {
    try {
      // For now, just return localStorage metadata
      const stored = localStorage.getItem('expenses_metadata');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error loading metadata:', error);
      return null;
    }
  }

  static async exportData(): Promise<string> {
    try {
      const response = await fetch(`${this.API_BASE}/export-csv`);
      
      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }

      const csvContent = await response.text();
      return csvContent;
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  }

  // Source Methods
  static async saveSource(source: import('../types').Source): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source }),
      });

      if (!response.ok) {
        throw new Error('Failed to save source');
      }

      console.log(`Saved source ${source.name}`);
    } catch (error) {
      console.error('Error saving source:', error);
      // Fallback to localStorage
      const sources = this.getSourcesFromStorage();
      sources.push(source);
      localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sources));
    }
  }

  static async updateSource(updatedSource: import('../types').Source): Promise<import('../types').Source[]> {
    try {
      const response = await fetch(`${this.API_BASE}/sources/${updatedSource.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: updatedSource }),
      });

      if (!response.ok) {
        throw new Error('Failed to update source');
      }

      console.log(`Updated source ${updatedSource.name}`);
      
      // Reload all sources to get the updated list
      return await this.loadSources();
    } catch (error) {
      console.error('Error updating source:', error);
      // Fallback to localStorage
      const sources = this.getSourcesFromStorage();
      const updatedSources = sources.map(source => 
        source.id === updatedSource.id ? updatedSource : source
      );
      localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(updatedSources));
      return updatedSources;
    }
  }

  static async loadSources(): Promise<import('../types').Source[]> {
    try {
      const response = await fetch(`${this.API_BASE}/sources`);
      
      if (!response.ok) {
        throw new Error('Failed to load sources from server');
      }

      const sources = await response.json();
      console.log(`Loaded ${sources.length} sources from server`);
      return sources;
    } catch (error) {
      console.error('Error loading sources from server:', error);
      // Fallback to localStorage
      return this.getSourcesFromStorage();
    }
  }

  private static getSourcesFromStorage(): import('../types').Source[] {
    const stored = localStorage.getItem(SOURCES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }

  static parseCSVWithMapping(csvText: string, mapping: any, user: string): Expense[] {
    const lines = csvText.split('\n').filter(Boolean);
    const headers = lines[0].split(',');
    const columnIndexMap = new Map<number, string>();
    mapping.mappings.forEach((m: any) => {
      const csvIndex = headers.indexOf(m.csvColumn);
      if (csvIndex !== -1) {
        columnIndexMap.set(csvIndex, m.standardColumn);
      }
    });
    return lines.slice(1)
      .map((line, index) => {
        const values = this.parseCSVLine(line);
        let date = '';
        let description = '';
        let category = '';
        let amount = 0;
        columnIndexMap.forEach((standardCol, csvIndex) => {
          const value = values[csvIndex] || '';
          switch (standardCol) {
            case 'Transaction Date':
              date = value;
              break;
            case 'Description':
              description = value;
              break;
            case 'Category':
              category = value || 'Uncategorized';
              break;
            case 'Amount':
              amount = parseFloat(value.replace(/[,$"]/g, '')) || 0;
              break;
          }
        });

        // Handle flipIncomeExpense option
        let transactionType: 'expense' | 'income' = amount < 0 ? 'expense' : 'income';
        if (mapping.flipIncomeExpense) {
          transactionType = amount > 0 ? 'expense' : 'income';
        }

        return {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          date,
          description,
          category,
          amount: Math.abs(amount),
          type: transactionType,
          user: user,
          metadata: {
            sourceId: mapping.id,
            sourceName: mapping.name,
            importedAt: new Date().toISOString()
          }
        };
      })
      .filter(expense => expense.date && expense.description && expense.amount > 0);
  }

  private static parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    result.push(current.trim());
    
    return result;
  }

  static parseCSVPreview(csvText: string): CSVPreview {
    const lines = csvText.trim().split('\n');
    const headers = this.parseCSVLine(lines[0]);
    const sampleRows = lines.slice(1, 6); // Show first 5 rows as preview
    
    return {
      headers,
      sampleRows: sampleRows.map(line => this.parseCSVLine(line)),
      totalRows: lines.length - 1
    };
  }

  // Date Range Persistence Methods
  static async saveDateRange(dateRange: { start: Date; end: Date }): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/date-range`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          start: dateRange.start.toISOString().split('T')[0],
          end: dateRange.end.toISOString().split('T')[0]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save date range');
      }

      console.log(`Saved date range`);
    } catch (error) {
      console.error('Error saving date range:', error);
      // Fallback to localStorage
      localStorage.setItem('dateRange', JSON.stringify({
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString()
      }));
    }
  }

  static async loadDateRange(): Promise<{ start: Date; end: Date } | null> {
    try {
      const response = await fetch(`${this.API_BASE}/date-range`);
      if (!response.ok) {
        const stored = localStorage.getItem('dateRange');
        if (stored) {
          const dateRange = JSON.parse(stored);
          return { start: new Date(dateRange.start), end: new Date(dateRange.end) };
        }
        return null;
      }
      const dateRange = await response.json();
      return {
        start: new Date(dateRange.start),
        end: new Date(dateRange.end)
      };
    } catch (error) {
      const stored = localStorage.getItem('dateRange');
      if (stored) {
        try {
          const dateRange = JSON.parse(stored);
          return { start: new Date(dateRange.start), end: new Date(dateRange.end) };
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  // Category Management Methods
  static async saveCategories(categories: string[]): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ categories }),
      });

      if (!response.ok) {
        throw new Error('Failed to save categories');
      }

      console.log(`Saved ${categories.length} categories`);
    } catch (error) {
      console.error('Error saving categories:', error);
      // Fallback to localStorage
      localStorage.setItem('categories', JSON.stringify(categories));
    }
  }

  static async loadCategories(): Promise<string[]> {
    try {
      const response = await fetch(`${this.API_BASE}/categories`);
      
      if (!response.ok) {
        throw new Error('Failed to load categories from server');
      }

      const result = await response.json();
      console.log(`Loaded ${result.categories.length} categories from server`);
      return result.categories;
    } catch (error) {
      console.error('Error loading categories from server:', error);
      // Fallback to localStorage
      const stored = localStorage.getItem('categories');
      if (stored) {
        return JSON.parse(stored);
      }
      // Return default categories
      return [
        'Food & Drink',
        'Shopping',
        'Travel',
        'Health & Wellness',
        'Groceries',
        'Bills & Utilities',
        'Entertainment',
        'Personal',
        'Professional Services',
        'Uncategorized'
      ];
    }
  }

  static async addCategory(category: string): Promise<string[]> {
    try {
      const existingCategories = await this.loadCategories();
      
      if (!existingCategories.includes(category)) {
        const updatedCategories = [...existingCategories, category];
        await this.saveCategories(updatedCategories);
        return updatedCategories;
      }
      
      return existingCategories;
    } catch (error) {
      console.error('Error adding category:', error);
      throw error;
    }
  }

  static async deleteCategory(category: string): Promise<string[]> {
    try {
      const existingCategories = await this.loadCategories();
      const updatedCategories = existingCategories.filter(cat => cat !== category);
      
      await this.saveCategories(updatedCategories);
      return updatedCategories;
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }

  static async updateCategory(oldCategory: string, newCategory: string): Promise<string[]> {
    try {
      const existingCategories = await this.loadCategories();
      const updatedCategories = existingCategories.map(cat => 
        cat === oldCategory ? newCategory : cat
      );
      
      await this.saveCategories(updatedCategories);
      return updatedCategories;
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  // Report Methods
  static async saveReport(report: Report): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ report }),
      });

      if (!response.ok) {
        throw new Error('Failed to save report');
      }

      console.log(`Saved report ${report.id}`);
    } catch (error) {
      console.error('Error saving report:', error);
      // Fallback to localStorage
      const reports = this.getReportsFromStorage();
      const existingIndex = reports.findIndex(r => r.id === report.id);
      if (existingIndex >= 0) {
        reports[existingIndex] = report;
      } else {
        reports.push(report);
      }
      localStorage.setItem('reports', JSON.stringify(reports));
    }
  }

  static async loadReports(): Promise<Report[]> {
    try {
      const response = await fetch(`${this.API_BASE}/reports`);
      
      if (!response.ok) {
        throw new Error('Failed to load reports from server');
      }

      const reports = await response.json();
      console.log(`Loaded ${reports.length} reports from server`);
      return reports;
    } catch (error) {
      console.error('Error loading reports from server:', error);
      // Fallback to localStorage
      return this.getReportsFromStorage();
    }
  }

  static async deleteReport(reportId: string): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/reports/${reportId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete report');
      }

      console.log(`Deleted report ${reportId}`);
    } catch (error) {
      console.error('Error deleting report:', error);
      // Fallback to localStorage
      const reports = this.getReportsFromStorage();
      const updatedReports = reports.filter(r => r.id !== reportId);
      localStorage.setItem('reports', JSON.stringify(updatedReports));
    }
  }

  static async saveReportData(reportData: ReportData): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/reports/${reportData.report.id}/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportData }),
      });

      if (!response.ok) {
        throw new Error('Failed to save report data');
      }

      console.log(`Saved report data for ${reportData.report.id}`);
    } catch (error) {
      console.error('Error saving report data:', error);
      // Fallback to localStorage
      const key = `report_data_${reportData.report.id}`;
      localStorage.setItem(key, JSON.stringify(reportData));
    }
  }

  static async loadReportData(reportId: string): Promise<ReportData | null> {
    try {
      const response = await fetch(`${this.API_BASE}/reports/${reportId}/data`);
      
      if (!response.ok) {
        throw new Error('Failed to load report data from server');
      }

      const reportData = await response.json();
      console.log(`Loaded report data for ${reportId}`);
      return reportData;
    } catch (error) {
      console.error('Error loading report data from server:', error);
      // Fallback to localStorage
      return this.getReportDataFromStorage(reportId);
    }
  }

  private static getReportsFromStorage(): Report[] {
    try {
      const stored = localStorage.getItem('reports');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading reports from localStorage:', error);
      return [];
    }
  }

  private static getReportDataFromStorage(reportId: string): ReportData | null {
    try {
      const stored = localStorage.getItem(`report_data_${reportId}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error loading report data from localStorage:', error);
      return null;
    }
  }

  // Alias for Source terminology
  static parseCSVWithSource(csvText: string, source: import('../types').Source, user: string): Expense[] {
    // Reuse the mapping logic
    return this.parseCSVWithMapping(csvText, source, user);
  }

  // User Management Methods
  static async saveUsers(users: import('../types').User[]): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ users }),
      });

      if (!response.ok) {
        throw new Error('Failed to save users');
      }

      console.log(`Saved ${users.length} users`);
    } catch (error) {
      console.error('Error saving users:', error);
      // Fallback to localStorage
      localStorage.setItem('users', JSON.stringify(users));
    }
  }

  static async loadUsers(): Promise<import('../types').User[]> {
    try {
      const response = await fetch(`${this.API_BASE}/users`);
      
      if (!response.ok) {
        throw new Error('Failed to load users from server');
      }

      const result = await response.json();
      console.log(`Loaded ${result.users.length} users from server`);
      return result.users;
    } catch (error) {
      console.error('Error loading users from server:', error);
      // Fallback to localStorage
      return this.getUsersFromStorage();
    }
  }

  static async addUser(user: import('../types').User): Promise<import('../types').User[]> {
    try {
      const existingUsers = await this.loadUsers();
      
      if (!existingUsers.some(u => u.name === user.name)) {
        const updatedUsers = [...existingUsers, user];
        await this.saveUsers(updatedUsers);
        return updatedUsers;
      }
      
      return existingUsers;
    } catch (error) {
      console.error('Error adding user:', error);
      throw error;
    }
  }

  static async deleteUser(userId: string): Promise<import('../types').User[]> {
    try {
      const existingUsers = await this.loadUsers();
      const updatedUsers = existingUsers.filter(user => user.id !== userId);
      
      await this.saveUsers(updatedUsers);
      return updatedUsers;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  static async updateUser(updatedUser: import('../types').User): Promise<import('../types').User[]> {
    try {
      const existingUsers = await this.loadUsers();
      const updatedUsers = existingUsers.map(user => 
        user.id === updatedUser.id ? updatedUser : user
      );
      
      await this.saveUsers(updatedUsers);
      return updatedUsers;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // Net Worth Methods
  static async loadAccounts(userId?: string | null): Promise<Account[]> {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      const response = await fetch(`${this.API_BASE}/accounts?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to load accounts');
      return await response.json();
    } catch (error) {
      console.error('Error loading accounts:', error);
      return [];
    }
  }

  static async createAccount(account: Account): Promise<Account> {
    const response = await fetch(`${this.API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    if (!response.ok) throw new Error('Failed to create account');
    return response.json();
  }

  static async updateAccount(account: Account): Promise<Account> {
    const response = await fetch(`${this.API_BASE}/accounts/${account.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: account.name, type: account.type }),
    });
    if (!response.ok) throw new Error('Failed to update account');
    return response.json();
  }

  static async deleteAccount(accountId: string): Promise<void> {
    const response = await fetch(`${this.API_BASE}/accounts/${accountId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete account');
  }

  static async addAccountBalance(accountId: string, balance: AccountBalance): Promise<AccountBalance> {
    const response = await fetch(`${this.API_BASE}/accounts/${accountId}/balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(balance),
    });
    if (!response.ok) throw new Error('Failed to add account balance');
    return response.json();
  }

  static async loadAccountBalances(accountId: string): Promise<AccountBalance[]> {
    try {
      const response = await fetch(`${this.API_BASE}/accounts/${accountId}/balances`);
      if (!response.ok) throw new Error('Failed to load account balances');
      return response.json();
    } catch (error) {
      console.error('Error loading account balances:', error);
      return [];
    }
  }

  static async deleteAccountBalance(accountId: string, balanceId: string): Promise<void> {
    const response = await fetch(`${this.API_BASE}/accounts/${accountId}/balances/${balanceId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete balance entry');
  }

  static async loadNetWorthSummary(userId?: string | null): Promise<NetWorthSummary | null> {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      const response = await fetch(`${this.API_BASE}/net-worth/summary?${params.toString()}`);
      if (!response.ok) return null;
      return response.json();
    } catch (error) {
      console.error('Error loading net worth summary:', error);
      return null;
    }
  }

  static async loadNetWorthHistory(userId?: string | null): Promise<NetWorthHistory[]> {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);
      const response = await fetch(`${this.API_BASE}/net-worth/history?${params.toString()}`);
      if (!response.ok) return [];
      return response.json();
    } catch (error) {
      console.error('Error loading net worth history:', error);
      return [];
    }
  }

  private static getUsersFromStorage(): import('../types').User[] {
    try {
      const stored = localStorage.getItem('users');
      if (stored) {
        return JSON.parse(stored);
      }
      // Return default user for backwards compatibility
      return [
        {
          id: 'default-user',
          name: 'Default',
          createdAt: new Date().toISOString()
        }
      ];
    } catch (error) {
      console.error('Error loading users from localStorage:', error);
      return [
        {
          id: 'default-user',
          name: 'Default',
          createdAt: new Date().toISOString()
        }
      ];
    }
  }
} 