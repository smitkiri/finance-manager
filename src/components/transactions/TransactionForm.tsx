import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { TransactionFormData, Expense } from '../../types';

interface TransactionFormProps {
  onSubmit: (data: TransactionFormData) => void;
  onCancel: () => void;
  isOpen: boolean;
  editingExpense?: Expense | null;
  categories: string[];
  users: { id: string; name: string }[];
}

export const TransactionForm: React.FC<TransactionFormProps> = ({ onSubmit, onCancel, isOpen, editingExpense, categories, users }) => {
  const [formData, setFormData] = useState<TransactionFormData>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: '',
    amount: '',
    type: 'expense',
    user: ''
  });

  // Update form data when editingExpense changes
  useEffect(() => {
    if (editingExpense) {
      setFormData({
        date: editingExpense.date,
        description: editingExpense.description,
        category: editingExpense.category,
        amount: editingExpense.amount.toString(),
        type: editingExpense.type,
        user: editingExpense.user || ''
      });
    } else {
      setFormData({
        date: new Date().toISOString().split('T')[0],
        description: '',
        category: '',
        amount: '',
        type: 'expense',
        user: ''
      });
    }
  }, [editingExpense, isOpen, users]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim() || !formData.amount.trim() || !formData.category.trim() || !formData.user) {
      return;
    }
    onSubmit(formData);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      category: '',
      amount: '',
      type: 'expense',
      user: ''
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden animate-slide-up border border-white/20 dark:border-slate-700/50 flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-white/20 dark:border-slate-700/50 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {editingExpense ? 'Edit Transaction' : 'Add New Transaction'}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type
            </label>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, type: 'expense' })}
                className={`flex-1 py-2 px-3 rounded-lg border transition-colors ${
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
                className={`flex-1 py-2 px-3 rounded-lg border transition-colors ${
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
              className="input"
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
              className="input"
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
              className="input"
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
              className="input"
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
              className="input"
              required
            >
              <option value="" disabled>Select user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>

          <div className="flex space-x-4 pt-4 flex-shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1 flex items-center justify-center space-x-2"
            >
              <Plus size={16} />
              <span>Add</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}; 