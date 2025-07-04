import React, { useState } from 'react';
import { X, Plus, Edit, Trash2, Settings as SettingsIcon, Download } from 'lucide-react';
import { useTestMode } from '../../contexts/TestModeContext';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => void;
  onUpdateCategory: (oldCategory: string, newCategory: string) => void;
  expenses: any[];
  sources: any[];
  onRefreshData: () => void;
  onExportCSV: () => void;
  onUpdateSource: (source: any) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  isOpen,
  onClose,
  categories,
  onAddCategory,
  onDeleteCategory,
  onUpdateCategory,
  expenses,
  sources,
  onRefreshData,
  onExportCSV,
  onUpdateSource
}) => {
  const { isTestMode, toggleTestMode } = useTestMode();
  const [newCategory, setNewCategory] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [activeSection, setActiveSection] = useState<'categories' | 'general' | 'sources'>('general');
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showSelectDelete, setShowSelectDelete] = useState(false);
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [showDisableTestModeConfirm, setShowDisableTestModeConfirm] = useState(false);
  const [deleteTransactions, setDeleteTransactions] = useState(false);
  const [deleteSources, setDeleteSources] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [editSourceName, setEditSourceName] = useState('');

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

  const handleStartEditSource = (source: any) => {
    setEditingSource(source.id);
    setEditSourceName(source.name);
  };

  const handleSaveEditSource = () => {
    if (editingSource && editSourceName.trim() && editSourceName.trim() !== sources.find(s => s.id === editingSource)?.name) {
      const sourceToUpdate = sources.find(s => s.id === editingSource);
      if (sourceToUpdate) {
        const updatedSource = { ...sourceToUpdate, name: editSourceName.trim() };
        onUpdateSource(updatedSource);
      }
    }
    setEditingSource(null);
    setEditSourceName('');
  };

  const handleCancelEditSource = () => {
    setEditingSource(null);
    setEditSourceName('');
  };

  const handleDeleteCategory = (category: string) => {
    if (window.confirm(`Are you sure you want to delete the category "${category}"? This will set all expenses in this category to "Uncategorized".`)) {
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
    await fetch('http://localhost:3001/api/delete-all', { method: 'DELETE' });
    setIsDeleting(false);
    setShowDeleteAllConfirm(false);
    onRefreshData();
    setShowDeleteSuccess(true);
  };

  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    await fetch('http://localhost:3001/api/delete-selected', {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden animate-slide-up border border-white/20 dark:border-slate-700/50 flex">
        {/* Sidebar */}
        <div className="w-48 bg-gray-50 dark:bg-gray-900/80 border-r border-white/20 dark:border-slate-700/50 flex flex-col py-6">
          <button
            className={`w-full text-left px-6 py-2 mb-2 rounded-lg font-medium text-sm transition-colors ${activeSection === 'general' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            onClick={() => setActiveSection('general')}
          >
            General
          </button>
          <button
            className={`w-full text-left px-6 py-2 mb-2 rounded-lg font-medium text-sm transition-colors ${activeSection === 'categories' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            onClick={() => setActiveSection('categories')}
          >
            Categories
          </button>
          <button
            className={`w-full text-left px-6 py-2 mb-2 rounded-lg font-medium text-sm transition-colors ${activeSection === 'sources' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            onClick={() => setActiveSection('sources')}
          >
            Sources
          </button>
        </div>
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/20 dark:border-slate-700/50">
            <div className="flex items-center space-x-3">
              <SettingsIcon size={20} className="text-blue-600 dark:text-blue-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] flex-1">
            {activeSection === 'categories' && (
              <>
                {/* Categories Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Categories</h3>
                  {/* Add New Category */}
                  <div className="mb-4">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter new category name"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                      <button
                        onClick={handleAddCategory}
                        disabled={!newCategory.trim() || categories.includes(newCategory.trim())}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-1 text-sm"
                      >
                        <Plus size={14} />
                        <span>Add</span>
                      </button>
                    </div>
                    {newCategory.trim() && categories.includes(newCategory.trim()) && (
                      <p className="text-red-500 text-xs mt-1">Category already exists</p>
                    )}
                  </div>
                  {/* Categories List */}
                  <div className="space-y-1">
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
                              className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <button
                              onClick={handleSaveEdit}
                              className="p-1 text-green-600 hover:text-green-700 transition-colors"
                              title="Save"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
                            <span className="font-medium text-gray-900 dark:text-white text-sm">{category}</span>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleStartEdit(category)}
                                className="p-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                title="Edit category"
                              >
                                <Edit size={12} />
                              </button>
                              {category !== 'Uncategorized' && (
                                <button
                                  onClick={() => handleDeleteCategory(category)}
                                  className="p-1 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
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
              </>
            )}
            {activeSection === 'sources' && (
              <>
                {/* Sources Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Sources</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Manage your CSV import sources. You can edit the name of each source.
                  </p>
                  {/* Sources List */}
                  <div className="space-y-1">
                    {sources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                      >
                        {editingSource === source.id ? (
                          <div className="flex items-center space-x-1 flex-1">
                            <input
                              type="text"
                              value={editSourceName}
                              onChange={(e) => setEditSourceName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveEditSource();
                                } else if (e.key === 'Escape') {
                                  handleCancelEditSource();
                                }
                              }}
                              onBlur={handleSaveEditSource}
                              autoFocus
                              className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <button
                              onClick={handleSaveEditSource}
                              className="p-1 text-green-600 hover:text-green-700 transition-colors"
                              title="Save"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={handleCancelEditSource}
                              className="p-1 text-gray-600 hover:text-gray-700 transition-colors"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex-1">
                              <span className="font-medium text-gray-900 dark:text-white text-sm">{source.name}</span>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Created: {new Date(source.createdAt).toLocaleDateString()}
                                {source.lastUsed && (
                                  <span className="ml-2">
                                    • Last used: {new Date(source.lastUsed).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleStartEditSource(source)}
                                className="p-1 text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                title="Edit source name"
                              >
                                <Edit size={12} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {sources.length === 0 && (
                    <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                      <p className="text-sm">No sources yet. Sources are created when you import CSV files.</p>
                    </div>
                  )}
                </div>
              </>
            )}
            {activeSection === 'general' && (
              <>
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Test Mode</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">Enable Test Mode</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Enable test mode for local development.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (isTestMode) {
                            setShowDisableTestModeConfirm(true);
                          } else {
                            toggleTestMode();
                          }
                        }}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                          isTestMode
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {isTestMode ? 'Disable Test Mode' : 'Enable Test Mode'}
                      </button>
                    </div>
                    {isTestMode && (
                      <div className="p-3 bg-orange-100 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
                        <p className="text-sm text-orange-800 dark:text-orange-200">
                          <strong>Test Mode Active:</strong> The app is currently using the test database. 
                          All data will be stored in .test_artifacts instead of .artifacts.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Export Data</h3>
                  <div className="space-y-4">
                    <button
                      onClick={onExportCSV}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
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
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Delete Data</h3>
                  <div className="space-y-4">
                    <button
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                      onClick={() => setShowDeleteAllConfirm(true)}
                    >
                      Delete All Data
                    </button>
                    <button
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium ml-4"
                      onClick={() => setShowSelectDelete(true)}
                    >
                      Select data to delete
                    </button>
                  </div>
                </div>
                {/* Delete All Confirmation Dialog */}
                {showDeleteAllConfirm && (
                  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Delete All Data?</h3>
                      <p className="mb-6 text-gray-700 dark:text-gray-300">Are you sure you want to delete <b>all</b> transactions and sources? This action cannot be undone.</p>
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
                  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
                    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg ${deleteTransactions ? 'max-h-[95vh]' : 'max-h-[80vh]'} overflow-y-auto`}>
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Select Data to Delete</h3>
                      <div className="mb-4 space-y-2">
                                <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={deleteTransactions}
            onChange={e => setDeleteTransactions(e.target.checked)}
          />
          <span>Transactions</span>
        </label>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={deleteSources}
                            onChange={e => setDeleteSources(e.target.checked)}
                          />
                          <span>Sources</span>
                        </label>
                        {deleteSources && (
                          <div className="ml-6 my-2 max-h-40 overflow-y-auto border rounded p-2 bg-gray-50 dark:bg-gray-900">
                            {sources.length === 0 && <div className="text-gray-500 text-sm">No sources available.</div>}
                            {sources.map(source => (
                              <label key={source.id} className="flex items-center space-x-2 mb-1">
                                <input
                                  type="checkbox"
                                  checked={selectedSourceIds.includes(source.id)}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setSelectedSourceIds(ids => [...ids, source.id]);
                                    } else {
                                      setSelectedSourceIds(ids => ids.filter(id => id !== source.id));
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
                          disabled={isDeleting || (!deleteTransactions && !deleteSources) || (deleteSources && selectedSourceIds.length === 0 && !deleteTransactions)}
                        >
                          Delete Selected
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Delete Selected Confirmation Dialog */}
                {showDeleteSelectedConfirm && (
                  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Delete Selected Data?</h3>
                      <p className="mb-6 text-gray-700 dark:text-gray-300">
                        Are you sure you want to delete the selected data?
                        {deleteTransactions && <><br /><b>• All transactions</b></>}
                        {deleteSources && selectedSourceIds.length > 0 && (
                          <>
                            <br /><b>• Selected sources: {selectedSourceIds.length}</b>
                          </>
                        )}
                        <br />This action cannot be undone.
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
                  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Data Deleted Successfully</h3>
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
                {/* Disable Test Mode Confirmation Dialog */}
                {showDisableTestModeConfirm && (
                  <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Disable Test Mode?</h3>
                      <p className="mb-6 text-gray-700 dark:text-gray-300">
                        Are you sure you want to disable test mode? This will switch back to the main database (.artifacts) and remove the test mode visual indicators.
                      </p>
                      <div className="flex justify-end space-x-3">
                        <button
                          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                          onClick={() => setShowDisableTestModeConfirm(false)}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                          onClick={() => {
                            toggleTestMode();
                            setShowDisableTestModeConfirm(false);
                          }}
                        >
                          Disable Test Mode
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 