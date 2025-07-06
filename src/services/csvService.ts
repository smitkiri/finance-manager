import { Source, CSVPreview } from '../types';
import { LocalStorage } from '../utils/storage';

export const csvService = {
  async importWithSource(source: Source, user: string): Promise<boolean> {
    try {
      const csvText = await this.getCSVTextFromFile();
      const newExpenses = LocalStorage.parseCSVWithSource(csvText, source, user);
      const existingExpenses = await LocalStorage.loadExpenses();
      const mergedExpenses = LocalStorage.mergeExpenses(existingExpenses, newExpenses);
      await LocalStorage.saveExpenses(mergedExpenses);
      return true;
    } catch (error) {
      console.error('Error importing with source:', error);
      return false;
    }
  },

  async exportData(): Promise<void> {
    try {
      const csvContent = await LocalStorage.exportData();
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'expenses.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CSV:', error);
    }
  },

  getCSVTextFromFile(): Promise<string> {
    return new Promise((resolve) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input && input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve(e.target?.result as string);
        };
        reader.readAsText(input.files[0]);
      }
    });
  },

  async saveSource(source: Source): Promise<boolean> {
    try {
      await LocalStorage.saveSource(source);
      return true;
    } catch (error) {
      console.error('Error saving source:', error);
      return false;
    }
  }
}; 