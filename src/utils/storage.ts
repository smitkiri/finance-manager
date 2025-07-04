import { Expense, CSVPreview, StandardizedColumn, Report, ReportData } from '../types';

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

  static async saveExpenses(expenses: Expense[], isTestMode: boolean = false): Promise<void> {
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
        body: JSON.stringify({ expenses, metadata, isTestMode }),
      });

      if (!response.ok) {
        throw new Error('Failed to save expenses');
      }

      console.log(`Saved ${expenses.length} expenses to server (test mode: ${isTestMode})`);
    } catch (error) {
      console.error('Error saving expenses:', error);
      // Fallback to localStorage if server is not available
      localStorage.setItem('expenses', JSON.stringify(expenses));
      console.log('Saved to localStorage as fallback');
    }
  }

  static async loadExpenses(isTestMode: boolean = false): Promise<Expense[]> {
    try {
      const response = await fetch(`${this.API_BASE}/expenses?testMode=${isTestMode}`);
      
      if (!response.ok) {
        throw new Error('Failed to load expenses from server');
      }

      const expenses = await response.json();
      console.log(`Loaded ${expenses.length} expenses from server (test mode: ${isTestMode})`);
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

  static async importCSVData(csvText: string, isTestMode: boolean = false): Promise<Expense[]> {
    try {
      const response = await fetch(`${this.API_BASE}/import-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ csvText, isTestMode }),
      });

      if (!response.ok) {
        throw new Error('Failed to import CSV');
      }

      const result = await response.json();
      console.log(`Imported ${result.imported} new expenses, total: ${result.total} (test mode: ${isTestMode})`);
      
      // Reload all expenses after import
      return await this.loadExpenses(isTestMode);
    } catch (error) {
      console.error('Error importing CSV data:', error);
      throw error;
    }
  }

  static async addExpense(expense: Expense, isTestMode: boolean = false): Promise<Expense[]> {
    try {
      // Load existing expenses
      const existingExpenses = await this.loadExpenses(isTestMode);
      
      // Add new expense at the beginning (most recent first)
      const updatedExpenses = [expense, ...existingExpenses];
      
      // Save updated data
      await this.saveExpenses(updatedExpenses, isTestMode);
      
      console.log(`Added new expense, total: ${updatedExpenses.length} (test mode: ${isTestMode})`);
      return updatedExpenses;
    } catch (error) {
      console.error('Error adding expense:', error);
      throw error;
    }
  }

  static async updateExpense(updatedExpense: Expense, isTestMode: boolean = false): Promise<Expense[]> {
    try {
      // Load existing expenses
      const existingExpenses = await this.loadExpenses(isTestMode);
      
      // Update the expense
      const updatedExpenses = existingExpenses.map(exp => 
        exp.id === updatedExpense.id ? updatedExpense : exp
      );
      
      // Save updated data
      await this.saveExpenses(updatedExpenses, isTestMode);
      
      console.log(`Updated expense ${updatedExpense.id} (test mode: ${isTestMode})`);
      return updatedExpenses;
    } catch (error) {
      console.error('Error updating expense:', error);
      throw error;
    }
  }

  static async deleteExpense(expenseId: string, isTestMode: boolean = false): Promise<Expense[]> {
    try {
      // Load existing expenses
      const existingExpenses = await this.loadExpenses(isTestMode);
      
      // Remove the expense
      const updatedExpenses = existingExpenses.filter(exp => exp.id !== expenseId);
      
      // Save updated data
      await this.saveExpenses(updatedExpenses, isTestMode);
      
      console.log(`Deleted expense ${expenseId}, total: ${updatedExpenses.length} (test mode: ${isTestMode})`);
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

  static async exportData(isTestMode: boolean = false): Promise<string> {
    try {
      const response = await fetch(`${this.API_BASE}/export-csv?testMode=${isTestMode}`);
      
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
  static async saveSource(source: import('../types').Source, isTestMode: boolean = false): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/sources`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source, isTestMode }),
      });

      if (!response.ok) {
        throw new Error('Failed to save source');
      }

      console.log(`Saved source ${source.name} (test mode: ${isTestMode})`);
    } catch (error) {
      console.error('Error saving source:', error);
      // Fallback to localStorage
      const sources = this.getSourcesFromStorage();
      sources.push(source);
      localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(sources));
    }
  }

  static async updateSource(updatedSource: import('../types').Source, isTestMode: boolean = false): Promise<import('../types').Source[]> {
    try {
      const response = await fetch(`${this.API_BASE}/sources/${updatedSource.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ source: updatedSource, isTestMode }),
      });

      if (!response.ok) {
        throw new Error('Failed to update source');
      }

      console.log(`Updated source ${updatedSource.name} (test mode: ${isTestMode})`);
      
      // Reload all sources to get the updated list
      return await this.loadSources(isTestMode);
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

  static async loadSources(isTestMode: boolean = false): Promise<import('../types').Source[]> {
    try {
      const response = await fetch(`${this.API_BASE}/sources?testMode=${isTestMode}`);
      
      if (!response.ok) {
        throw new Error('Failed to load sources from server');
      }

      const sources = await response.json();
      console.log(`Loaded ${sources.length} sources from server (test mode: ${isTestMode})`);
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
  static async saveDateRange(dateRange: { start: Date; end: Date }, isTestMode: boolean = false): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/date-range`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          start: dateRange.start.toISOString().split('T')[0],
          end: dateRange.end.toISOString().split('T')[0],
          isTestMode 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save date range');
      }

      console.log(`Saved date range (test mode: ${isTestMode})`);
    } catch (error) {
      console.error('Error saving date range:', error);
      // Fallback to localStorage
      localStorage.setItem('dateRange', JSON.stringify({
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString()
      }));
    }
  }

  static async loadDateRange(isTestMode: boolean = false): Promise<{ start: Date; end: Date } | null> {
    try {
      const response = await fetch(`${this.API_BASE}/date-range?testMode=${isTestMode}`);
      
      if (!response.ok) {
        throw new Error('Failed to load date range from server');
      }

      const dateRange = await response.json();
      console.log(`Loaded date range from server (test mode: ${isTestMode})`);
      
      return {
        start: new Date(dateRange.start),
        end: new Date(dateRange.end)
      };
    } catch (error) {
      console.error('Error loading date range from server:', error);
      // Fallback to localStorage
      const stored = localStorage.getItem('dateRange');
      if (stored) {
        const dateRange = JSON.parse(stored);
        return {
          start: new Date(dateRange.start),
          end: new Date(dateRange.end)
        };
      }
      return null;
    }
  }

  // Category Management Methods
  static async saveCategories(categories: string[], isTestMode: boolean = false): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ categories, isTestMode }),
      });

      if (!response.ok) {
        throw new Error('Failed to save categories');
      }

      console.log(`Saved ${categories.length} categories (test mode: ${isTestMode})`);
    } catch (error) {
      console.error('Error saving categories:', error);
      // Fallback to localStorage
      localStorage.setItem('categories', JSON.stringify(categories));
    }
  }

  static async loadCategories(isTestMode: boolean = false): Promise<string[]> {
    try {
      const response = await fetch(`${this.API_BASE}/categories?testMode=${isTestMode}`);
      
      if (!response.ok) {
        throw new Error('Failed to load categories from server');
      }

      const result = await response.json();
      console.log(`Loaded ${result.categories.length} categories from server (test mode: ${isTestMode})`);
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

  static async addCategory(category: string, isTestMode: boolean = false): Promise<string[]> {
    try {
      const existingCategories = await this.loadCategories(isTestMode);
      
      if (!existingCategories.includes(category)) {
        const updatedCategories = [...existingCategories, category];
        await this.saveCategories(updatedCategories, isTestMode);
        return updatedCategories;
      }
      
      return existingCategories;
    } catch (error) {
      console.error('Error adding category:', error);
      throw error;
    }
  }

  static async deleteCategory(category: string, isTestMode: boolean = false): Promise<string[]> {
    try {
      const existingCategories = await this.loadCategories(isTestMode);
      const updatedCategories = existingCategories.filter(cat => cat !== category);
      
      await this.saveCategories(updatedCategories, isTestMode);
      return updatedCategories;
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  }

  static async updateCategory(oldCategory: string, newCategory: string, isTestMode: boolean = false): Promise<string[]> {
    try {
      const existingCategories = await this.loadCategories(isTestMode);
      const updatedCategories = existingCategories.map(cat => 
        cat === oldCategory ? newCategory : cat
      );
      
      await this.saveCategories(updatedCategories, isTestMode);
      return updatedCategories;
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  }

  // Report Methods
  static async saveReport(report: Report, isTestMode: boolean = false): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ report, isTestMode }),
      });

      if (!response.ok) {
        throw new Error('Failed to save report');
      }

      console.log(`Saved report ${report.id} (test mode: ${isTestMode})`);
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

  static async loadReports(isTestMode: boolean = false): Promise<Report[]> {
    try {
      const response = await fetch(`${this.API_BASE}/reports?testMode=${isTestMode}`);
      
      if (!response.ok) {
        throw new Error('Failed to load reports from server');
      }

      const reports = await response.json();
      console.log(`Loaded ${reports.length} reports from server (test mode: ${isTestMode})`);
      return reports;
    } catch (error) {
      console.error('Error loading reports from server:', error);
      // Fallback to localStorage
      return this.getReportsFromStorage();
    }
  }

  static async deleteReport(reportId: string, isTestMode: boolean = false): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/reports/${reportId}?testMode=${isTestMode}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete report');
      }

      console.log(`Deleted report ${reportId} (test mode: ${isTestMode})`);
    } catch (error) {
      console.error('Error deleting report:', error);
      // Fallback to localStorage
      const reports = this.getReportsFromStorage();
      const updatedReports = reports.filter(r => r.id !== reportId);
      localStorage.setItem('reports', JSON.stringify(updatedReports));
    }
  }

  static async saveReportData(reportData: ReportData, isTestMode: boolean = false): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/reports/${reportData.report.id}/data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reportData, isTestMode }),
      });

      if (!response.ok) {
        throw new Error('Failed to save report data');
      }

      console.log(`Saved report data for ${reportData.report.id} (test mode: ${isTestMode})`);
    } catch (error) {
      console.error('Error saving report data:', error);
      // Fallback to localStorage
      const key = `report_data_${reportData.report.id}`;
      localStorage.setItem(key, JSON.stringify(reportData));
    }
  }

  static async loadReportData(reportId: string, isTestMode: boolean = false): Promise<ReportData | null> {
    try {
      const response = await fetch(`${this.API_BASE}/reports/${reportId}/data?testMode=${isTestMode}`);
      
      if (!response.ok) {
        throw new Error('Failed to load report data from server');
      }

      const reportData = await response.json();
      console.log(`Loaded report data for ${reportId} (test mode: ${isTestMode})`);
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