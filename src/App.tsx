import React, { useState, useEffect } from 'react';
import { Plus, Upload, Download, Filter, Sun, Moon, Settings as SettingsIcon } from 'lucide-react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { Expense, TransactionFormData, DateRange, CSVPreview, Source } from './types';
import { TransactionForm } from './components/transactions/TransactionForm';
import { DateRangePicker } from './components/DateRangePicker';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Transactions } from './components/transactions/Transactions';
import { Reports } from './components/reports/Reports';
import { generateId, filterExpensesByDateRange } from './utils';
import { LocalStorage } from './utils/storage';
import { SourceModal } from './components/modals/SourceModal';
import { Settings } from './components/modals/Settings';
import { TransactionDetailsModal } from './components/modals/TransactionDetailsModal';

function AppContent() {
  const { theme, toggleTheme } = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [filter, setFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of current month
    end: new Date() // Today
  });
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CSVPreview | null>(null);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Expense | null>(null);
  const [isTransactionDetailsOpen, setIsTransactionDetailsOpen] = useState(false);

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

  // Load expenses, date range, and categories on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedExpenses, loadedSources, loadedDateRange, loadedCategories] = await Promise.all([
          LocalStorage.loadExpenses(),
          LocalStorage.loadSources(),
          LocalStorage.loadDateRange(),
          LocalStorage.loadCategories()
        ]);
        setExpenses(loadedExpenses);
        setSources(loadedSources);
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

  const handleAddExpense = async (formData: TransactionFormData) => {
    const newExpense: Expense = {
      id: generateId(),
      date: formData.date,
      description: formData.description,
      category: formData.category,
      amount: parseFloat(formData.amount),
      type: formData.type,
      memo: formData.memo,
      metadata: {
        sourceName: 'Manual Entry',
        importedAt: new Date().toISOString()
      }
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

  const handleUpdateExpense = async (formData: TransactionFormData) => {
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

  const handleAddLabel = async (expenseId: string, label: string) => {
    try {
      const expenseToUpdate = expenses.find(exp => exp.id === expenseId);
      if (!expenseToUpdate) return;

      const currentLabels = expenseToUpdate.labels || [];
      if (currentLabels.length >= 3) return; // Max 3 labels
      if (currentLabels.includes(label)) return; // Don't add duplicate

      const updatedExpense: Expense = {
        ...expenseToUpdate,
        labels: [...currentLabels, label],
      };

      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense);
      setExpenses(updatedExpenses);
    } catch (error) {
      console.error('Error adding label:', error);
    }
  };

  const handleRemoveLabel = async (expenseId: string, label: string) => {
    try {
      const expenseToUpdate = expenses.find(exp => exp.id === expenseId);
      if (!expenseToUpdate) return;

      const currentLabels = expenseToUpdate.labels || [];
      const updatedLabels = currentLabels.filter(l => l !== label);

      const updatedExpense: Expense = {
        ...expenseToUpdate,
        labels: updatedLabels,
      };

      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense);
      setExpenses(updatedExpenses);
    } catch (error) {
      console.error('Error removing label:', error);
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
        setIsSourceModalOpen(true);
      } catch (error) {
        console.error('Error parsing CSV:', error);
      }
    };
    reader.readAsText(file);
  };

  const handleSaveSource = async (source: Source) => {
    try {
      await LocalStorage.saveSource(source);
      setSources(prev => [...prev, source]);
      if (csvPreview) {
        const csvText = await getCSVTextFromFile();
        const newExpenses = LocalStorage.parseCSVWithSource(csvText, source);
        const existingExpenses = await LocalStorage.loadExpenses();
        const mergedExpenses = LocalStorage.mergeExpenses(existingExpenses, newExpenses);
        await LocalStorage.saveExpenses(mergedExpenses);
        setExpenses(mergedExpenses);
      }
      setIsSourceModalOpen(false);
      setCsvPreview(null);
    } catch (error) {
      console.error('Error saving source:', error);
    }
  };

  const handleImportWithSource = async (source: Source) => {
    try {
      const csvText = await getCSVTextFromFile();
      
      // Call backend API to import with source (which adds metadata)
      const response = await fetch('http://localhost:3001/api/import-with-mapping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvText,
          mapping: source
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to import CSV with source');
      }

      const result = await response.json();
      
      // Reload expenses from backend
      const updatedExpenses = await LocalStorage.loadExpenses();
      setExpenses(updatedExpenses);
      setIsSourceModalOpen(false);
      setCsvPreview(null);
    } catch (error) {
      console.error('Error importing with source:', error);
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

  // Get all unique labels from all expenses
  const allLabels = Array.from(new Set(
    expenses.flatMap(expense => expense.labels || [])
  ));

  const dateFilteredExpenses = filterExpensesByDateRange(expenses, dateRange);
  const filteredExpenses = dateFilteredExpenses.filter(exp => {
    // Type filter
    if (filter === 'all') {
      // Continue to label filter
    } else if (filter === 'expenses') {
      if (exp.type !== 'expense') return false;
    } else if (filter === 'income') {
      if (exp.type !== 'income') return false;
    } else {
      if (exp.category !== filter) return false;
    }
    
    // Label filter
    if (labelFilter.length > 0) {
      const expenseLabels = exp.labels || [];
      // Show transactions that have ANY of the selected labels
      return labelFilter.some(label => expenseLabels.includes(label));
    }
    
    return true;
  });

  const handleDeleteSource = async (id: string) => {
    try {
      await fetch(`http://localhost:3001/api/sources/${id}`, { method: 'DELETE' });
      setSources(prev => prev.filter(source => source.id !== id));
    } catch (error) {
      console.error('Error deleting source:', error);
    }
  };

  const handleViewTransactionDetails = (transaction: Expense) => {
    setSelectedTransaction(transaction);
    setIsTransactionDetailsOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

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

      <main className={`transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-0'} max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12`}>
        {activeTab === 'dashboard' ? (
          <Dashboard
            expenses={filteredExpenses}
            categories={categories}
          />
        ) : activeTab === 'reports' ? (
          <Reports
            expenses={expenses}
            categories={categories}
            globalDateRange={dateRange}
          />
        ) : (
          <div className="space-y-6">
            {/* Filter Controls */}
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-slate-700/50 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Filter Transactions</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Type/Category Filter */}
                <div className="flex items-center space-x-3">
                  <Filter size={18} className="text-slate-400" />
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="input flex-1"
                  >
                    <option value="all">All Transactions</option>
                    <option value="expenses">Expenses Only</option>
                    <option value="income">Income Only</option>
                    {Array.from(new Set(expenses.map(exp => exp.category))).map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                
                {/* Label Filter */}
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Labels:</span>
                  <div className="flex flex-wrap gap-2 flex-1">
                    {allLabels.length > 0 ? (
                      allLabels.map((label) => {
                        const isSelected = labelFilter.includes(label);
                        return (
                          <button
                            key={label}
                            onClick={() => {
                              if (isSelected) {
                                setLabelFilter(labelFilter.filter(l => l !== label));
                              } else {
                                setLabelFilter([...labelFilter, label]);
                              }
                            }}
                            className={`px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                              isSelected
                                ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-400">No labels available</span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Clear Filters */}
              {(filter !== 'all' || labelFilter.length > 0) && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <button
                    onClick={() => {
                      setFilter('all');
                      setLabelFilter([]);
                    }}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>

            {/* Transactions */}
            <Transactions
              expenses={filteredExpenses}
              onDelete={handleDeleteExpense}
              onEdit={handleEditExpense}
              onUpdateCategory={handleUpdateCategory}
              onAddLabel={handleAddLabel}
              onRemoveLabel={handleRemoveLabel}
              onViewDetails={handleViewTransactionDetails}
              categories={categories}
            />
          </div>
        )}
      </main>

      {/* Form Modal */}
      <TransactionForm
        isOpen={isFormOpen}
        onSubmit={editingExpense ? handleUpdateExpense : handleAddExpense}
        onCancel={() => {
          setIsFormOpen(false);
          setEditingExpense(null);
        }}
        editingExpense={editingExpense}
        categories={categories}
      />

      {/* Source Modal */}
      {csvPreview && (
        <SourceModal
          isOpen={isSourceModalOpen}
          onClose={() => {
            setIsSourceModalOpen(false);
            setCsvPreview(null);
          }}
          csvPreview={csvPreview}
          existingSources={sources}
          onSaveSource={handleSaveSource}
          onImportWithSource={handleImportWithSource}
          onDeleteSource={handleDeleteSource}
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
        expenses={expenses}
        sources={sources}
        onRefreshData={async () => {
          const [loadedExpenses, loadedSources, loadedCategories] = await Promise.all([
            LocalStorage.loadExpenses(),
            LocalStorage.loadSources(),
            LocalStorage.loadCategories()
          ]);
          setExpenses(loadedExpenses);
          setSources(loadedSources);
          setCategories(loadedCategories);
        }}
      />

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTransaction}
        isOpen={isTransactionDetailsOpen}
        onClose={() => {
          setIsTransactionDetailsOpen(false);
          setSelectedTransaction(null);
        }}
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