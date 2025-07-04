import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Calendar, Tag, DollarSign, Filter } from 'lucide-react';
import { Report, ReportFilter, Expense, DateRange, Source } from '../../types';
import { createReport, applyReportFilters } from '../../utils/reportUtils';
import { DateRangePicker } from '../DateRangePicker';

interface ReportCreatorProps {
  expenses: Expense[];
  categories: string[];
  sources: Source[];
  onCreateReport: (report: Report) => void;
  onCancel: () => void;
  globalDateRange: DateRange;
}

export const ReportCreator: React.FC<ReportCreatorProps> = ({
  expenses,
  categories,
  sources,
  onCreateReport,
  onCancel,
  globalDateRange
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [filters, setFilters] = useState<ReportFilter>({});
  const [previewCount, setPreviewCount] = useState(0);
  const [previewAmount, setPreviewAmount] = useState(0);

  // Set default date range to globalDateRange on mount
  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      dateRange: prev.dateRange || globalDateRange
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDateRange]);

  // Get all unique labels from expenses
  const allLabels = Array.from(new Set(
    expenses.flatMap(expense => expense.labels || [])
  ));

  // Update preview when filters change
  useEffect(() => {
    const filteredExpenses = applyReportFilters(expenses, filters);
    setPreviewCount(filteredExpenses.length);
    setPreviewAmount(filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0));
  }, [filters, expenses]);

  const handleDateRangeChange = (dateRange: DateRange) => {
    setFilters(prev => ({ ...prev, dateRange }));
  };

  const handleCategoryChange = (category: string, checked: boolean) => {
    setFilters(prev => {
      const currentCategories = prev.categories || [];
      const newCategories = checked
        ? [...currentCategories, category]
        : currentCategories.filter(c => c !== category);
      return { ...prev, categories: newCategories.length > 0 ? newCategories : undefined };
    });
  };

  const handleLabelChange = (label: string, checked: boolean) => {
    setFilters(prev => {
      const currentLabels = prev.labels || [];
      const newLabels = checked
        ? [...currentLabels, label]
        : currentLabels.filter(l => l !== label);
      return { ...prev, labels: newLabels.length > 0 ? newLabels : undefined };
    });
  };

  const handleTypeChange = (type: 'expense' | 'income', checked: boolean) => {
    setFilters(prev => {
      const currentTypes = prev.types || [];
      const newTypes = checked
        ? [...currentTypes, type]
        : currentTypes.filter(t => t !== type);
      return { ...prev, types: newTypes.length > 0 ? newTypes : undefined };
    });
  };

  const handleSourceChange = (sourceId: string, checked: boolean) => {
    setFilters(prev => {
      const currentSources = prev.sources || [];
      const newSources = checked
        ? [...currentSources, sourceId]
        : currentSources.filter(s => s !== sourceId);
      return { ...prev, sources: newSources.length > 0 ? newSources : undefined };
    });
  };

  const handleAmountRangeChange = (field: 'minAmount' | 'maxAmount', value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value);
    setFilters(prev => ({ ...prev, [field]: numValue }));
  };

  const handleCreateReport = () => {
    if (!name.trim()) {
      alert('Please enter a report name');
      return;
    }

    const report = createReport(name.trim(), description.trim(), filters, expenses);
    onCreateReport(report);
  };

  const clearFilters = () => {
    setFilters({});
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Report</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Define filters to create a custom transaction report
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Clear Filters
          </button>
          <button
            onClick={handleCreateReport}
            disabled={!name.trim()}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={16} />
            <span>Create Report</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Report Details */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Report Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Report Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter report name"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter report description"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Calendar size={20} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Date Range</h3>
            </div>
            <DateRangePicker
              currentRange={filters.dateRange || { start: new Date(), end: new Date() }}
              onDateRangeChange={handleDateRangeChange}
            />
          </div>

          {/* Category Filter */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Tag size={20} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Categories</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {categories.map((category) => (
                <label key={category} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.categories?.includes(category) || false}
                    onChange={(e) => handleCategoryChange(category, e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{category}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Label Filter */}
          {allLabels.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Tag size={20} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Labels</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {allLabels.map((label) => (
                  <label key={label} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.labels?.includes(label) || false}
                      onChange={(e) => handleLabelChange(label, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Type Filter */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Filter size={20} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Transaction Type</h3>
            </div>
            <div className="space-y-3">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.types?.includes('expense') || false}
                  onChange={(e) => handleTypeChange('expense', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Expenses</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.types?.includes('income') || false}
                  onChange={(e) => handleTypeChange('income', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Income</span>
              </label>
            </div>
          </div>

          {/* Source Filter */}
          {sources.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Filter size={20} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sources</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {sources.map((source) => (
                  <label key={source.id} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.sources?.includes(source.id) || false}
                      onChange={(e) => handleSourceChange(source.id, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{source.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Amount Range Filter */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <DollarSign size={20} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Amount Range</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Minimum Amount
                </label>
                <input
                  type="number"
                  value={filters.minAmount || ''}
                  onChange={(e) => handleAmountRangeChange('minAmount', e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Maximum Amount
                </label>
                <input
                  type="number"
                  value={filters.maxAmount || ''}
                  onChange={(e) => handleAmountRangeChange('maxAmount', e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 sticky top-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Preview</h3>
            <div className="space-y-4">
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {previewCount}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Transactions
                </div>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  ${previewAmount.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Total Amount
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Create Report Button */}
      <div className="flex justify-end mt-8">
        <button
          onClick={handleCreateReport}
          disabled={!name.trim()}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={16} />
          <span>Create Report</span>
        </button>
      </div>
    </div>
  );
}; 