import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2, Edit, ChevronDown, Plus, ChevronUp } from 'lucide-react';
import { Expense } from '../../types';
import { formatCurrency } from '../../utils';
import { LabelSelector } from '../ui/LabelSelector';

interface TransactionListProps {
  expenses: Expense[];
  totalCount?: number;
  onLoadMore?: () => void;
  isLoading?: boolean;
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onUpdateCategory: (expenseId: string, newCategory: string) => void;
  onAddLabel: (expenseId: string, label: string) => void;
  onRemoveLabel: (expenseId: string, label: string) => void;
  onViewDetails: (expense: Expense) => void;
  categories: string[];
  selectedUserId?: string | null;
}

const TransactionListComponent: React.FC<TransactionListProps> = ({ expenses, totalCount, onLoadMore, isLoading = false, onDelete, onEdit, onUpdateCategory, onAddLabel, onRemoveLabel, onViewDetails, categories, selectedUserId }) => {
  const [visibleCount, setVisibleCount] = useState(30);
  const [labelSelectorState, setLabelSelectorState] = useState<{
    isOpen: boolean;
    expenseId: string | null;
    position: { x: number; y: number };
  }>({
    isOpen: false,
    expenseId: null,
    position: { x: 0, y: 0 }
  });
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());
  
  const ITEMS_PER_PAGE = 30;
  const useServerPagination = totalCount !== undefined && onLoadMore != null;
  
  const visibleExpenses = useServerPagination ? expenses : expenses.slice(0, visibleCount);
  const hasMore = useServerPagination ? (expenses.length < totalCount!) : (visibleCount < expenses.length);

  // Memoize category usage calculation
  const categoryUsage = useMemo(() => {
    const usage = new Map<string, number>();
    expenses.forEach(expense => {
      const category = expense.category || 'Uncategorized';
      usage.set(category, (usage.get(category) || 0) + 1);
    });
    return usage;
  }, [expenses]);

  // Memoize sorted categories
  const sortedCategories = useMemo(() => 
    [...categories].sort((a, b) => {
      const aUsage = categoryUsage.get(a) || 0;
      const bUsage = categoryUsage.get(b) || 0;
      return bUsage - aUsage;
    }), [categories, categoryUsage]
  );

  // Memoize all unique labels from all expenses
  const allLabels = useMemo(() => 
    Array.from(new Set(
      expenses.flatMap(expense => expense.labels || [])
    )), [expenses]
  );

  const toggleDropdown = useCallback((expenseId: string) => {
    setOpenDropdowns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(expenseId)) {
        newSet.delete(expenseId);
      } else {
        newSet.add(expenseId);
      }
      return newSet;
    });
  }, []);

  const handleCategorySelect = useCallback((expenseId: string, category: string) => {
    onUpdateCategory(expenseId, category);
    toggleDropdown(expenseId);
  }, [onUpdateCategory, toggleDropdown]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.category-dropdown')) {
        setOpenDropdowns(new Set());
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleShowMore = useCallback(() => {
    if (useServerPagination && onLoadMore) {
      onLoadMore();
    } else {
      setVisibleCount(prev => Math.min(prev + ITEMS_PER_PAGE, expenses.length));
    }
  }, [useServerPagination, onLoadMore, expenses.length]);

  const handleAddLabelClick = useCallback((expenseId: string, event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setLabelSelectorState({
      isOpen: true,
      expenseId,
      position: { x: rect.left + rect.width / 2, y: rect.top }
    });
  }, []);

  const handleAddLabel = useCallback((label: string) => {
    if (labelSelectorState.expenseId) {
      onAddLabel(labelSelectorState.expenseId, label);
    }
  }, [labelSelectorState.expenseId, onAddLabel]);

  const handleCloseLabelSelector = useCallback(() => {
    setLabelSelectorState({
      isOpen: false,
      expenseId: null,
      position: { x: 0, y: 0 }
    });
  }, []);

  // Helper function to determine if a transaction should be visually excluded
  const isTransactionExcluded = useCallback((expense: Expense) => {
    // Exclude if top-level excludedFromCalculations is true (manual exclusion)
    if (expense.excludedFromCalculations === true) return true;
    
    // For transfers, check transfer-specific exclusion logic
    if (expense.transferInfo?.isTransfer) {
      // Include if user has explicitly overridden the exclusion
      if (expense.transferInfo.userOverride !== undefined) {
        return expense.transferInfo.excludedFromCalculations;
      }
      
      // Handle different transfer types based on user selection
      if (expense.transferInfo.transferType === 'user') {
        // User transfers: exclude when "All users" is selected, include when specific user is selected
        return selectedUserId === null;
      } else if (expense.transferInfo.transferType === 'self') {
        // Transfer/Refunds: always exclude from calculations (they cancel each other out)
        return expense.transferInfo.excludedFromCalculations;
      }
      
      // Default behavior: exclude transfers from calculations
      return expense.transferInfo.excludedFromCalculations;
    }
    
    // Non-transfer transactions are included unless manually excluded
    return false;
  }, [selectedUserId]);

  if (isLoading && expenses.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse text-gray-400 dark:text-gray-500 mb-4">Loading transactions...</div>
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 dark:text-gray-500 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No transactions yet</h3>
        <p className="text-gray-500 dark:text-gray-400">Start by adding your first expense or income transaction.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {expenses.length > 0 && (
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Recent Transactions
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Showing {visibleExpenses.length} of {useServerPagination ? totalCount : expenses.length}
          </span>
        </div>
      )}
      
      {visibleExpenses.map((expense) => {
        const isUncategorized = !expense.category || expense.category === 'Uncategorized';
        const categoryClasses = isUncategorized
          ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300 border-red-200 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-800/30'
          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-800/30';

        return (
          <div
            key={expense.id}
            className={`rounded-lg border transition-shadow duration-200 p-3 cursor-pointer ${
              isTransactionExcluded(expense)
                ? 'opacity-60 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800'
                : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
            }`}
            onClick={() => onViewDetails(expense)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {expense.description}
                      </p>
                      <div
                        className={`font-semibold text-sm ${
                          expense.type === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {expense.type === 'expense' ? '-' : '+'}
                        {formatCurrency(expense.amount)}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(expense.date).toLocaleDateString()}
                      </span>
                      <div className="relative category-dropdown">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleDropdown(expense.id);
                          }}
                          className={`text-xs border rounded px-2 py-1 transition-colors flex items-center space-x-1 ${categoryClasses}`}
                        >
                          <span>{expense.category || 'Uncategorized'}</span>
                          {openDropdowns.has(expense.id) ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )}
                        </button>
                        
                        {openDropdowns.has(expense.id) && (
                          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-10 min-w-32 max-h-48 overflow-y-auto">
                            {sortedCategories.map((category) => (
                              <button
                                key={category}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCategorySelect(expense.id, category);
                                }}
                                className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${
                                  expense.category === category 
                                    ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {category}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {expense.transferInfo?.isTransfer && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium ${
                          expense.transferInfo.transferType === 'user'
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                            : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                        }`}>
                          {expense.transferInfo.transferType === 'user' ? 'User Transfer' : 'Transfer/Refund'}
                        </span>
                      )}
                      {expense.labels && expense.labels.length > 0 && (
                        <div className="flex space-x-1">
                          {expense.labels.map((label, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-1 ml-2">
                {/* Add Label Button */}
                {(expense.labels?.length || 0) < 3 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddLabelClick(expense.id, e);
                    }}
                    className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors group"
                    title="Add label"
                  >
                    <div className="relative">
                      <Plus size={14} />
                      <div className="absolute inset-0 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(expense);
                  }}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                  title="Edit transaction"
                >
                  <Edit size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(expense.id);
                  }}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="Delete transaction"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
      
      {hasMore && (
        <div className="flex justify-center pt-3">
          <button
            onClick={handleShowMore}
            className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span>Show More</span>
            <ChevronDown size={14} />
          </button>
        </div>
      )}
      
      {!hasMore && expenses.length > 0 && (
        <div className="text-center py-3">
          <p className="text-gray-500 dark:text-gray-400 text-xs">
            Showing all {useServerPagination ? totalCount : expenses.length} transactions
          </p>
        </div>
      )}
      
      {/* Label Selector */}
      <LabelSelector
        isOpen={labelSelectorState.isOpen}
        onClose={handleCloseLabelSelector}
        onAddLabel={handleAddLabel}
        existingLabels={labelSelectorState.expenseId ? (expenses.find(e => e.id === labelSelectorState.expenseId)?.labels || []) : []}
        allLabels={allLabels}
        maxLabels={3}
        position={labelSelectorState.position}
      />
    </div>
  );
};

export const TransactionList = React.memo(TransactionListComponent);