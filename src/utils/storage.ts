import { Expense, ColumnMapping, CSVPreview, StandardizedColumn, Report, ReportData } from '../types';

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

  static async updateExpense(updatedExpense: Expense): Promise<Expense[]> {
    try {
      // Load existing expenses
      const existingExpenses = await this.loadExpenses();
      
      // Update the expense
      const updatedExpenses = existingExpenses.map(exp => 
        exp.id === updatedExpense.id ? updatedExpense : exp
      );
      
      // Save updated data
      await this.saveExpenses(updatedExpenses);
      
      console.log(`Updated expense ${updatedExpense.id}`);
      return updatedExpenses;
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
      // Fallback to local export
      const expenses = await this.loadExpenses();
      
      const headers = ['Date', 'Description', 'Category', 'Amount', 'Type', 'Memo'];
      const csvContent = [
        headers.join(','),
        ...expenses.map(exp => [
          exp.date,
          exp.description,
          exp.category,
          exp.amount,
          exp.type,
          exp.memo || ''
        ].join(','))
      ].join('\n');
      
      return csvContent;
    }
  }

  // Source Methods
  static async saveSource(source: import('../types').Source): Promise<void> {
    try {
      // If using a backend API, update endpoint to /sources
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
      console.log(`Saved source: ${source.name}`);
    } catch (error) {
      console.error('Error saving source:', error);
      // Fallback to localStorage
      const existingSources = this.getSourcesFromStorage();
      existingSources.push(source);
      localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(existingSources));
    }
  }

  static async loadSources(): Promise<import('../types').Source[]> {
    try {
      // If using a backend API, update endpoint to /sources
      const response = await fetch(`${this.API_BASE}/sources`);
      if (!response.ok) {
        throw new Error('Failed to load sources');
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
    try {
      const stored = localStorage.getItem(SOURCES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading sources from localStorage:', error);
      return [];
    }
  }

  // Column Mapping Methods
  static async saveColumnMapping(mapping: import('../types').Source): Promise<void> {
    return this.saveSource(mapping);
  }

  static async loadColumnMappings(): Promise<import('../types').Source[]> {
    return this.loadSources();
  }

  private static getColumnMappingsFromStorage(): import('../types').Source[] {
    return this.getSourcesFromStorage();
  }

  static parseCSVWithMapping(csvText: string, mapping: import('../types').Source): Expense[] {
    const lines = csvText.trim().split('\n');
    const headers = this.parseCSVLine(lines[0]);
    
    // Create a mapping from CSV column index to standardized column
    const columnIndexMap = new Map<number, StandardizedColumn>();
    mapping.mappings.forEach(m => {
      if (m.standardColumn !== 'Ignore') {
        const csvIndex = headers.findIndex(h => h === m.csvColumn);
        if (csvIndex !== -1) {
          columnIndexMap.set(csvIndex, m.standardColumn);
        }
      }
    });

    return lines.slice(1)
      .map((line, index) => {
        const values = this.parseCSVLine(line);
        
        // Extract values based on mapping
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

        return {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          date,
          description,
          category,
          amount: Math.abs(amount),
          type: (amount < 0 ? 'expense' : 'income') as 'expense' | 'income',
          memo: '',
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
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString()
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save date range');
      }

      console.log('Saved date range to server');
    } catch (error) {
      console.error('Error saving date range to server:', error);
      // Fallback to localStorage
      localStorage.setItem('date-range', JSON.stringify({
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString()
      }));
      console.log('Saved date range to localStorage as fallback');
    }
  }

  static async loadDateRange(): Promise<{ start: Date; end: Date } | null> {
    try {
      const response = await fetch(`${this.API_BASE}/date-range`);
      if (response.ok) {
        const data = await response.json();
        console.log('Loaded date range from server');
        return {
          start: new Date(data.start),
          end: new Date(data.end)
        };
      }
    } catch (error) {
      console.error('Error loading date range from server:', error);
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem('date-range');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        console.log('Loaded date range from localStorage');
        return {
          start: new Date(data.start),
          end: new Date(data.end)
        };
      } catch (error) {
        console.error('Error parsing date range from localStorage:', error);
      }
    }
    
    return null;
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

      console.log('Saved categories to server');
    } catch (error) {
      console.error('Error saving categories to server:', error);
      // Fallback to localStorage
      localStorage.setItem('categories', JSON.stringify(categories));
      console.log('Saved categories to localStorage as fallback');
    }
  }

  static async loadCategories(): Promise<string[]> {
    try {
      const response = await fetch(`${this.API_BASE}/categories`);
      if (response.ok) {
        const data = await response.json();
        console.log('Loaded categories from server');
        return data.categories || [];
      }
    } catch (error) {
      console.error('Error loading categories from server:', error);
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem('categories');
    if (stored) {
      try {
        const categories = JSON.parse(stored);
        console.log('Loaded categories from localStorage');
        return categories;
      } catch (error) {
        console.error('Error parsing categories from localStorage:', error);
      }
    }
    
    // Return default categories if none are stored
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

  static async addCategory(category: string): Promise<string[]> {
    try {
      const existingCategories = await this.loadCategories();
      if (!existingCategories.includes(category)) {
        const updatedCategories = [...existingCategories, category];
        await this.saveCategories(updatedCategories);
        console.log(`Added category: ${category}`);
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
      
      // Update all expenses that use this category to "Uncategorized"
      const expenses = await this.loadExpenses();
      const updatedExpenses = expenses.map(exp => 
        exp.category === category ? { ...exp, category: 'Uncategorized' } : exp
      );
      await this.saveExpenses(updatedExpenses);
      
      console.log(`Deleted category: ${category}`);
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
      
      // Update all expenses that use this category
      const expenses = await this.loadExpenses();
      const updatedExpenses = expenses.map(exp => 
        exp.category === oldCategory ? { ...exp, category: newCategory } : exp
      );
      await this.saveExpenses(updatedExpenses);
      
      console.log(`Updated category: ${oldCategory} -> ${newCategory}`);
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

      console.log(`Saved report: ${report.name}`);
    } catch (error) {
      console.error('Error saving report:', error);
      // Fallback to localStorage
      const existingReports = this.getReportsFromStorage();
      const updatedReports = existingReports.filter(r => r.id !== report.id);
      updatedReports.push(report);
      localStorage.setItem('reports', JSON.stringify(updatedReports));
    }
  }

  static async loadReports(): Promise<Report[]> {
    try {
      const response = await fetch(`${this.API_BASE}/reports`);
      
      if (!response.ok) {
        throw new Error('Failed to load reports');
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

      console.log(`Deleted report: ${reportId}`);
    } catch (error) {
      console.error('Error deleting report:', error);
      // Fallback to localStorage
      const existingReports = this.getReportsFromStorage();
      const updatedReports = existingReports.filter(r => r.id !== reportId);
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

      console.log(`Saved report data: ${reportData.report.name}`);
    } catch (error) {
      console.error('Error saving report data:', error);
      // Fallback to localStorage
      localStorage.setItem(`report_data_${reportData.report.id}`, JSON.stringify(reportData));
    }
  }

  static async loadReportData(reportId: string): Promise<ReportData | null> {
    try {
      const response = await fetch(`${this.API_BASE}/reports/${reportId}/data`);
      
      if (!response.ok) {
        throw new Error('Failed to load report data');
      }

      const reportData = await response.json();
      console.log(`Loaded report data: ${reportId}`);
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
  static parseCSVWithSource(csvText: string, source: import('../types').Source): Expense[] {
    // Reuse the mapping logic
    return this.parseCSVWithMapping(csvText, source);
  }
} 