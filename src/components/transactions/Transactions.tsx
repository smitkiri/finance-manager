import React from 'react';
import { TransactionList } from './TransactionList';
import { Expense } from '../../types';

interface TransactionsProps {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onUpdateCategory: (expenseId: string, newCategory: string) => void;
  onAddLabel: (expenseId: string, label: string) => void;
  onRemoveLabel: (expenseId: string, label: string) => void;
  categories: string[];
}

export const Transactions: React.FC<TransactionsProps> = ({
  expenses,
  onDelete,
  onEdit,
  onUpdateCategory,
  onAddLabel,
  onRemoveLabel,
  categories
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

      {/* Transaction List */}
      <TransactionList
        expenses={expenses}
        onDelete={onDelete}
        onEdit={onEdit}
        onUpdateCategory={onUpdateCategory}
        onAddLabel={onAddLabel}
        onRemoveLabel={onRemoveLabel}
        categories={categories}
      />
    </div>
  );
}; 