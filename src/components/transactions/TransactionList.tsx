import React, { useState, useEffect } from 'react';
import { Trash2, Edit, ChevronDown, Plus, ChevronUp } from 'lucide-react';
import { Expense } from '../../types';
import { formatCurrency } from '../../utils';
import { LabelSelector } from '../ui/LabelSelector';

interface TransactionListProps {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onUpdateCategory: (expenseId: string, newCategory: string) => void;
  onAddLabel: (expenseId: string, label: string) => void;
  onRemoveLabel: (expenseId: string, label: string) => void;
  onViewDetails: (expense: Expense) => void;
  categories: string[];
}

export const TransactionList: React.FC<TransactionListProps> = ({ expenses, onDelete, onEdit, onUpdateCategory, onAddLabel, onRemoveLabel, onViewDetails, categories }) => {
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
  const [categoryUsage, setCategoryUsage] = useState<Map<string, number>>(new Map());
  
  const ITEMS_PER_PAGE = 30;
  
  const visibleExpenses = expenses.slice(0, visibleCount);
  const hasMore = visibleCount < expenses.length;

  // Track category usage from expenses
  useEffect(() => {
    const usage = new Map<string, number>();
    expenses.forEach(expense => {
      const category = expense.category || 'Uncategorized';
      usage.set(category, (usage.get(category) || 0) + 1);
    });
    setCategoryUsage(usage);
  }, [expenses]);

  // Sort categories by usage (most used first)
  const sortedCategories = [...categories].sort((a, b) => {
    const aUsage = categoryUsage.get(a) || 0;
    const bUsage = categoryUsage.get(b) || 0;
    return bUsage - aUsage;
  });

  const toggleDropdown = (expenseId: string) => {
    setOpenDropdowns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(expenseId)) {
        newSet.delete(expenseId);
      } else {
        newSet.add(expenseId);
      }
      return newSet;
    });
  };

  const handleCategorySelect = (expenseId: string, category: string) => {
    onUpdateCategory(expenseId, category);
    toggleDropdown(expenseId);
  };

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

  const handleShowMore = () => {
    setVisibleCount(prev => Math.min(prev + ITEMS_PER_PAGE, expenses.length));
  };

  const handleAddLabelClick = (expenseId: string, event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setLabelSelectorState({
      isOpen: true,
      expenseId,
      position: { x: rect.left + rect.width / 2, y: rect.top }
    });
  };

  const handleAddLabel = (label: string) => {
    if (labelSelectorState.expenseId) {
      onAddLabel(labelSelectorState.expenseId, label);
    }
  };

  const handleCloseLabelSelector = () => {
    setLabelSelectorState({
      isOpen: false,
      expenseId: null,
      position: { x: 0, y: 0 }
    });
  };

  // Get all unique labels from all expenses
  const allLabels = Array.from(new Set(
    expenses.flatMap(expense => expense.labels || [])
  ));

  return (
    <div className="space-y-2">
      {expenses.length > 0 && (
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Recent Transactions
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Showing {visibleExpenses.length} of {expenses.length}
          </span>
        </div>
      )}
      
      {visibleExpenses.map((expense) => (
        <div
          key={expense.id}
          className={`rounded-lg border transition-shadow duration-200 p-3 cursor-pointer ${
            (expense.excludedFromCalculations || (expense.transferInfo?.isTransfer && expense.transferInfo.excludedFromCalculations))
              ? 'bg-gray-100 dark:bg-slate-600 border-gray-300 dark:border-slate-600 opacity-50'
              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:shadow-sm'
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
                        className="text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 rounded px-2 py-1 hover:bg-blue-200 dark:hover:bg-blue-800/30 transition-colors flex items-center space-x-1"
                      >
                        <span>{expense.category || 'Uncategorized'}</span>
                        {openDropdowns.has(expense.id) ? (
                          <ChevronUp size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )}
                      </button>
                      
                      {openDropdowns.has(expense.id) && (
                        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-10 min-w-32 max-h-48 overflow-y-auto">
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
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                        Transfer
                      </span>
                    )}
                    {expense.labels && expense.labels.length > 0 && (
                      <div className="flex space-x-1">
                        {expense.labels.map((label, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
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
      ))}
      
      {hasMore && (
        <div className="flex justify-center pt-3">
          <button
            onClick={handleShowMore}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-medium rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
          >
            <span>Show More</span>
            <ChevronDown size={14} />
          </button>
        </div>
      )}
      
      {!hasMore && expenses.length > 0 && (
        <div className="text-center py-3">
          <p className="text-gray-500 dark:text-gray-400 text-xs">
            Showing all {expenses.length} transactions
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