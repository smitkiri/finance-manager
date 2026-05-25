import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Plus, Upload, Sun, Moon, Building2 } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import {
  Expense,
  TransactionFormData,
  DateRange,
  CSVPreview,
  Source,
  User,
  DashboardStats,
  Account,
} from './types';
import { NetWorth } from './components/networth/NetWorth';
import { TransactionForm } from './components/transactions/TransactionForm';
import {
  TransactionFiltersComponent,
  TransactionFilters as FilterType,
} from './components/transactions/TransactionFilters';
import { DateRangePicker } from './components/DateRangePicker';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Transactions } from './components/transactions/Transactions';
import { Reports } from './components/reports/Reports';
import { generateId } from './utils';
import { ApiClient, AuthUser, AuthHousehold } from './utils/apiClient';
import { SourceModal } from './components/modals/SourceModal';
import { Settings } from './components/modals/Settings';
import { TransactionDetailsModal } from './components/modals/TransactionDetailsModal';
import { TellerImportModal } from './components/modals/TellerImportModal';
import { UserFilter } from './components/UserFilter';
import { PersonalDashboards } from './components/dashboards/PersonalDashboards';
import { DemoBanner } from './components/DemoBanner';
import { Logo } from './components/Logo';
import { ITEMS_PER_PAGE } from './constants';

