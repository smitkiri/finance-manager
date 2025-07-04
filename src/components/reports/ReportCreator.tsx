import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { Report, ReportFilter, Expense, DateRange, Source } from '../../types';
import { createReport, applyReportFilters } from '../../utils/reportUtils';
import { TransactionFiltersComponent } from '../transactions/TransactionFilters';

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
        {/* Left Column: Report Details + Preview */}
        <div className="lg:col-span-1 space-y-6">
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

          {/* Preview Panel */}
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

        {/* Right Column: Filters Panel */}
        <div className="lg:col-span-2">
          <TransactionFiltersComponent
            filters={filters}
            onFiltersChange={setFilters}
            categories={categories}
            sources={sources}
            allLabels={allLabels}
            isCompact={false}
          />
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