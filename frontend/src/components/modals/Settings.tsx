import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Edit,
  Trash2,
  Settings as SettingsIcon,
  Download,
  Save,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import type { User, Source, StandardizedColumn, Account, ImportSession } from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { BackupManager } from './BackupManager';
import { HouseholdSection } from '../settings/HouseholdSection';
import { ListRow } from '../ui/ListRow';

type SettingsSection = 'categories' | 'general' | 'sources' | 'household' | 'accounts' | 'imports';

const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'General',
  categories: 'Categories',
  sources: 'Sources',
  household: 'Household',
  accounts: 'Accounts',
  imports: 'Import History',
};

const SECTION_ORDER: SettingsSection[] = [
  'general',
  'categories',
  'sources',
  'household',
  'accounts',
  'imports',
];

interface SettingsProps {
  asPage?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  categories: string[];
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => void;
  onUpdateCategory: (oldCategory: string, newCategory: string) => void;
  expenses: any[];
  sources: Source[];
  users: User[];
  onRefreshData: () => void;
  onExportCSV: () => void;
  onUpdateSource: (source: Source) => void;
}

const STANDARDIZED_COLUMNS: StandardizedColumn[] = [
  'Transaction Date',
  'Description',
  'Category',
  'Amount',
];

export const Settings: React.FC<SettingsProps> = ({
  asPage = false,
  isOpen = true,
  onClose,
  categories,
  onAddCategory,
  onDeleteCategory,
  onUpdateCategory,
  expenses,
  sources,
  users,
  onRefreshData,
  onExportCSV,
  onUpdateSource,
}) => {
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [activeSection, setActiveSection] = useState<SettingsSection | null>('general');
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showSelectDelete, setShowSelectDelete] = useState(false);
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [deleteTransactions, setDeleteTransactions] = useState(false);
  const [deleteSources, setDeleteSources] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [editSourceName, setEditSourceName] = useState('');
  const [editSourceMappings, setEditSourceMappings] = useState<
    { csvColumn: string; standardColumn: StandardizedColumn | 'Ignore' }[]
  >([]);
  const [editSourceFlipIncomeExpense, setEditSourceFlipIncomeExpense] = useState(false);

  // Accounts state (self-managed)
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<'asset' | 'liability'>('asset');
  const [newAccountUserId, setNewAccountUserId] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editAccountName, setEditAccountName] = useState('');
  const [editAccountType, setEditAccountType] = useState<'asset' | 'liability'>('asset');

  // Import sessions state
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [importSessionsLoading, setImportSessionsLoading] = useState(false);
  const [undoingSessionId, setUndoingSessionId] = useState<string | null>(null);
  const [confirmUndoSessionId, setConfirmUndoSessionId] = useState<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();

  // Read ?section= from URL to auto-navigate to that section
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get('section');
    if (section === 'accounts') setActiveSection('accounts');
  }, [location.search]);

  // Load import sessions when imports section becomes active
  useEffect(() => {
    if (activeSection !== 'imports') return;
    setImportSessionsLoading(true);
    ApiClient.loadImportSessions().then((data) => {
      setImportSessions(data);
      setImportSessionsLoading(false);
    });
  }, [activeSection]);

  // Load accounts when accounts section becomes active
  useEffect(() => {
    if (activeSection !== 'accounts') return;
    setAccountsLoading(true);
    ApiClient.loadAccounts().then((data) => {
      setAccounts(data);
      setAccountsLoading(false);
    });
  }, [activeSection]);

  // Set default userId for new account when users load
  useEffect(() => {
    if (users.length > 0 && !newAccountUserId) {
      setNewAccountUserId(users[0].id);
    }
  }, [users, newAccountUserId]);

  const handleUndoImportSession = async (sessionId: string) => {
    setUndoingSessionId(sessionId);
    try {
      const result = await ApiClient.undoImportSession(sessionId);
      setImportSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setConfirmUndoSessionId(null);
      toast.success(`Removed ${result.removed} transactions`, {
        position: 'bottom-right',
        autoClose: 3000,
      });
      onRefreshData();
    } catch {
      toast.error('Failed to undo import', { position: 'bottom-right', autoClose: 3000 });
    } finally {
      setUndoingSessionId(null);
    }
  };

  const handleAddAccount = async () => {
    if (!newAccountName.trim() || !newAccountUserId) return;
    const account: Account = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      userId: newAccountUserId,
      name: newAccountName.trim(),
      type: newAccountType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const created = await ApiClient.createAccount(account);
    setAccounts((prev) => [...prev, created]);
    setNewAccountName('');
  };

  const handleStartEditAccount = (account: Account) => {
    setEditingAccountId(account.id);
    setEditAccountName(account.name);
    setEditAccountType(account.type);
  };

  const handleSaveEditAccount = async () => {
    if (!editingAccountId || !editAccountName.trim()) return;
    const original = accounts.find((a) => a.id === editingAccountId);
    if (!original) return;
    const updated = await ApiClient.updateAccount({
      ...original,
      name: editAccountName.trim(),
      type: editAccountType,
    });
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditingAccountId(null);
    setEditAccountName('');
  };

  const handleCancelEditAccount = () => {
    setEditingAccountId(null);
    setEditAccountName('');
  };

  const handleDeleteAccount = async (account: Account) => {
    if (!window.confirm(`Delete "${account.name}" and all its balance history?`)) return;
    await ApiClient.deleteAccount(account.id);
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
  };

  const handleAddCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      onAddCategory(newCategory.trim());
      setNewCategory('');
    }
  };

  const handleStartEdit = (category: string) => {
    setEditingCategory(category);
    setEditValue(category);
  };

  const handleSaveEdit = () => {
    if (editingCategory && editValue.trim() && editValue.trim() !== editingCategory) {
      onUpdateCategory(editingCategory, editValue.trim());
    }
    setEditingCategory(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setEditValue('');
  };

  const handleStartEditSource = (source: Source) => {
    setEditingSource(source.id);
    setEditSourceName(source.name);
    setEditSourceMappings([...source.mappings]);
    setEditSourceFlipIncomeExpense(source.flipIncomeExpense || false);
  };

  const handleSaveEditSource = () => {
    if (editingSource && editSourceName.trim()) {
      const sourceToUpdate = sources.find((s) => s.id === editingSource);
      if (sourceToUpdate) {
        const updatedSource: Source = {
          ...sourceToUpdate,
          name: editSourceName.trim(),
          mappings: editSourceMappings,
          flipIncomeExpense: editSourceFlipIncomeExpense,
        };
        onUpdateSource(updatedSource);
      }
    }
    setEditingSource(null);
    setEditSourceName('');
    setEditSourceMappings([]);
    setEditSourceFlipIncomeExpense(false);
  };

  const handleCancelEditSource = () => {
    setEditingSource(null);
    setEditSourceName('');
    setEditSourceMappings([]);
    setEditSourceFlipIncomeExpense(false);
  };

  const handleSourceMappingChange = (
    csvColumn: string,
    standardColumn: StandardizedColumn | 'Ignore'
  ) => {
    setEditSourceMappings((prev) =>
      prev.map((mapping) =>
        mapping.csvColumn === csvColumn ? { ...mapping, standardColumn } : mapping
      )
    );
  };

  const getAvailableStandardColumns = (currentMapping: {
    csvColumn: string;
    standardColumn: StandardizedColumn | 'Ignore';
  }) => {
    const usedColumns = editSourceMappings
      .filter((m) => m.csvColumn !== currentMapping.csvColumn && m.standardColumn !== 'Ignore')
      .map((m) => m.standardColumn);

    return STANDARDIZED_COLUMNS.filter((col) => !usedColumns.includes(col));
  };

  const handleDeleteCategory = (category: string) => {
    if (
      window.confirm(
        `Are you sure you want to delete the category "${category}"? This will set all expenses in this category to "Uncategorized".`
      )
    ) {
      onDeleteCategory(category);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddCategory();
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    await ApiClient.apiFetch(`${ApiClient.getApiBase()}/delete-all`, { method: 'DELETE' });
    setIsDeleting(false);
    setShowDeleteAllConfirm(false);
    onRefreshData();
    setShowDeleteSuccess(true);
  };

  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    await ApiClient.apiFetch(`${ApiClient.getApiBase()}/delete-selected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deleteTransactions,
        deleteSources,
        sourceIds: deleteSources ? selectedSourceIds : [],
      }),
    });
    setIsDeleting(false);
    setShowSelectDelete(false);
    setShowDeleteSelectedConfirm(false);
    setDeleteTransactions(false);
    setDeleteSources(false);
    setSelectedSourceIds([]);
    onRefreshData();
    setShowDeleteSuccess(true);
  };

  if (!asPage && !isOpen) return null;

  const toggleMobileSection = (section: SettingsSection) =>
    setActiveSection((prev) => (prev === section ? null : section));

  const renderAccordionHeader = (section: SettingsSection) => (
    <button
      type="button"
      onClick={() => toggleMobileSection(section)}
      className="md:hidden w-full flex items-center justify-between px-4 py-4 min-h-[56px] text-left border-b border-gray-200 dark:border-gray-800"
      aria-expanded={activeSection === section}
    >
      <span className="font-semibold text-gray-900 dark:text-white">{SECTION_LABELS[section]}</span>
      <ChevronDown
        className={`transition-transform text-gray-500 dark:text-gray-400 ${activeSection === section ? 'rotate-180' : ''}`}
        size={20}
      />
    </button>
  );

  const settingsContent = (
    <div
      className={
        asPage
          ? 'bg-white dark:bg-gray-900 rounded-lg shadow-xs max-w-3xl w-full min-h-[60vh] border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row'
          : 'bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden animate-slide-up border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row'
      }
    >
      {/* Sidebar — desktop only */}
      <div className="hidden md:flex w-48 bg-gray-50 dark:bg-gray-900/50 border-r border-gray-200 dark:border-gray-800 flex-col py-6">
        {SECTION_ORDER.map((section) => (
          <button
            key={section}
            className={`w-full text-left px-6 py-2 mb-2 rounded-lg font-medium text-sm transition-colors ${activeSection === section ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            onClick={() => setActiveSection(section)}
          >
            {SECTION_LABELS[section]}
          </button>
        ))}
      </div>
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center space-x-3">
            {asPage ? (
              <button
                onClick={() => navigate(-1)}
                className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-2 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Go back"
              >
                <ArrowLeft size={20} />
              </button>
            ) : null}
            <SettingsIcon size={20} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
          </div>
          {!asPage && (
            <button
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-2 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div
          className={`p-0 md:p-6 overflow-y-auto flex-1 ${asPage ? '' : 'max-h-[calc(90vh-140px)]'}`}
        >
          <div className="border-b border-gray-200 dark:border-gray-800 md:border-b-0">
            {renderAccordionHeader('categories')}
            {activeSection === 'categories' && (
              <div className="px-4 pb-4 md:px-0 md:pb-0">
                {/* Categories Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Categories
                  </h3>
                  {/* Add New Category */}
                  <div className="mb-4">
                    <div className="flex flex-col gap-2 md:flex-row md:space-x-2 md:gap-0">
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter new category name"
                        className="flex-1 px-3 py-3 md:py-2 min-h-[48px] md:min-h-0 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                      <button
                        onClick={handleAddCategory}
                        disabled={!newCategory.trim() || categories.includes(newCategory.trim())}
                        className="px-3 py-3 md:py-2 min-h-[48px] md:min-h-0 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-1 text-sm"
                      >
                        <Plus size={14} />
                        <span>Add</span>
                      </button>
                    </div>
                    {newCategory.trim() && categories.includes(newCategory.trim()) && (
                      <p className="text-red-500 text-xs mt-1">Category already exists</p>
                    )}
                  </div>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-2">
                    {categories.map((category) => {
                      const txCount = expenses.filter(
                        (e: { category?: string }) => e.category === category
                      ).length;
                      if (editingCategory === category) {
                        return (
                          <div
                            key={category}
                            className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2"
                          >
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              onBlur={handleSaveEdit}
                              autoFocus
                              className="flex-1 px-3 py-2 min-h-[48px] border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <button
                              onClick={handleSaveEdit}
                              aria-label="Save"
                              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-sm text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                            >
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              aria-label="Cancel"
                              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        );
                      }
                      return (
                        <ListRow
                          key={category}
                          primary={<span>{category}</span>}
                          amount={null}
                          meta={
                            <span>
                              {txCount} {txCount === 1 ? 'transaction' : 'transactions'}
                            </span>
                          }
                          trailing={
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleStartEdit(category)}
                                aria-label={`Edit ${category}`}
                                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                              >
                                <Edit size={16} />
                              </button>
                              {category !== 'Uncategorized' && (
                                <button
                                  onClick={() => handleDeleteCategory(category)}
                                  aria-label={`Delete ${category}`}
                                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-sm text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          }
                        />
                      );
                    })}
                  </div>
                  {/* Desktop list */}
                  <div className="hidden md:block space-y-1">
                    {categories.map((category) => (
                      <div
                        key={category}
                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                      >
                        {editingCategory === category ? (
                          <div className="flex items-center space-x-1 flex-1">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              onBlur={handleSaveEdit}
                              autoFocus
                              className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <button
                              onClick={handleSaveEdit}
                              className="p-1 text-green-600 hover:text-green-700 transition-colors"
                              title="Save"
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-1 text-gray-600 hover:text-gray-700 transition-colors"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="font-medium text-gray-900 dark:text-white text-sm">
                              {category}
                            </span>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleStartEdit(category)}
                                className="p-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-sm transition-colors"
                                title="Edit category"
                              >
                                <Edit size={12} />
                              </button>
                              {category !== 'Uncategorized' && (
                                <button
                                  onClick={() => handleDeleteCategory(category)}
                                  className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-sm transition-colors"
                                  title="Delete category"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {categories.length === 0 && (
                    <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                      <p className="text-sm">No categories yet. Add your first category above.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="border-b border-gray-200 dark:border-gray-800 md:border-b-0">
            {renderAccordionHeader('sources')}
            {activeSection === 'sources' && (
              <div className="px-4 pb-4 md:px-0 md:pb-0">
                {/* Sources Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Sources
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Manage your CSV import sources. You can edit the name, column mappings, and
                    import options for each source.
                  </p>
                  {/* Sources List */}
                  <div className="space-y-3">
                    {sources.map((source) => (
                      <div
                        key={source.id}
                        className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
                      >
                        {editingSource === source.id ? (
                          <div className="p-4 bg-white dark:bg-gray-800">
                            {/* Source Name */}
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Source Name
                              </label>
                              <input
                                type="text"
                                value={editSourceName}
                                onChange={(e) => setEditSourceName(e.target.value)}
                                className="w-full px-3 py-3 md:py-2 min-h-[48px] md:min-h-0 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                placeholder="Enter source name"
                              />
                            </div>

                            {/* Column Mappings */}
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Column Mappings
                              </label>
                              <div className="space-y-2">
                                {editSourceMappings.map((mapping, index) => (
                                  <div
                                    key={index}
                                    className="flex flex-col gap-2 md:flex-row md:items-center md:space-x-3 md:gap-0 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium text-gray-900 dark:text-white wrap-break-word">
                                        {mapping.csvColumn}
                                      </span>
                                    </div>
                                    <ArrowRight
                                      size={16}
                                      className="text-gray-400 hidden md:block shrink-0"
                                    />
                                    <select
                                      value={mapping.standardColumn}
                                      onChange={(e) =>
                                        handleSourceMappingChange(
                                          mapping.csvColumn,
                                          e.target.value as StandardizedColumn | 'Ignore'
                                        )
                                      }
                                      className="w-full md:w-auto px-3 py-2 md:py-1 min-h-[44px] md:min-h-0 border border-gray-300 dark:border-gray-600 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-600 text-gray-900 dark:text-white text-sm"
                                    >
                                      <option value="Ignore">Ignore</option>
                                      {getAvailableStandardColumns(mapping).map((col) => (
                                        <option key={col} value={col}>
                                          {col}
                                        </option>
                                      ))}
                                      {mapping.standardColumn !== 'Ignore' &&
                                        !getAvailableStandardColumns(mapping).includes(
                                          mapping.standardColumn as StandardizedColumn
                                        ) && (
                                          <option value={mapping.standardColumn}>
                                            {mapping.standardColumn}
                                          </option>
                                        )}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Import Options */}
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Import Options
                              </label>
                              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-0 md:space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    id={`flipIncomeExpense-${source.id}`}
                                    checked={editSourceFlipIncomeExpense}
                                    onChange={(e) =>
                                      setEditSourceFlipIncomeExpense(e.target.checked)
                                    }
                                    className="w-5 h-5 md:w-4 md:h-4 text-blue-600 bg-gray-100 border-gray-300 rounded-sm focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                  />
                                  <label
                                    htmlFor={`flipIncomeExpense-${source.id}`}
                                    className="text-sm font-medium text-gray-900 dark:text-white"
                                  >
                                    Flip Income/Expense Signs
                                  </label>
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  Positive values as expenses, negative as income
                                </div>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-col gap-2 md:flex-row md:space-x-2 md:gap-0">
                              <button
                                onClick={handleSaveEditSource}
                                disabled={!editSourceName.trim()}
                                className="w-full md:w-auto flex items-center justify-center space-x-1 px-3 py-3 md:py-2 min-h-[48px] md:min-h-0 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                              >
                                <Save size={14} />
                                <span>Save Changes</span>
                              </button>
                              <button
                                onClick={handleCancelEditSource}
                                className="w-full md:w-auto px-3 py-3 md:py-2 min-h-[48px] md:min-h-0 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-gray-50 dark:bg-gray-700">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-gray-900 dark:text-white text-sm wrap-break-word">
                                  {source.name}
                                </span>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Created: {new Date(source.createdAt).toLocaleDateString()}
                                  {source.lastUsed && (
                                    <span className="ml-2">
                                      • Last used: {new Date(source.lastUsed).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Mappings:{' '}
                                  {
                                    source.mappings.filter(
                                      (m: { standardColumn: string }) =>
                                        m.standardColumn !== 'Ignore'
                                    ).length
                                  }{' '}
                                  columns
                                  {source.flipIncomeExpense && (
                                    <span className="ml-2 text-orange-600 dark:text-orange-400">
                                      • Signs flipped
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center">
                                <button
                                  onClick={() => handleStartEditSource(source)}
                                  aria-label={`Edit ${source.name}`}
                                  className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-sm transition-colors"
                                  title="Edit source"
                                >
                                  <Edit className="w-4 h-4 md:w-3 md:h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {sources.length === 0 && (
                    <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                      <p className="text-sm">
                        No sources yet. Sources are created when you import CSV files.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="border-b border-gray-200 dark:border-gray-800 md:border-b-0">
            {renderAccordionHeader('household')}
            {activeSection === 'household' && (
              <div className="px-4 pb-4 md:px-0 md:pb-0">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Household
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Rename your household, manage members, and send invites.
                  </p>
                  <HouseholdSection demoMode={false} />
                </div>
              </div>
            )}
          </div>
          <div className="border-b border-gray-200 dark:border-gray-800 md:border-b-0">
            {renderAccordionHeader('accounts')}
            {activeSection === 'accounts' && (
              <div className="px-4 pb-4 md:px-0 md:pb-0">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Accounts
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Manage your asset and liability accounts for net worth tracking.
                  </p>

                  {/* Add New Account */}
                  <div className="mb-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Add New Account
                    </h4>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddAccount();
                        }}
                        placeholder="Account name (e.g. Chase Checking, Mortgage)"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Type
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setNewAccountType('asset')}
                              className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                newAccountType === 'asset'
                                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                              }`}
                            >
                              Asset
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewAccountType('liability')}
                              className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                newAccountType === 'liability'
                                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                              }`}
                            >
                              Liability
                            </button>
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            User
                          </label>
                          <select
                            value={newAccountUserId}
                            onChange={(e) => setNewAccountUserId(e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        onClick={handleAddAccount}
                        disabled={!newAccountName.trim() || !newAccountUserId}
                        className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        <Plus size={14} />
                        <span>Add Account</span>
                      </button>
                    </div>
                  </div>

                  {/* Accounts List */}
                  {accountsLoading ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading accounts...</p>
                  ) : accounts.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      No accounts yet.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {accounts.map((account) => {
                        const userName =
                          users.find((u) => u.id === account.userId)?.name ?? account.userId;
                        const typeColor =
                          account.type === 'asset'
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400';
                        return (
                          <div
                            key={account.id}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                          >
                            {editingAccountId === account.id ? (
                              <div className="flex items-center gap-2 flex-1 flex-wrap">
                                <input
                                  type="text"
                                  value={editAccountName}
                                  onChange={(e) => setEditAccountName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEditAccount();
                                    if (e.key === 'Escape') handleCancelEditAccount();
                                  }}
                                  autoFocus
                                  className="flex-1 min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-sm"
                                />
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditAccountType('asset')}
                                    className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${
                                      editAccountType === 'asset'
                                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                        : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    Asset
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditAccountType('liability')}
                                    className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${
                                      editAccountType === 'liability'
                                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                        : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                                    }`}
                                  >
                                    Liability
                                  </button>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    onClick={handleSaveEditAccount}
                                    className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-green-600 hover:text-green-700 transition-colors"
                                    title="Save"
                                  >
                                    <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={handleCancelEditAccount}
                                    className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                                    title="Cancel"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium text-gray-900 dark:text-white text-sm">
                                    {account.name}
                                  </span>
                                  <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span className={`font-medium ${typeColor}`}>
                                      {account.type === 'asset' ? 'Asset' : 'Liability'}
                                    </span>
                                    <span className="text-gray-400 dark:text-gray-500">•</span>
                                    <span className="text-gray-500 dark:text-gray-400">
                                      {userName}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                  <button
                                    onClick={() => handleStartEditAccount(account)}
                                    className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-sm transition-colors"
                                    title="Edit account"
                                  >
                                    <Edit size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAccount(account)}
                                    className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-sm transition-colors"
                                    title="Delete account"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="border-b border-gray-200 dark:border-gray-800 md:border-b-0">
            {renderAccordionHeader('general')}
            {activeSection === 'general' && (
              <div className="px-4 pb-4 md:px-0 md:pb-0">
                <BackupManager />
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Export Data
                  </h3>
                  <div className="space-y-4">
                    <button
                      onClick={onExportCSV}
                      className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-3 sm:py-2 min-h-[48px] sm:min-h-0 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      <Download size={16} />
                      <span>Export CSV</span>
                    </button>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Export all your transactions to a CSV file for backup or analysis.
                    </p>
                  </div>
                </div>
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Delete Data
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <button
                      className="w-full sm:w-auto px-4 py-3 sm:py-2 min-h-[48px] sm:min-h-0 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                      onClick={() => setShowDeleteAllConfirm(true)}
                    >
                      Delete All Data
                    </button>
                    <button
                      className="w-full sm:w-auto px-4 py-3 sm:py-2 min-h-[48px] sm:min-h-0 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium"
                      onClick={() => setShowSelectDelete(true)}
                    >
                      Select data to delete
                    </button>
                  </div>
                </div>
                {/* Delete All Confirmation Dialog */}
                {showDeleteAllConfirm && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-w-sm w-full">
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                        Delete All Data?
                      </h3>
                      <p className="mb-6 text-gray-700 dark:text-gray-300">
                        Are you sure you want to delete <b>all</b> transactions and sources? This
                        action cannot be undone.
                      </p>
                      <div className="flex justify-end space-x-3">
                        <button
                          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => setShowDeleteAllConfirm(false)}
                          disabled={isDeleting}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                          onClick={handleDeleteAll}
                          disabled={isDeleting}
                        >
                          {isDeleting ? 'Deleting...' : 'Delete All'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Select Data to Delete Dialog */}
                {showSelectDelete && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div
                      className={`bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 w-full max-w-lg ${deleteTransactions ? 'max-h-[95vh]' : 'max-h-[80vh]'} overflow-y-auto`}
                    >
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                        Select Data to Delete
                      </h3>
                      <div className="mb-4 space-y-2">
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={deleteTransactions}
                            onChange={(e) => setDeleteTransactions(e.target.checked)}
                          />
                          <span>Transactions</span>
                        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={deleteSources}
                            onChange={(e) => setDeleteSources(e.target.checked)}
                          />
                          <span>Sources</span>
                        </label>
                        {deleteSources && (
                          <div className="ml-6 my-2 max-h-40 overflow-y-auto border rounded-sm p-2 bg-gray-50 dark:bg-gray-900">
                            {sources.length === 0 && (
                              <div className="text-gray-500 text-sm">No sources available.</div>
                            )}
                            {sources.map((source) => (
                              <label key={source.id} className="flex items-center space-x-2 mb-1">
                                <input
                                  type="checkbox"
                                  checked={selectedSourceIds.includes(source.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedSourceIds((ids) => [...ids, source.id]);
                                    } else {
                                      setSelectedSourceIds((ids) =>
                                        ids.filter((id) => id !== source.id)
                                      );
                                    }
                                  }}
                                />
                                <span>{source.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end space-x-3 mt-6">
                        <button
                          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => setShowSelectDelete(false)}
                          disabled={isDeleting}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                          onClick={() => setShowDeleteSelectedConfirm(true)}
                          disabled={
                            isDeleting ||
                            (!deleteTransactions && !deleteSources) ||
                            (deleteSources && selectedSourceIds.length === 0 && !deleteTransactions)
                          }
                        >
                          Delete Selected
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Delete Selected Confirmation Dialog */}
                {showDeleteSelectedConfirm && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-w-sm w-full">
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                        Delete Selected Data?
                      </h3>
                      <p className="mb-6 text-gray-700 dark:text-gray-300">
                        Are you sure you want to delete the selected data?
                        {deleteTransactions && (
                          <>
                            <br />
                            <b>• All transactions</b>
                          </>
                        )}
                        {deleteSources && selectedSourceIds.length > 0 && (
                          <>
                            <br />
                            <b>• Selected sources: {selectedSourceIds.length}</b>
                          </>
                        )}
                        <br />
                        This action cannot be undone.
                      </p>
                      <div className="flex justify-end space-x-3">
                        <button
                          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => setShowDeleteSelectedConfirm(false)}
                          disabled={isDeleting}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                          onClick={handleDeleteSelected}
                          disabled={isDeleting}
                        >
                          {isDeleting ? 'Deleting...' : 'Delete Selected'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Delete Success Dialog */}
                {showDeleteSuccess && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-w-sm w-full">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                          <svg
                            className="w-5 h-5 text-green-600 dark:text-green-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Data Deleted Successfully
                        </h3>
                      </div>
                      <p className="mb-6 text-gray-700 dark:text-gray-300">
                        The selected data has been successfully deleted from your database.
                      </p>
                      <div className="flex justify-end">
                        <button
                          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                          onClick={() => setShowDeleteSuccess(false)}
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Import History Section */}
          <div className="border-b border-gray-200 dark:border-gray-800 md:border-b-0">
            {renderAccordionHeader('imports')}
            {activeSection === 'imports' && (
              <div className="px-4 pb-4 md:px-0 md:pb-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Import History
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  View and undo past CSV imports. Sessions older than 6 months are automatically
                  removed.
                </p>
                {importSessionsLoading ? (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    Loading...
                  </div>
                ) : importSessions.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                    No import history found.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {importSessions.map((session) => (
                      <div
                        key={session.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {session.sourceName}
                            </p>
                            {session.fileName && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {session.fileName}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {new Date(session.createdAt).toLocaleString()} &middot;{' '}
                              {session.transactionCount} transaction
                              {session.transactionCount !== 1 ? 's' : ''} added
                            </p>
                          </div>
                          <div className="shrink-0">
                            {confirmUndoSessionId === session.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                  Confirm?
                                </span>
                                <button
                                  onClick={() => handleUndoImportSession(session.id)}
                                  disabled={undoingSessionId === session.id}
                                  className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-sm hover:bg-red-700 transition-colors disabled:opacity-50"
                                >
                                  {undoingSessionId === session.id ? 'Undoing...' : 'Yes, Undo'}
                                </button>
                                <button
                                  onClick={() => setConfirmUndoSessionId(null)}
                                  className="px-3 py-1.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmUndoSessionId(session.id)}
                                className="px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700 rounded-sm hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                              >
                                Undo
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (asPage) {
    return settingsContent;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {settingsContent}
    </div>
  );
};