function AppContent() {
  const { theme, toggleTheme } = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [transactionFilters, setTransactionFilters] = useState<FilterType>({});
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of current month
    end: new Date(), // Today
  });
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<CSVPreview | null>(null);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const location = useLocation();
  const isSettingsRoute = location.pathname === '/settings';
  const [categories, setCategories] = useState<string[]>([]);
  const [allLabels, setAllLabels] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Expense | null>(null);
  const [isTransactionDetailsOpen, setIsTransactionDetailsOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  // Server-side paginated list for Transactions tab
  const [transactionList, setTransactionList] = useState<Expense[]>([]);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [transactionListLoading, setTransactionListLoading] = useState(false);
  const [transactionListVersion, setTransactionListVersion] = useState(0);
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tellerEnabled, setTellerEnabled] = useState(false);
  const [showTellerImport, setShowTellerImport] = useState(false);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentHousehold, setCurrentHousehold] = useState<AuthHousehold | null>(null);

  useEffect(() => {
    document.title = demoEnabled ? '(Demo) Tally' : 'Tally';
  }, [demoEnabled]);

  // Resolve current user + household via the JWT, or fall back to the demo
  // bypass when the backend is in demo mode (no token needed).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let isDemo = false;
      try {
        const demoConfig = await ApiClient.getDemoConfig();
        isDemo = !!demoConfig?.enabled;
      } catch {
        // Demo probe failure is non-fatal.
      }

      if (!isDemo && !ApiClient.getAuthToken()) {
        if (!cancelled) setAuthChecked(true);
        return;
      }

      try {
        const me = await ApiClient.getMe();
        if (cancelled) return;
        setCurrentUser(me.user);
        setCurrentHousehold(me.household);
      } catch {
        if (cancelled) return;
        // Token expired/invalid or demo deploy not yet seeded — clear it.
        ApiClient.setAuthToken(null);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save date range whenever it changes (but not during initial load)
  useEffect(() => {
    if (!isInitialLoadComplete) return;

    const saveDateRange = async () => {
      try {
        await ApiClient.saveDateRange(dateRange);
      } catch (error) {
        console.error('Error saving date range:', error);
      }
    };

    saveDateRange();
  }, [dateRange, isInitialLoadComplete]);

  // Initial load: categories, users, sources, date range only (no full expenses – defer until Dashboard/Reports)
  useEffect(() => {
    if (!currentUser) return;
    const loadData = async () => {
      try {
        const [
          loadedSources,
          loadedDateRange,
          loadedCategories,
          loadedUsers,
          loadedAccounts,
          tellerConfig,
          loadedLabels,
          demoConfig,
        ] = await Promise.all([
          ApiClient.loadSources(),
          ApiClient.loadDateRange(),
          ApiClient.loadCategories(),
          ApiClient.loadUsers(),
          ApiClient.loadAccounts(),
          ApiClient.getTellerConfig(),
          ApiClient.loadLabels(),
          ApiClient.getDemoConfig(),
        ]);
        setSources(loadedSources);
        setCategories(loadedCategories);
        setAllLabels(loadedLabels);
        setUsers(loadedUsers);
        setAccounts(loadedAccounts);
        setTellerEnabled(tellerConfig.enabled);
        setDemoEnabled(demoConfig.enabled);
        if (loadedDateRange) {
          setDateRange(loadedDateRange);
        }
        setIsInitialLoadComplete(true);
      } catch (error) {
        console.error('Error loading data:', error);
        setIsInitialLoadComplete(true);
      }
    };
    loadData();
  }, [currentUser]);

  // Load dashboard stats from API (aggregates only) when user visits Dashboard
  useEffect(() => {
    if (!isInitialLoadComplete || location.pathname !== '/') return;
    let cancelled = false;
    setDashboardStatsLoading(true);
    ApiClient.loadStats({ dateRange, userId: selectedUserId })
      .then((stats) => {
        if (!cancelled) {
          setDashboardStats(stats ?? null);
          setDashboardStatsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setDashboardStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isInitialLoadComplete, location.pathname, dateRange, selectedUserId]);

  // Load full expenses only when user visits Reports (Dashboard uses /api/stats)
  useEffect(() => {
    if (!isInitialLoadComplete || location.pathname !== '/reports') return;
    let cancelled = false;
    setExpensesLoading(true);
    ApiClient.loadExpenses()
      .then((loaded) => {
        if (!cancelled) {
          setExpenses(loaded);
          setExpensesLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setExpensesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isInitialLoadComplete, location.pathname]);

  // Load expenses when Settings or Transaction Details opens and we don't have them yet
  useEffect(() => {
    if (!isInitialLoadComplete || expenses.length > 0 || expensesLoading) return;
    if (!isSettingsRoute && !isTransactionDetailsOpen) return;
    let cancelled = false;
    setExpensesLoading(true);
    ApiClient.loadExpenses()
      .then((loaded) => {
        if (!cancelled) {
          setExpenses(loaded);
          setExpensesLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setExpensesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isInitialLoadComplete,
    isSettingsRoute,
    isTransactionDetailsOpen,
    expenses.length,
    expensesLoading,
  ]);

  // Debounce search text for transactions to avoid refetching on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearchText(transactionFilters.searchText ?? '');
    }, 400);
    return () => clearTimeout(t);
  }, [transactionFilters.searchText]);

  // Load paginated transactions when on Transactions tab (or when filters/version change)
  useEffect(() => {
    if (location.pathname !== '/transactions' || !isInitialLoadComplete) return;

    let cancelled = false;
    setTransactionListLoading(true);
    setTransactionList([]);

    ApiClient.loadExpensesPage({
      limit: ITEMS_PER_PAGE,
      offset: 0,
      dateRange,
      userId: selectedUserId ?? undefined,
      categories: transactionFilters.categories,
      labels: transactionFilters.labels,
      types: transactionFilters.types,
      sources: transactionFilters.sources,
      minAmount: transactionFilters.minAmount,
      maxAmount: transactionFilters.maxAmount,
      searchText: debouncedSearchText || undefined,
    })
      .then((data) => {
        if (!cancelled) {
          const pageExpenses = data?.expenses;
          const total = typeof data?.total === 'number' ? data.total : 0;
          setTransactionList(Array.isArray(pageExpenses) ? pageExpenses : []);
          setTransactionTotal(total);
        }
      })
      .finally(() => {
        if (!cancelled) setTransactionListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    location.pathname,
    isInitialLoadComplete,
    dateRange,
    selectedUserId,
    transactionFilters.categories,
    transactionFilters.labels,
    transactionFilters.types,
    transactionFilters.sources,
    transactionFilters.minAmount,
    transactionFilters.maxAmount,
    debouncedSearchText,
    transactionListVersion,
  ]);

  const handleLoadMoreTransactions = useCallback(async () => {
    const currentList = transactionList ?? [];
    const offset = currentList.length;
    const data = await ApiClient.loadExpensesPage({
      limit: ITEMS_PER_PAGE,
      offset,
      dateRange,
      userId: selectedUserId ?? undefined,
      categories: transactionFilters.categories,
      labels: transactionFilters.labels,
      types: transactionFilters.types,
      sources: transactionFilters.sources,
      minAmount: transactionFilters.minAmount,
      maxAmount: transactionFilters.maxAmount,
      searchText: debouncedSearchText || undefined,
    });
    const nextExpenses = Array.isArray(data.expenses) ? data.expenses : [];
    const total = typeof data.total === 'number' ? data.total : currentList.length;
    setTransactionList((prev) => [...(prev ?? []), ...nextExpenses]);
    setTransactionTotal(total);
  }, [transactionList, dateRange, selectedUserId, transactionFilters, debouncedSearchText]);

  const bumpTransactionListVersion = useCallback(() => {
    setTransactionListVersion((v) => v + 1);
  }, []);

  const handleAddExpense = useCallback(
    async (formData: TransactionFormData) => {
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
          importedAt: new Date().toISOString(),
        },
      };

      try {
        const updatedExpenses = await ApiClient.addExpense(newExpense);
        setExpenses(updatedExpenses);
        bumpTransactionListVersion();
        setIsFormOpen(false);
      } catch (error) {
        console.error('Error adding expense:', error);
      }
    },
    [bumpTransactionListVersion]
  );

  const handleEditExpense = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setIsFormOpen(true);
  }, []);

  const handleUpdateExpense = useCallback(
    async (formData: TransactionFormData) => {
      if (!editingExpense) return;

      const updatedExpense: Expense = {
        ...editingExpense,
        date: formData.date,
        description: formData.description,
        category: formData.category,
        amount: parseFloat(formData.amount),
        type: formData.type,
        user: formData.user,
      };

      try {
        const returnedExpense = await ApiClient.updateExpense(updatedExpense);
        setExpenses((prev) => prev.map((e) => (e.id === returnedExpense.id ? returnedExpense : e)));
        setTransactionList((prev) =>
          prev.map((e) => (e.id === returnedExpense.id ? returnedExpense : e))
        );
        setEditingExpense(null);
        setIsFormOpen(false);
      } catch (error) {
        console.error('Error updating expense:', error);
      }
    },
    [editingExpense]
  );

  const handleDeleteExpense = useCallback(
    async (id: string) => {
      try {
        const updatedExpenses = await ApiClient.deleteExpense(id);
        setExpenses(updatedExpenses);
        bumpTransactionListVersion();
      } catch (error) {
        console.error('Error deleting expense:', error);
      }
    },
    [bumpTransactionListVersion]
  );

  const handleUpdateCategory = useCallback(
    async (expenseId: string, newCategory: string) => {
      try {
        let expenseToUpdate = transactionList.find((exp) => exp.id === expenseId);
        if (!expenseToUpdate) {
          expenseToUpdate = expenses.find((exp) => exp.id === expenseId);
        }

        if (!expenseToUpdate) return;

        const updatedExpenseData = { ...expenseToUpdate, category: newCategory };

        const returnedExpense = await ApiClient.updateExpense(updatedExpenseData);

        setExpenses((prev) => prev.map((e) => (e.id === returnedExpense.id ? returnedExpense : e)));
        setTransactionList((prev) =>
          prev.map((e) => (e.id === returnedExpense.id ? returnedExpense : e))
        );
      } catch (error) {
        console.error('Error updating category:', error);
      }
    },
    [expenses, transactionList]
  );

  const handleAddLabel = useCallback(
    async (expenseId: string, label: string) => {
      try {
        const expenseToUpdate =
          transactionList.find((exp) => exp.id === expenseId) ||
          expenses.find((exp) => exp.id === expenseId);
        if (!expenseToUpdate) return;

        const currentLabels = expenseToUpdate.labels || [];
        if (currentLabels.length >= 3) return; // Max 3 labels
        if (currentLabels.includes(label)) return; // Don't add duplicate

        const updatedExpenseData: Expense = {
          ...expenseToUpdate,
          labels: [...currentLabels, label],
        };

        const returnedExpense = await ApiClient.updateExpense(updatedExpenseData);

        setExpenses((prev) => prev.map((e) => (e.id === expenseId ? returnedExpense : e)));
        setTransactionList((prev) => prev.map((e) => (e.id === expenseId ? returnedExpense : e)));
      } catch (error) {
        console.error('Error adding label:', error);
      }
    },
    [expenses, transactionList]
  );

  const handleRemoveLabel = useCallback(
    async (expenseId: string, label: string) => {
      try {
        const expenseToUpdate =
          transactionList.find((exp) => exp.id === expenseId) ||
          expenses.find((exp) => exp.id === expenseId);
        if (!expenseToUpdate) return;

        const currentLabels = expenseToUpdate.labels || [];
        const updatedLabels = currentLabels.filter((l) => l !== label);

        const updatedExpenseData: Expense = {
          ...expenseToUpdate,
          labels: updatedLabels,
        };

        const returnedExpense = await ApiClient.updateExpense(updatedExpenseData);

        setExpenses((prev) => prev.map((e) => (e.id === expenseId ? returnedExpense : e)));
        setTransactionList((prev) => prev.map((e) => (e.id === expenseId ? returnedExpense : e)));
      } catch (error) {
        console.error('Error removing label:', error);
      }
    },
    [expenses, transactionList]
  );

  const handleAddCategory = useCallback(async (category: string) => {
    try {
      const updatedCategories = await ApiClient.addCategory(category);
      setCategories(updatedCategories);
    } catch (error) {
      console.error('Error adding category:', error);
    }
  }, []);

  const handleDeleteCategory = useCallback(
    async (category: string) => {
      try {
        const [updatedCategories, updatedExpenses] = await Promise.all([
          ApiClient.deleteCategory(category),
          ApiClient.loadExpenses(),
        ]);
        setCategories(updatedCategories);
        setExpenses(updatedExpenses);
        bumpTransactionListVersion();
      } catch (error) {
        console.error('Error deleting category:', error);
      }
    },
    [bumpTransactionListVersion]
  );

  const handleUpdateCategoryName = useCallback(
    async (oldCategory: string, newCategory: string) => {
      try {
        const [updatedCategories, updatedExpenses] = await Promise.all([
          ApiClient.updateCategory(oldCategory, newCategory),
          ApiClient.loadExpenses(),
        ]);
        setCategories(updatedCategories);
        setExpenses(updatedExpenses);
        bumpTransactionListVersion();
      } catch (error) {
        console.error('Error updating category name:', error);
      }
    },
    [bumpTransactionListVersion]
  );

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const preview = ApiClient.parseCSVPreview(text);
        setCsvPreview(preview);
        setIsSourceModalOpen(true);
      } catch (error) {
        console.error('Error parsing CSV:', error);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleSaveSource = async (source: Source, userId: string) => {
    try {
      await ApiClient.saveSource(source);
      setSources((prev) => [...prev, source]);
      if (csvPreview) {
        const csvText = await getCSVTextFromFile();

        // Call backend API to import with source (which adds metadata and detects transfers)
        const csvFile = (document.querySelector('input[type="file"]') as HTMLInputElement)
          ?.files?.[0];
        const response = await ApiClient.apiFetch(`${ApiClient.getApiBase()}/import-with-mapping`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            csvText,
            mapping: source,
            userId,
            fileName: csvFile?.name,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to import CSV with source');
        }

        const result = await response.json();

        // Show toast notification for auto-filled categories
        if (result.autoFilledCategories && result.autoFilledCategories.length > 0) {
          const count = result.autoFilledCategories.length;
          const message =
            count === 1
              ? `1 category was auto-filled: ${result.autoFilledCategories[0].suggestedCategory}`
              : `${count} categories were auto-filled based on similar transactions`;

          toast.success(message, {
            position: 'bottom-right',
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
        }

        // Show import success toast with undo button
        const sessionId = result.sessionId;
        toast.success(
          <div>
            <div>Successfully imported {result.imported} transactions</div>
            <button
              onClick={() => handleUndoImport(sessionId)}
              className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
            >
              Undo Import
            </button>
          </div>,
          {
            position: 'bottom-right',
            autoClose: 10000,
            hideProgressBar: false,
            closeOnClick: false,
            pauseOnHover: true,
            draggable: true,
          }
        );

        // Reload expenses from backend
        const updatedExpenses = await ApiClient.loadExpenses();
        setExpenses(updatedExpenses);
        bumpTransactionListVersion();
      }
      setIsSourceModalOpen(false);
      setCsvPreview(null);
    } catch (error) {
      console.error('Error saving source:', error);
      toast.error('Failed to import CSV', {
        position: 'bottom-right',
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
      const csvFile = (document.querySelector('input[type="file"]') as HTMLInputElement)
        ?.files?.[0];
      // Call backend API to import with source (which adds metadata)
      const response = await ApiClient.apiFetch(`${ApiClient.getApiBase()}/import-with-mapping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csvText,
          mapping: source,
          userId,
          fileName: csvFile?.name,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to import CSV with source');
      }

      const result = await response.json();

      // Show toast notification for auto-filled categories
      if (result.autoFilledCategories && result.autoFilledCategories.length > 0) {
        const count = result.autoFilledCategories.length;
        const message =
          count === 1
            ? `1 category was auto-filled: ${result.autoFilledCategories[0].suggestedCategory}`
            : `${count} categories were auto-filled based on similar transactions`;

        toast.success(message, {
          position: 'bottom-right',
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
      }

      // Show import success toast with undo button
      const sessionId = result.sessionId;
      toast.success(
        <div>
          <div>Successfully imported {result.imported} transactions</div>
          <button
            onClick={() => handleUndoImport(sessionId)}
            className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
          >
            Undo Import
          </button>
        </div>,
        {
          position: 'bottom-right',
          autoClose: 10000,
          hideProgressBar: false,
          closeOnClick: false,
          pauseOnHover: true,
          draggable: true,
        }
      );

      // Reload expenses from backend
      const updatedExpenses = await ApiClient.loadExpenses();
      setExpenses(updatedExpenses);
      bumpTransactionListVersion();
      setIsSourceModalOpen(false);
      setCsvPreview(null);
    } catch (error) {
      console.error('Error importing with source:', error);
      toast.error('Failed to import CSV', {
        position: 'bottom-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  };

  const handleUndoImport = async (sessionId: string) => {
    try {
      const response = await ApiClient.apiFetch(`${ApiClient.getApiBase()}/undo-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        throw new Error('Failed to undo import');
      }

      const result = await response.json();

      // Show success message
      toast.success(`Undid import: ${result.removed} transactions removed`, {
        position: 'bottom-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });

      // Reload expenses from backend
      const updatedExpenses = await ApiClient.loadExpenses();
      setExpenses(updatedExpenses);
      bumpTransactionListVersion();
    } catch (error) {
      console.error('Error undoing import:', error);
      toast.error('Failed to undo import', {
        position: 'bottom-right',
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
      const csvContent = await ApiClient.exportData();
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

  // Apply all filters using the new filter system
  const filteredExpenses = expenses.filter((exp) => {
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
      if (!transactionFilters.labels.some((label) => expenseLabels.includes(label))) {
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
  const dashboardExpenses = expenses.filter((exp) => {
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
      await ApiClient.apiFetch(`${ApiClient.getApiBase()}/sources/${id}`, {
        method: 'DELETE',
      });
      setSources((prev) => prev.filter((source) => source.id !== id));
    } catch (error) {
      console.error('Error deleting source:', error);
    }
  };

  const handleUpdateSource = async (updatedSource: Source) => {
    try {
      const updatedSources = await ApiClient.updateSource(updatedSource);
      setSources(updatedSources);
    } catch (error) {
      console.error('Error updating source:', error);
    }
  };

  const handleViewTransactionDetails = useCallback((transaction: Expense) => {
    setSelectedTransaction(transaction);
    setIsTransactionDetailsOpen(true);
  }, []);

  const handleTransferOverride = async (transactionId: string, includeInCalculations: boolean) => {
    try {
      const response = await ApiClient.apiFetch(`${ApiClient.getApiBase()}/transfer-override`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionId,
          includeInCalculations,
        }),
      });

      if (response.ok) {
        // Reload expenses to get updated transfer info
        const updatedExpenses = await ApiClient.loadExpenses();
        setExpenses(updatedExpenses);
        bumpTransactionListVersion();
      } else {
        console.error('Failed to update transfer override');
      }
    } catch (error) {
      console.error('Error updating transfer override:', error);
    }
  };

  const handleExcludeToggle = async (transactionId: string, exclude: boolean) => {
    try {
      const expenseToUpdate =
        transactionList.find((exp) => exp.id === transactionId) ||
        expenses.find((exp) => exp.id === transactionId);
      if (!expenseToUpdate) return;

      const updatedExpenseData = {
        ...expenseToUpdate,
        excludedFromCalculations: exclude,
      };

      const returnedExpense = await ApiClient.updateExpense(updatedExpenseData);

      setExpenses((prev) => prev.map((e) => (e.id === transactionId ? returnedExpense : e)));
      setTransactionList((prev) => prev.map((e) => (e.id === transactionId ? returnedExpense : e)));

      if (selectedTransaction && selectedTransaction.id === transactionId) {
        setSelectedTransaction(returnedExpense);
      }
    } catch (error) {
      console.error('Error updating excludedFromCalculations:', error);
    }
  };

  const handleMarkAsTransferRefund = async (transactionId: string, pairTransactionId: string) => {
    try {
      // Look up locally first, then fall back to loading from the API
      let transaction1 =
        transactionList.find((exp) => exp.id === transactionId) ||
        expenses.find((exp) => exp.id === transactionId);
      let transaction2 =
        transactionList.find((exp) => exp.id === pairTransactionId) ||
        expenses.find((exp) => exp.id === pairTransactionId);

      if (!transaction1 || !transaction2) {
        const allExpenses = await ApiClient.loadExpenses();
        transaction1 = transaction1 || allExpenses.find((exp) => exp.id === transactionId);
        transaction2 = transaction2 || allExpenses.find((exp) => exp.id === pairTransactionId);
      }

      if (!transaction1 || !transaction2) {
        console.error('One or both transactions not found');
        toast.error('Could not find one or both transactions', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      // Generate a unique transfer ID
      const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const transferType = transaction1.user === transaction2.user ? 'self' : 'user';

      // Update both transactions with transfer info via individual PATCH calls
      const updatedTransaction1 = await ApiClient.updateExpense({
        ...transaction1,
        transferInfo: {
          isTransfer: true,
          transferId,
          transferType,
          excludedFromCalculations: true,
          userOverride: false,
        },
      });

      const updatedTransaction2 = await ApiClient.updateExpense({
        ...transaction2,
        transferInfo: {
          isTransfer: true,
          transferId,
          transferType,
          excludedFromCalculations: true,
          userOverride: false,
        },
      });

      setExpenses((prev) =>
        prev.map((e) => {
          if (e.id === transactionId) return updatedTransaction1;
          if (e.id === pairTransactionId) return updatedTransaction2;
          return e;
        })
      );
      setTransactionList((prev) =>
        prev.map((e) => {
          if (e.id === transactionId) return updatedTransaction1;
          if (e.id === pairTransactionId) return updatedTransaction2;
          return e;
        })
      );
      bumpTransactionListVersion();

      // Update selected transaction if it's one of the updated ones
      if (
        selectedTransaction &&
        (selectedTransaction.id === transactionId || selectedTransaction.id === pairTransactionId)
      ) {
        const updatedSelected =
          selectedTransaction.id === transactionId ? updatedTransaction1 : updatedTransaction2;
        setSelectedTransaction(updatedSelected);
      }

      toast.success('Transactions marked as transfer/refund pair', {
        position: 'bottom-right',
        autoClose: 3000,
      });
    } catch (error) {
      console.error('Error marking as self-transfer:', error);
      toast.error('Failed to mark transactions as transfer/refund', {
        position: 'bottom-right',
        autoClose: 3000,
      });
    }
  };

  const handleUpdateUser = async (updatedUser: User) => {
    try {
      const renamed = await ApiClient.updateUser(updatedUser);
      setUsers((prev) => prev.map((u) => (u.id === renamed.id ? { ...u, name: renamed.name } : u)));
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-500 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  if (!currentUser || !currentHousehold) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white px-4">
        <div className="max-w-md text-center">
          <p className="mb-3 text-lg">Sign in (UI coming in A3).</p>
          <p className="text-sm text-gray-500">
            For now, log in via curl and paste the token into{' '}
            <code>localStorage.tally_auth_token</code>, then reload.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        topOffset={demoEnabled}
      />

      {/* Sticky top group: demo banner sits above the header so both stay
          pinned together when scrolling. */}
      <div className="sticky top-0 z-20">
        <DemoBanner enabled={demoEnabled} />
        {/* Header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center">
                <Logo className="h-8 w-auto text-gray-900 dark:text-white" />
              </div>
              <div className="flex items-center space-x-4">
                <UserFilter
                  users={users}
                  selectedUserId={selectedUserId}
                  onUserChange={setSelectedUserId}
                />
                <DateRangePicker currentRange={dateRange} onDateRangeChange={setDateRange} />
                <button
                  onClick={toggleTheme}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                  {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
                {tellerEnabled && accounts.some((a) => a.tellerAccountId) && (
                  <button
                    onClick={() => setShowTellerImport(true)}
                    className="flex items-center space-x-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <Building2 size={16} />
                    <span>Import from Bank</span>
                  </button>
                )}
                <label className="cursor-pointer">
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  <div className="flex items-center space-x-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
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
      </div>

      <main
        className={`transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-0'} max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8`}
      >
        <Routes>
          <Route
            path="/personal-dashboards"
            element={
              <PersonalDashboards
                categories={categories}
                allLabels={allLabels}
                selectedUserId={selectedUserId}
                dateRange={dateRange}
              />
            }
          />
          <Route
            path="/net-worth"
            element={<NetWorth selectedUserId={selectedUserId} users={users} />}
          />
          <Route
            path="/settings"
            element={
              <Settings
                asPage
                categories={categories}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
                onUpdateCategory={handleUpdateCategoryName}
                expenses={expenses}
                sources={sources}
                users={users}
                onUpdateUser={handleUpdateUser}
                onRefreshData={async () => {
                  const [
                    loadedExpenses,
                    loadedSources,
                    loadedCategories,
                    loadedUsers,
                    loadedLabels,
                  ] = await Promise.all([
                    ApiClient.loadExpenses(),
                    ApiClient.loadSources(),
                    ApiClient.loadCategories(),
                    ApiClient.loadUsers(),
                    ApiClient.loadLabels(),
                  ]);
                  setExpenses(loadedExpenses);
                  setSources(loadedSources);
                  setCategories(loadedCategories);
                  setUsers(loadedUsers);
                  setAllLabels(loadedLabels);
                  bumpTransactionListVersion();
                }}
                onExportCSV={handleExportCSV}
                onUpdateSource={handleUpdateSource}
              />
            }
          />
          <Route
            path="/reports"
            element={
              <Reports
                expenses={filteredExpenses}
                categories={categories}
                sources={sources}
                globalDateRange={dateRange}
              />
            }
          />
          <Route
            path="/transactions"
            element={
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Transactions List (server-side paginated) */}
                <div className="lg:col-span-3">
                  <Transactions
                    expenses={transactionList ?? []}
                    totalCount={transactionTotal}
                    isLoading={transactionListLoading}
                    onLoadMore={handleLoadMoreTransactions}
                    onDelete={handleDeleteExpense}
                    onEdit={handleEditExpense}
                    onUpdateCategory={handleUpdateCategory}
                    onAddLabel={handleAddLabel}
                    onRemoveLabel={handleRemoveLabel}
                    onViewDetails={handleViewTransactionDetails}
                    categories={categories}
                    searchText={transactionFilters.searchText || ''}
                    onSearchChange={(searchText) =>
                      setTransactionFilters((prev) => ({
                        ...prev,
                        searchText: searchText || undefined,
                      }))
                    }
                    selectedUserId={selectedUserId}
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
            }
          />
          <Route
            path="*"
            element={
              <Dashboard
                expenses={dashboardExpenses}
                categories={categories}
                selectedUserId={selectedUserId}
                users={users}
                onViewDetails={handleViewTransactionDetails}
                isLoading={dashboardStatsLoading}
                statsFromApi={dashboardStats}
              />
            }
          />
        </Routes>
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

      {/* Teller Import Modal */}
      {showTellerImport && (
        <TellerImportModal
          accounts={accounts}
          users={users}
          categories={categories}
          onClose={() => setShowTellerImport(false)}
          onImportComplete={(totalAdded) => {
            bumpTransactionListVersion();
            toast.success(
              `Imported ${totalAdded} transaction${totalAdded !== 1 ? 's' : ''} from bank`,
              {
                position: 'bottom-right',
                autoClose: 3000,
              }
            );
          }}
        />
      )}

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
        onMarkAsTransferRefund={handleMarkAsTransferRefund}
        allTransactions={expenses}
        selectedUserId={selectedUserId}
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <AppContent />
          <ToastContainer />
        </div>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
