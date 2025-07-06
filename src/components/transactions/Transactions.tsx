import React from 'react';
import { TransactionList } from './TransactionList';
import { Expense } from '../../types';
import { Search } from 'lucide-react';

interface TransactionsProps {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onUpdateCategory: (expenseId: string, newCategory: string) => void;
  onAddLabel: (expenseId: string, label: string) => void;
  onRemoveLabel: (expenseId: string, label: string) => void;
  onViewDetails: (expense: Expense) => void;
  categories: string[];
  searchText?: string;
  onSearchChange?: (searchText: string) => void;
}

export const Transactions: React.FC<TransactionsProps> = ({
  expenses,
  onDelete,
  onEdit,
  onUpdateCategory,
  onAddLabel,
  onRemoveLabel,
  onViewDetails,
  categories,
  searchText = '',
  onSearchChange
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Transactions
        </h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Search Bar */}
      {onSearchChange && (
        <div className="flex items-center space-x-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* Transaction List */}
      <TransactionList
        expenses={expenses}
        onDelete={onDelete}
        onEdit={onEdit}
        onUpdateCategory={onUpdateCategory}
        onAddLabel={onAddLabel}
        onRemoveLabel={onRemoveLabel}
        onViewDetails={onViewDetails}
        categories={categories}
      />
    </div>
  );
}; 