import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Edit, ChevronDown, Plus } from 'lucide-react';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils';
import { LabelSelector } from '../ui/LabelSelector';
import { LabelBadge } from '../ui/LabelBadge';

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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [labelSelectorState, setLabelSelectorState] = useState<{
    isOpen: boolean;
    expenseId: string | null;
    position: { x: number; y: number };
  }>({
    isOpen: false,
    expenseId: null,
    position: { x: 0, y: 0 }
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ITEMS_PER_PAGE = 30;
  
  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setEditingCategoryId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingCategoryId]);

  // Handle escape key to close dropdown
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditingCategoryId(null);
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [editingCategoryId]);
  
  const visibleExpenses = expenses.slice(0, visibleCount);
  const hasMore = visibleCount < expenses.length;
  
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

  const handleCategoryClick = (expenseId: string) => {
    setEditingCategoryId(expenseId);
  };

  const handleCategoryChange = (expenseId: string, newCategory: string) => {
    onUpdateCategory(expenseId, newCategory);
    setEditingCategoryId(null);
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

  const handleRemoveLabel = (expenseId: string, label: string) => {
    onRemoveLabel(expenseId, label);
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
            expense.transferInfo?.isTransfer && expense.transferInfo.excludedFromCalculations
              ? 'bg-gray-100 dark:bg-slate-600 border-gray-300 dark:border-slate-600 opacity-50'
              : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:shadow-sm'
          }`}
          onClick={() => onViewDetails(expense)}
        >
                      <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">{expense.description}</h3>
                    <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      <span>{formatDate(expense.date)}</span>
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-medium text-gray-600 dark:text-gray-300">
                        {expense.metadata?.sourceName || 'Manual Entry'}
                      </span>
                      {expense.transferInfo?.isTransfer && (
                        <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded text-xs font-medium text-orange-700 dark:text-orange-300">
                          Transfer
                        </span>
                      )}
                      <div className="relative group" ref={editingCategoryId === expense.id ? dropdownRef : null}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCategoryClick(expense.id);
                          }}
                          className="px-2 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-md text-xs font-medium text-blue-700 dark:text-blue-300 hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-800/30 dark:hover:to-indigo-800/30 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md flex items-center space-x-1"
                          title="Click to change category"
                        >
                          <span>{expense.category || 'Uncategorized'}</span>
                          <ChevronDown size={10} className="text-blue-500 dark:text-blue-400" />
                        </button>
                        
                        {editingCategoryId === expense.id && (
                          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 py-1 min-w-48 max-h-48 overflow-y-auto animate-in slide-in-from-top-1 duration-200">
                            {categories.map((category) => (
                              <button
                                key={category}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCategoryChange(expense.id, category);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ${
                                  (expense.category || 'Uncategorized') === category
                                    ? 'bg-blue-100 dark:bg-blue-800/30 text-blue-700 dark:text-blue-300 font-medium'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {category}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Labels */}
                      {(expense.labels && expense.labels.length > 0) && (
                        <div className="flex flex-wrap gap-1 items-center">
                          {expense.labels.map((label) => (
                            <LabelBadge
                              key={label}
                              label={label}
                              onRemove={() => handleRemoveLabel(expense.id, label)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {expense.memo && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 italic truncate">"{expense.memo}"</p>
                    )}
                  </div>
                  
                  <div className="text-right flex-shrink-0">
                    <div
                      className={`font-semibold text-sm ${
                        expense.type === 'expense' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {expense.type === 'expense' ? '-' : '+'}
                      {formatCurrency(expense.amount)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {expense.type}
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