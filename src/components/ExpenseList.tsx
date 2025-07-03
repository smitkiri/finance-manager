import React from 'react';
import { Trash2, Edit } from 'lucide-react';
import { Expense } from '../types';
import { formatCurrency, formatDate } from '../utils';

interface ExpenseListProps {
  expenses: Expense[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
}

export const ExpenseList: React.FC<ExpenseListProps> = ({ expenses, onDelete, onEdit }) => {
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
    <div className="space-y-3">
      {expenses.map((expense) => (
        <div
          key={expense.id}
          className="card hover:shadow-md transition-shadow duration-200"
        >
          <div className="flex items-center justify-between">
                            <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900 dark:text-white">{expense.description}</h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <span>{formatDate(expense.date)}</span>
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs">
                          {expense.category}
                        </span>
                      </div>
                      {expense.memo && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">"{expense.memo}"</p>
                      )}
                    </div>
                <div className="text-right">
                  <div
                    className={`font-semibold text-lg ${
                      expense.type === 'expense' ? 'text-danger-600' : 'text-success-600'
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
            
            <div className="flex items-center space-x-2 ml-4">
              <button
                onClick={() => onEdit(expense)}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
                title="Edit transaction"
              >
                <Edit size={16} />
              </button>
              <button
                onClick={() => onDelete(expense.id)}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20 rounded-lg transition-colors"
                title="Delete transaction"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}; 