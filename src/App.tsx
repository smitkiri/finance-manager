import React, { useState, useEffect } from 'react';
import { Plus, Upload, Sun, Moon, Settings as SettingsIcon } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { TestModeProvider, useTestMode } from './contexts/TestModeContext';
import { Expense, TransactionFormData, DateRange, CSVPreview, Source, User } from './types';
import { TransactionForm } from './components/transactions/TransactionForm';
import { TransactionFiltersComponent, TransactionFilters as FilterType } from './components/transactions/TransactionFilters';
import { DateRangePicker } from './components/DateRangePicker';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Transactions } from './components/transactions/Transactions';
import { Reports } from './components/reports/Reports';
import { generateId } from './utils';
import { LocalStorage } from './utils/storage';
import { SourceModal } from './components/modals/SourceModal';
import { Settings } from './components/modals/Settings';
import { TransactionDetailsModal } from './components/modals/TransactionDetailsModal';
import { UserFilter } from './components/UserFilter';

function AppContent() {
  const { theme, toggleTheme } = useTheme();
  const { isTestMode } = useTestMode();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [transactionFilters, setTransactionFilters] = useState<FilterType>({});
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
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Save date range whenever it changes (but not during initial load)
  useEffect(() => {
    if (!isInitialLoadComplete) return;
    
    const saveDateRange = async () => {
      try {
        await LocalStorage.saveDateRange(dateRange, isTestMode);
      } catch (error) {
        console.error('Error saving date range:', error);
      }
    };
    
    saveDateRange();
  }, [dateRange, isInitialLoadComplete, isTestMode]);

  // Load expenses, date range, and categories on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedExpenses, loadedSources, loadedDateRange, loadedCategories, loadedUsers] = await Promise.all([
          LocalStorage.loadExpenses(isTestMode),
          LocalStorage.loadSources(isTestMode),
          LocalStorage.loadDateRange(isTestMode),
          LocalStorage.loadCategories(isTestMode),
          LocalStorage.loadUsers(isTestMode)
        ]);
        setExpenses(loadedExpenses);
        setSources(loadedSources);
        setCategories(loadedCategories);
        setUsers(loadedUsers);
        
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
  }, [isTestMode]); // Reload when test mode changes

  const handleAddExpense = async (formData: TransactionFormData) => {
    const newExpense: Expense = {
      id: generateId(),
      date: formData.date,
      description: formData.description,
      category: formData.category,
      amount: parseFloat(formData.amount),
      type: formData.type,
      user: formData.user,
      metadata: {
        sourceName: 'Manual Entry',
        importedAt: new Date().toISOString()
      }
    };

    try {
      const updatedExpenses = await LocalStorage.addExpense(newExpense, isTestMode);
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
      user: formData.user
    };

    try {
      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense, isTestMode);
      setExpenses(updatedExpenses);
      setEditingExpense(null);
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error updating expense:', error);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      const updatedExpenses = await LocalStorage.deleteExpense(id, isTestMode);
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

      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense, isTestMode);
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

      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense, isTestMode);
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

      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense, isTestMode);
      setExpenses(updatedExpenses);
    } catch (error) {
      console.error('Error removing label:', error);
    }
  };

  const handleAddCategory = async (category: string) => {
    try {
      const updatedCategories = await LocalStorage.addCategory(category, isTestMode);
      setCategories(updatedCategories);
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const handleDeleteCategory = async (category: string) => {
    try {
      const [updatedCategories, updatedExpenses] = await Promise.all([
        LocalStorage.deleteCategory(category, isTestMode),
        LocalStorage.loadExpenses(isTestMode)
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
        LocalStorage.updateCategory(oldCategory, newCategory, isTestMode),
        LocalStorage.loadExpenses(isTestMode)
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

  const handleSaveSource = async (source: Source, userId: string) => {
    try {
      await LocalStorage.saveSource(source, isTestMode);
      setSources(prev => [...prev, source]);
      if (csvPreview) {
        const csvText = await getCSVTextFromFile();
        
        // Call backend API to import with source (which adds metadata and detects transfers)
        const response = await fetch('http://localhost:3001/api/import-with-mapping', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            csvText,
            mapping: source,
            userId,
            isTestMode
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to import CSV with source');
        }

        const result = await response.json();
        
        // Show toast notification for auto-filled categories
        if (result.autoFilledCategories && result.autoFilledCategories.length > 0) {
          const count = result.autoFilledCategories.length;
          const message = count === 1 
            ? `1 category was auto-filled: ${result.autoFilledCategories[0].suggestedCategory}`
            : `${count} categories were auto-filled based on similar transactions`;
          
          toast.success(message, {
            position: "bottom-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
        }
        
        // Reload expenses from backend
        const updatedExpenses = await LocalStorage.loadExpenses(isTestMode);
        setExpenses(updatedExpenses);
      }
      setIsSourceModalOpen(false);
      setCsvPreview(null);
    } catch (error) {
      console.error('Error saving source:', error);
      toast.error('Failed to import CSV', {
        position: "bottom-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  };

  const handleImportWithSource = async (source: Source, userId: string) => {
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
          mapping: source,
          userId,
          isTestMode
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to import CSV with source');
      }
      
      const result = await response.json();
      
      // Show toast notification for auto-filled categories
      if (result.autoFilledCategories && result.autoFilledCategories.length > 0) {
        const count = result.autoFilledCategories.length;
        const message = count === 1 
          ? `1 category was auto-filled: ${result.autoFilledCategories[0].suggestedCategory}`
          : `${count} categories were auto-filled based on similar transactions`;
        
        toast.success(message, {
          position: "bottom-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
      }
      
      // Reload expenses from backend
      const updatedExpenses = await LocalStorage.loadExpenses(isTestMode);
      setExpenses(updatedExpenses);
      setIsSourceModalOpen(false);
      setCsvPreview(null);
    } catch (error) {
      console.error('Error importing with source:', error);
      toast.error('Failed to import CSV', {
        position: "bottom-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
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
      const csvContent = await LocalStorage.exportData(isTestMode);
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

  // Apply all filters using the new filter system
  const filteredExpenses = expenses.filter(exp => {
    // Date range filter - always use global date range
    const expenseDate = new Date(exp.date);
    if (expenseDate < dateRange.start || expenseDate > dateRange.end) {
      return false;
    }

    // Search text filter
    if (transactionFilters.searchText) {
      const searchLower = transactionFilters.searchText.toLowerCase();
      const descriptionLower = exp.description.toLowerCase();
      if (!descriptionLower.includes(searchLower)) {
        return false;
      }
    }

    // Category filter
    if (transactionFilters.categories && transactionFilters.categories.length > 0) {
      const expenseCategory = exp.category || 'Uncategorized';
      if (!transactionFilters.categories.includes(expenseCategory)) {
        return false;
      }
    }

    // Label filter
    if (transactionFilters.labels && transactionFilters.labels.length > 0) {
      const expenseLabels = exp.labels || [];
      if (!transactionFilters.labels.some(label => expenseLabels.includes(label))) {
        return false;
      }
    }

    // Type filter
    if (transactionFilters.types && transactionFilters.types.length > 0) {
      if (!transactionFilters.types.includes(exp.type)) {
        return false;
      }
    }

    // Source filter
    if (transactionFilters.sources && transactionFilters.sources.length > 0) {
      const expenseSourceId = exp.metadata?.sourceId;
      if (!expenseSourceId || !transactionFilters.sources.includes(expenseSourceId)) {
        return false;
      }
    }

    // Amount range filter
    if (transactionFilters.minAmount !== undefined && exp.amount < transactionFilters.minAmount) {
      return false;
    }
    if (transactionFilters.maxAmount !== undefined && exp.amount > transactionFilters.maxAmount) {
      return false;
    }

    // User filter
    if (selectedUserId !== null && exp.user !== selectedUserId) {
      return false;
    }

    // Do NOT filter out transfers here; always show them in the list

    return true;
  });

  // Dashboard filtering - only apply global date range, not transaction page filters
  const dashboardExpenses = expenses.filter(exp => {
    // Only apply global date range filter for dashboard
    const expenseDate = new Date(exp.date);
    if (expenseDate < dateRange.start || expenseDate > dateRange.end) {
      return false;
    }
    
    // User filter for dashboard
    if (selectedUserId !== null && exp.user !== selectedUserId) {
      return false;
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

  const handleUpdateSource = async (updatedSource: Source) => {
    try {
      const updatedSources = await LocalStorage.updateSource(updatedSource, isTestMode);
      setSources(updatedSources);
    } catch (error) {
      console.error('Error updating source:', error);
    }
  };

  const handleViewTransactionDetails = (transaction: Expense) => {
    setSelectedTransaction(transaction);
    setIsTransactionDetailsOpen(true);
  };

  const handleTransferOverride = async (transactionId: string, includeInCalculations: boolean) => {
    try {
      const response = await fetch('http://localhost:3001/api/transfer-override', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId,
          includeInCalculations,
          isTestMode
        }),
      });

      if (response.ok) {
        // Reload expenses to get updated transfer info
        const updatedExpenses = await LocalStorage.loadExpenses(isTestMode);
        setExpenses(updatedExpenses);
      } else {
        console.error('Failed to update transfer override');
      }
    } catch (error) {
      console.error('Error updating transfer override:', error);
    }
  };

  const handleExcludeToggle = async (transactionId: string, exclude: boolean) => {
    try {
      const expenseToUpdate = expenses.find(exp => exp.id === transactionId);
      if (!expenseToUpdate) return;
      const updatedExpense = {
        ...expenseToUpdate,
        excludedFromCalculations: exclude,
      };
      const updatedExpenses = await LocalStorage.updateExpense(updatedExpense, isTestMode);
      setExpenses(updatedExpenses);
      // If the selected transaction is open, update it in state as well
      if (selectedTransaction && selectedTransaction.id === transactionId) {
        setSelectedTransaction(updatedExpense);
      }
    } catch (error) {
      console.error('Error updating excludedFromCalculations:', error);
    }
  };

  const handleAddUser = async (user: User) => {
    try {
      const updatedUsers = await LocalStorage.addUser(user, isTestMode);
      setUsers(updatedUsers);
    } catch (error) {
      console.error('Error adding user:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const updatedUsers = await LocalStorage.deleteUser(userId, isTestMode);
      setUsers(updatedUsers);
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleUpdateUser = async (updatedUser: User) => {
    try {
      const updatedUsers = await LocalStorage.updateUser(updatedUser, isTestMode);
      setUsers(updatedUsers);
    } catch (error) {
      console.error('Error updating user:', error);
    }
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
      <header className={`backdrop-blur-md shadow-lg border-b border-white/20 dark:border-slate-700/50 sticky top-0 z-10 ${
        isTestMode 
          ? 'bg-gradient-to-r from-orange-400/90 to-red-500/90 dark:from-orange-600/90 dark:to-red-600/90' 
          : 'bg-white/90 dark:bg-slate-800/90'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className={`text-3xl font-bold bg-clip-text text-transparent ${
                isTestMode 
                  ? 'bg-gradient-to-r from-white to-yellow-200' 
                  : 'bg-gradient-to-r from-blue-600 to-purple-600'
              }`}>
                {isTestMode ? 'Expense Tracker (Test Mode)' : 'Expense Tracker'}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <UserFilter
                users={users}
                selectedUserId={selectedUserId}
                onUserChange={setSelectedUserId}
              />
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
                onClick={() => setIsFormOpen(true)}
                className="flex items-center justify-center w-10 h-10 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Add Transaction"
              >
                <Plus size={24} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className={`transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-0'} max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12`}>
        {activeTab === 'dashboard' ? (
          <Dashboard
            expenses={dashboardExpenses}
            categories={categories}
            selectedUserId={selectedUserId}
            users={users}
          />
        ) : activeTab === 'reports' ? (
          <Reports
            expenses={filteredExpenses}
            categories={categories}
            sources={sources}
            globalDateRange={dateRange}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Transactions List */}
            <div className="lg:col-span-3">
              <Transactions
                expenses={filteredExpenses}
                onDelete={handleDeleteExpense}
                onEdit={handleEditExpense}
                onUpdateCategory={handleUpdateCategory}
                onAddLabel={handleAddLabel}
                onRemoveLabel={handleRemoveLabel}
                onViewDetails={handleViewTransactionDetails}
                categories={categories}
                searchText={transactionFilters.searchText || ''}
                onSearchChange={(searchText) => setTransactionFilters(prev => ({ ...prev, searchText: searchText || undefined }))}
              />
            </div>

            {/* Filters Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <TransactionFiltersComponent
                  filters={transactionFilters}
                  onFiltersChange={setTransactionFilters}
                  categories={categories}
                  sources={sources}
                  allLabels={allLabels}
                  isCompact={true}
                  onClearFilters={() => setTransactionFilters({})}
                />
              </div>
            </div>
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
        users={users}
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
          users={users}
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
        users={users}
        onAddUser={handleAddUser}
        onDeleteUser={handleDeleteUser}
        onUpdateUser={handleUpdateUser}
        onRefreshData={async () => {
          const [loadedExpenses, loadedSources, loadedCategories, loadedUsers] = await Promise.all([
            LocalStorage.loadExpenses(isTestMode),
            LocalStorage.loadSources(isTestMode),
            LocalStorage.loadCategories(isTestMode),
            LocalStorage.loadUsers(isTestMode)
          ]);
          setExpenses(loadedExpenses);
          setSources(loadedSources);
          setCategories(loadedCategories);
          setUsers(loadedUsers);
        }}
        onExportCSV={handleExportCSV}
        onUpdateSource={handleUpdateSource}
      />

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTransaction}
        isOpen={isTransactionDetailsOpen}
        onClose={() => {
          setIsTransactionDetailsOpen(false);
          setSelectedTransaction(null);
        }}
        onTransferOverride={handleTransferOverride}
        onExcludeToggle={handleExcludeToggle}
        allTransactions={expenses}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <TestModeProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <AppContent />
          <ToastContainer />
        </div>
      </TestModeProvider>
    </ThemeProvider>
  );
}

export default App; 