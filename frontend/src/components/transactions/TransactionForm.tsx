import React, { useState, useEffect } from 'react';
import { TransactionFormData, Expense } from '../../types';
import { Sheet } from '../ui/Sheet';

interface TransactionFormProps {
  onSubmit: (data: TransactionFormData) => void;
  onCancel: () => void;
  isOpen: boolean;
  editingExpense?: Expense | null;
  categories: string[];
  users: { id: string; name: string }[];
}

export const TransactionForm: React.FC<TransactionFormProps> = ({
  onSubmit,
  onCancel,
  isOpen,
  editingExpense,
  categories,
  users,
}) => {
  const [formData, setFormData] = useState<TransactionFormData>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: '',
    amount: '',
    type: 'expense',
    user: '',
  });

  useEffect(() => {
    if (editingExpense) {
      setFormData({
        date: editingExpense.date,
        description: editingExpense.description,
        category: editingExpense.category,
        amount: editingExpense.amount.toString(),
        type: editingExpense.type,
        user: editingExpense.user || '',
      });
    } else {
      setFormData({
        date: new Date().toISOString().split('T')[0],
        description: '',
        category: '',
        amount: '',
        type: 'expense',
        user: '',
      });
    }
  }, [editingExpense, isOpen, users]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.description.trim() ||
      !formData.amount.trim() ||
      !formData.category.trim() ||
      !formData.user
    ) {
      return;
    }
    onSubmit(formData);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      category: '',
      amount: '',
      type: 'expense',
      user: '',
    });
  };

  const inputCls =
    'w-full px-3 py-3 min-h-[48px] text-base md:text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500';

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onCancel}
      title={editingExpense ? 'Edit Transaction' : 'Add New Transaction'}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="transaction-form"
            className="flex-1 py-3 min-h-[48px] bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            {editingExpense ? 'Update' : 'Add'} Transaction
          </button>
        </div>
      }
    >
      <form id="transaction-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Type
          </label>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'expense' })}
              className={`flex-1 py-3 min-h-[48px] px-3 rounded-lg border transition-colors ${
                formData.type === 'expense'
                  ? 'border-danger-500 bg-danger-50 text-danger-700'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, type: 'income' })}
              className={`flex-1 py-3 min-h-[48px] px-3 rounded-lg border transition-colors ${
                formData.type === 'income'
                  ? 'border-success-500 bg-success-50 text-success-700'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              Income
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date
          </label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className={inputCls}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className={inputCls}
            placeholder="Enter description"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Category
          </label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className={inputCls}
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Amount
          </label>
          <input
            type="number"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            className={inputCls}
            placeholder="0.00"
            step="0.01"
            min="0"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            User
          </label>
          <select
            value={formData.user}
            onChange={(e) => setFormData({ ...formData, user: e.target.value })}
            className={inputCls}
            required
          >
            <option value="" disabled>
              Select user
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Sheet>
  );
};
