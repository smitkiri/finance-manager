import { Expense, ColumnMapping, CSVPreview, StandardizedColumn } from '../types';

interface StorageMetadata {
  lastUpdated: string;
  totalExpenses: number;
  totalIncome: number;
  dateRange: {
    start: string;
    end: string;
  };
}

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

  // Column Mapping Methods
  static async saveColumnMapping(mapping: ColumnMapping): Promise<void> {
    try {
      const response = await fetch(`${this.API_BASE}/column-mappings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mapping }),
      });

      if (!response.ok) {
        throw new Error('Failed to save column mapping');
      }

      console.log(`Saved column mapping: ${mapping.name}`);
    } catch (error) {
      console.error('Error saving column mapping:', error);
      // Fallback to localStorage
      const existingMappings = this.getColumnMappingsFromStorage();
      existingMappings.push(mapping);
      localStorage.setItem('column_mappings', JSON.stringify(existingMappings));
    }
  }

  static async loadColumnMappings(): Promise<ColumnMapping[]> {
    try {
      const response = await fetch(`${this.API_BASE}/column-mappings`);
      
      if (!response.ok) {
        throw new Error('Failed to load column mappings');
      }

      const mappings = await response.json();
      console.log(`Loaded ${mappings.length} column mappings from server`);
      return mappings;
    } catch (error) {
      console.error('Error loading column mappings from server:', error);
      // Fallback to localStorage
      return this.getColumnMappingsFromStorage();
    }
  }

  private static getColumnMappingsFromStorage(): ColumnMapping[] {
    try {
      const stored = localStorage.getItem('column_mappings');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading column mappings from localStorage:', error);
      return [];
    }
  }

  static parseCSVWithMapping(csvText: string, mapping: ColumnMapping): Expense[] {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    
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
        const values = line.split(',');
        
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
              amount = parseFloat(value) || 0;
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

  static parseCSVPreview(csvText: string): CSVPreview {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    const sampleRows = lines.slice(1, 6); // Show first 5 rows as preview
    
    return {
      headers,
      sampleRows: sampleRows.map(line => line.split(',')),
      totalRows: lines.length - 1
    };
  }
} 