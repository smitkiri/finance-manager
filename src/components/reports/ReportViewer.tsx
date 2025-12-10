import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, Download, FileText, Calendar, DollarSign, Tag } from 'lucide-react';
import { Report, Expense, ReportData } from '../../types';
import { applyReportFilters, generateReportData } from '../../utils/reportUtils';
import { TransactionList } from '../transactions/TransactionList';
import { CategoryTable } from '../charts/CategoryTable';
import { Chart } from '../charts/Chart';
import { formatCurrency, formatDate } from '../../utils';

interface ReportViewerProps {
  report: Report;
  expenses: Expense[];
  onBack: () => void;
  onDelete: () => void;
}

export const ReportViewer: React.FC<ReportViewerProps> = ({
  report,
  expenses,
  onBack,
  onDelete
}) => {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Always generate report data dynamically from current expenses and filters
    const generateData = () => {
      try {
        // Handle cases where filters might be undefined (for backward compatibility)
        const filters = report.filters || {};
        const filteredExpenses = applyReportFilters(expenses, filters);
        const data = generateReportData(report, filteredExpenses);
        setReportData(data);
      } catch (error) {
        console.error('Error generating report data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    generateData();
  }, [report, expenses]);

  const handleExportReport = () => {
    if (!reportData) return;

    const csvContent = [
      ['Date', 'Description', 'Category', 'Amount', 'Type', 'Labels'].join(','),
      ...reportData.transactions.map(expense => [
        expense.date,
        `"${expense.description}"`,
        `"${expense.category}"`,
        expense.amount.toString(),
        expense.type,
        `"${(expense.labels || []).join('; ')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getFilterSummary = () => {
    const filters = report.filters;
    const summary: string[] = [];

    if (filters.dateRange) {
      summary.push('Date range');
    }
    if (filters.categories && filters.categories.length > 0) {
      summary.push(`${filters.categories.length} categories`);
    }
    if (filters.labels && filters.labels.length > 0) {
      summary.push(`${filters.labels.length} labels`);
    }
    if (filters.types && filters.types.length > 0) {
      summary.push(`${filters.types.length} types`);
    }
    if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
      summary.push('Amount range');
    }

    return summary.length > 0 ? summary.join(', ') : 'No filters';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading report...</div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">Error loading report data</div>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{report.name}</h1>
            {report.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">{report.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportReport}
            className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onDelete}
            className="flex items-center space-x-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Report Summary */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <FileText size={20} className="text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Transactions</span>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {reportData.transactions.length}
            </div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <DollarSign size={20} className="text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Income</span>
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(reportData.totalIncome)}
            </div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <DollarSign size={20} className="text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Expenses</span>
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(reportData.totalExpenses)}
            </div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <DollarSign size={20} className="text-gray-600 dark:text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Net Amount</span>
            </div>
            <div className={`text-2xl font-bold ${reportData.netAmount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(reportData.netAmount)}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <Calendar size={14} />
                <span>Created: {formatDate(report.createdAt)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Tag size={14} />
                <span>Filters: {getFilterSummary()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      {reportData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Chart
            data={reportData.monthlyData}
            type="line"
            title="Monthly Overview"
          />
        </div>
      )}

      {/* Category Breakdown */}
      {Object.keys(reportData.categoryBreakdown).length > 0 && (
        <CategoryTable
          categoryBreakdown={reportData.categoryBreakdown}
          totalExpenses={reportData.totalExpenses}
        />
      )}

      {/* Transactions List */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
        <div className="p-6 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Transactions ({reportData.transactions.length})
          </h3>
        </div>
        <TransactionList
          expenses={reportData.transactions}
          onEdit={() => {}} // No editing in report view
          onDelete={() => {}} // No deleting in report view
          onUpdateCategory={() => {}} // No category updates in report view
          onAddLabel={() => {}} // No label updates in report view
          onRemoveLabel={() => {}} // No label updates in report view
          onViewDetails={() => {}} // No details view in report view
          categories={[]} // Not needed for read-only view
        />
      </div>
    </div>
  );
}; 
