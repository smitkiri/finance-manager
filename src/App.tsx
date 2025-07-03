import React, { useState, useEffect } from 'react';
import { Plus, Upload, Download, Filter, Sun, Moon, Settings as SettingsIcon } from 'lucide-react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { Expense, ExpenseFormData, DateRange, ColumnMapping, CSVPreview } from './types';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseList } from './components/ExpenseList';
import { StatsCard } from './components/StatsCard';
import { Chart } from './components/Chart';
import { CategoryTable } from './components/CategoryTable';
import { DateRangePicker } from './components/DateRangePicker';
import { calculateStats, generateId, filterExpensesByDateRange } from './utils';
import { LocalStorage } from './utils/storage';
import { CSVMappingModal } from './components/CSVMappingModal';
import { Settings } from './components/Settings';

function AppContent() {
  const { theme, toggleTheme } = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filter, setFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of current month
    end: new Date() // Today
  });
  const [stats, setStats] = useState(calculateStats([]));
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CSVPreview | null>(null);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    const filteredExpenses = filterExpensesByDateRange(expenses, dateRange);
    setStats(calculateStats(filteredExpenses));
  }, [expenses, dateRange]);

  // Save date range whenever it changes (but not during initial load)
  useEffect(() => {
    if (!isInitialLoadComplete) return;
    
    const saveDateRange = async () => {
      try {
        await LocalStorage.saveDateRange(dateRange);
      } catch (error) {
        console.error('Error saving date range:', error);
      }
    };
    
    saveDateRange();
  }, [dateRange, isInitialLoadComplete]);

  // Load expenses, column mappings, date range, and categories on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedExpenses, loadedMappings, loadedDateRange, loadedCategories] = await Promise.all([
          LocalStorage.loadExpenses(),
          LocalStorage.loadColumnMappings(),
          LocalStorage.loadDateRange(),
          LocalStorage.loadCategories()
        ]);
        setExpenses(loadedExpenses);
        setColumnMappings(loadedMappings);
        setCategories(loadedCategories);
        
        // Set date range if loaded, otherwise use default
        if (loadedDateRange) {
          setDateRange(loadedDateRange);
        }
        
        // Mark initial load as complete
        setIsInitialLoadComplete(true);
      } catch (error) {
        console.error('Error loading data:', error);
        setIsInitialLoadComplete(true);
      }
    };
    
    loadData();
  }, []);

  const handleAddExpense = async (formData: ExpenseFormData) => {
    const newExpense: Expense = {
      id: generateId(),
      date: formData.date,
      description: formData.description,
      category: formData.category,
      amount: parseFloat(formData.amount),
      type: formData.type,
      memo: formData.memo,
    };

    try {
      const updatedExpenses = await LocalStorage.addExpense(newExpense);
      setExpenses(updatedExpenses);
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error adding expense:', error);
    }
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleUpdateExpense = async (formData: ExpenseFormData) => {
    if (!editingExpense) return;

    const updatedExpense: Expense = {
      ...editingExpense,
      date: formData.date,
      description: formData.description,
      category: formData.category,
      amount: parseFloat(formData.amount),
      type: formData.type,
      memo: formData.memo,
    };

    try {
      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense);
      setExpenses(updatedExpenses);
      setEditingExpense(null);
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error updating expense:', error);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      const updatedExpenses = await LocalStorage.deleteExpense(id);
      setExpenses(updatedExpenses);
    } catch (error) {
      console.error('Error deleting expense:', error);
    }
  };

  const handleUpdateCategory = async (expenseId: string, newCategory: string) => {
    try {
      const expenseToUpdate = expenses.find(exp => exp.id === expenseId);
      if (!expenseToUpdate) return;

      const updatedExpense: Expense = {
        ...expenseToUpdate,
        category: newCategory,
      };

      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense);
      setExpenses(updatedExpenses);
    } catch (error) {
      console.error('Error updating category:', error);
    }
  };

  const handleAddCategory = async (category: string) => {
    try {
      const updatedCategories = await LocalStorage.addCategory(category);
      setCategories(updatedCategories);
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const handleDeleteCategory = async (category: string) => {
    try {
      const [updatedCategories, updatedExpenses] = await Promise.all([
        LocalStorage.deleteCategory(category),
        LocalStorage.loadExpenses()
      ]);
      setCategories(updatedCategories);
      setExpenses(updatedExpenses);
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const handleUpdateCategoryName = async (oldCategory: string, newCategory: string) => {
    try {
      const [updatedCategories, updatedExpenses] = await Promise.all([
        LocalStorage.updateCategory(oldCategory, newCategory),
        LocalStorage.loadExpenses()
      ]);
      setCategories(updatedCategories);
      setExpenses(updatedExpenses);
    } catch (error) {
      console.error('Error updating category name:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const preview = LocalStorage.parseCSVPreview(text);
        setCsvPreview(preview);
        setIsMappingModalOpen(true);
      } catch (error) {
        console.error('Error parsing CSV:', error);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveMapping = async (mapping: ColumnMapping) => {
    try {
      await LocalStorage.saveColumnMapping(mapping);
      setColumnMappings(prev => [...prev, mapping]);
      
      // Import the CSV with the new mapping
      if (csvPreview) {
        const csvText = await getCSVTextFromFile();
        const newExpenses = LocalStorage.parseCSVWithMapping(csvText, mapping);
        const existingExpenses = await LocalStorage.loadExpenses();
        const mergedExpenses = LocalStorage.mergeExpenses(existingExpenses, newExpenses);
        await LocalStorage.saveExpenses(mergedExpenses);
        setExpenses(mergedExpenses);
      }
      
      setIsMappingModalOpen(false);
      setCsvPreview(null);
    } catch (error) {
      console.error('Error saving mapping:', error);
    }
  };

  const handleImportWithMapping = async (mapping: ColumnMapping) => {
    try {
      const csvText = await getCSVTextFromFile();
      const newExpenses = LocalStorage.parseCSVWithMapping(csvText, mapping);
      const existingExpenses = await LocalStorage.loadExpenses();
      const mergedExpenses = LocalStorage.mergeExpenses(existingExpenses, newExpenses);
      await LocalStorage.saveExpenses(mergedExpenses);
      setExpenses(mergedExpenses);
      
      setIsMappingModalOpen(false);
      setCsvPreview(null);
    } catch (error) {
      console.error('Error importing with mapping:', error);
    }
  };

  const getCSVTextFromFile = async (): Promise<string> => {
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
  };

  const handleExportCSV = async () => {
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
  };

  const dateFilteredExpenses = filterExpensesByDateRange(expenses, dateRange);
  const filteredExpenses = dateFilteredExpenses.filter(exp => {
    if (filter === 'all') return true;
    if (filter === 'expenses') return exp.type === 'expense';
    if (filter === 'income') return exp.type === 'income';
    return exp.category === filter;
  });



  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-lg border-b border-white/20 dark:border-slate-700/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                      <div className="flex items-center justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Expense Tracker</h1>
              </div>
              <div className="flex items-center space-x-4">
                <DateRangePicker
                  currentRange={dateRange}
                  onDateRangeChange={setDateRange}
                />
                              <button
                onClick={toggleTheme}
                className="p-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all duration-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 hover:shadow-md"
                title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all duration-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 hover:shadow-md"
                title="Settings"
              >
                <SettingsIcon size={20} />
              </button>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="flex items-center space-x-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all duration-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Upload size={16} />
                  <span>Import CSV</span>
                </div>
              </label>
              <button
                onClick={handleExportCSV}
                className="flex items-center space-x-2 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all duration-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <Download size={16} />
                <span>Export CSV</span>
              </button>
              <button
                onClick={() => setIsFormOpen(true)}
                className="btn-primary flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>Add Transaction</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <StatsCard
            title="Total Expenses"
            value={stats.totalExpenses}
            type="expense"
          />
          <StatsCard
            title="Total Income"
            value={stats.totalIncome}
            type="income"
          />
          <StatsCard
            title="Net Amount"
            value={stats.netAmount}
            type="net"
          />
        </div>

        {/* Charts and Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <Chart
            data={stats.monthlyData}
            type="line"
            title="Monthly Overview"
            height={300}
          />
          <CategoryTable
            categoryBreakdown={stats.categoryBreakdown}
            totalExpenses={stats.totalExpenses}
          />
        </div>

        {/* Filter and Transactions */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-slate-700/50">
          <div className="p-8 border-b border-white/20 dark:border-slate-700/50">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Transactions</h2>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3">
                  <Filter size={18} className="text-slate-400" />
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="input max-w-xs"
                  >
                    <option value="all">All Transactions</option>
                    <option value="expenses">Expenses Only</option>
                    <option value="income">Income Only</option>
                    {Array.from(new Set(expenses.map(exp => exp.category))).map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className="p-8 max-h-96 overflow-y-auto">
            <ExpenseList
              expenses={filteredExpenses}
              onDelete={handleDeleteExpense}
              onEdit={handleEditExpense}
              onUpdateCategory={handleUpdateCategory}
              categories={categories}
            />
          </div>
        </div>
      </main>

      {/* Form Modal */}
      <ExpenseForm
        isOpen={isFormOpen}
        onSubmit={editingExpense ? handleUpdateExpense : handleAddExpense}
        onCancel={() => {
          setIsFormOpen(false);
          setEditingExpense(null);
        }}
        editingExpense={editingExpense}
        categories={categories}
      />

      {/* CSV Mapping Modal */}
      {csvPreview && (
        <CSVMappingModal
          isOpen={isMappingModalOpen}
          onClose={() => {
            setIsMappingModalOpen(false);
            setCsvPreview(null);
          }}
          csvPreview={csvPreview}
          existingMappings={columnMappings}
          onSaveMapping={handleSaveMapping}
          onImportWithMapping={handleImportWithMapping}
        />
      )}

      {/* Settings Modal */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        categories={categories}
        onAddCategory={handleAddCategory}
        onDeleteCategory={handleDeleteCategory}
        onUpdateCategory={handleUpdateCategoryName}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App; 