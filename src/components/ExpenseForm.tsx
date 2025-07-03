import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ExpenseFormData } from '../types';

interface ExpenseFormProps {
  onSubmit: (data: ExpenseFormData) => void;
  onCancel: () => void;
  isOpen: boolean;
}

const categories = [
  'Food & Drink',
  'Shopping',
  'Travel',
  'Health & Wellness',
  'Groceries',
  'Bills & Utilities',
  'Entertainment',
  'Personal',
  'Professional Services',
  'Uncategorized'
];

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ onSubmit, onCancel, isOpen }) => {
  const [formData, setFormData] = useState<ExpenseFormData>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    category: 'Uncategorized',
    amount: '',
    type: 'expense',
    memo: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount) return;
    
    onSubmit(formData);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      category: 'Uncategorized',
      amount: '',
      type: 'expense',
      memo: '',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-slide-up border border-white/20 dark:border-slate-700/50">
        <div className="flex items-center justify-between p-8 border-b border-white/20 dark:border-slate-700/50">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Add New Transaction</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
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
              Memo (Optional)
            </label>
            <textarea
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              className="input resize-none"
              rows={3}
              placeholder="Add a note..."
            />
          </div>

          <div className="flex space-x-4 pt-6">
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
              <span>Add Transaction</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}; 