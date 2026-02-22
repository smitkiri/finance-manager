import React, { useState, useEffect, useMemo } from 'react';
import { Plus, FileText, Calendar, DollarSign, Tag, Filter } from 'lucide-react';
import { Report, Expense, DateRange, Source } from '../../types';
import { LocalStorage } from '../../utils/storage';
import { ReportCreator } from './ReportCreator';
import { ReportViewer } from './ReportViewer';
import { formatCurrency, formatDate } from '../../utils';
import { applyReportFilters } from '../../utils/reportUtils';

interface ReportsProps {
  expenses: Expense[];
  categories: string[];
  sources: Source[];
  globalDateRange: DateRange;
}

export const Reports: React.FC<ReportsProps> = ({ expenses, categories, sources, globalDateRange }) => {
  const [reports, setReports] = useState<Report[]>([]);
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const loadedReports = await LocalStorage.loadReports();
      setReports(loadedReports);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateReport = async (report: Report) => {
    try {
      await LocalStorage.saveReport(report);
      await loadReports();
      setIsCreatingReport(false);
    } catch (error) {
      console.error('Error creating report:', error);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (window.confirm('Are you sure you want to delete this report?')) {
      try {
        await LocalStorage.deleteReport(reportId);
        await loadReports();
        if (selectedReport?.id === reportId) {
          setSelectedReport(null);
        }
      } catch (error) {
        console.error('Error deleting report:', error);
      }
    }
  };

  // Compute report stats dynamically for each report
  const reportStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalAmount: number }>();
    
    reports.forEach(report => {
      // Handle cases where filters might be undefined (for backward compatibility)
      const filters = report.filters || {};
      const filteredExpenses = applyReportFilters(expenses, filters);
      const totalAmount = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      stats.set(report.id, {
        count: filteredExpenses.length,
        totalAmount
      });
    });
    
    return stats;
  }, [reports, expenses]);

  const getFilterSummary = (report: Report) => {
    const filters = report.filters;
    const summary: string[] = [];

    // Handle case where filters might be undefined
    if (!filters) {
      return 'No filters';
    }

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
    if (filters.sources && filters.sources.length > 0) {
      summary.push(`${filters.sources.length} sources`);
    }
    if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
      summary.push('Amount range');
    }

    return summary.length > 0 ? summary.join(', ') : 'No filters';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading reports...</div>
      </div>
    );
  }

  if (selectedReport) {
    return (
      <ReportViewer
        report={selectedReport}
        expenses={expenses}
        onBack={() => setSelectedReport(null)}
        onDelete={() => handleDeleteReport(selectedReport.id)}
      />
    );
  }

  if (isCreatingReport) {
    return (
      <ReportCreator
        expenses={expenses}
        categories={categories}
        sources={sources}
        onCreateReport={handleCreateReport}
        onCancel={() => setIsCreatingReport(false)}
        globalDateRange={globalDateRange}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create and manage custom transaction reports
          </p>
        </div>
        <button
          onClick={() => setIsCreatingReport(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          <span>Create Report</span>
        </button>
      </div>

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No reports yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Create your first report to start analyzing your transactions
          </p>
          <button
            onClick={() => setIsCreatingReport(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            <span>Create Report</span>
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedReport(report)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <FileText size={20} className="text-blue-600 dark:text-blue-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {report.name}
                    </h3>
                  </div>
                  
                  {report.description && (
                    <p className="text-gray-600 dark:text-gray-400 mb-3">
                      {report.description}
                    </p>
                  )}

                  <div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center space-x-1">
                      <Calendar size={14} />
                      <span>{formatDate(report.createdAt)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <DollarSign size={14} />
                      <span>{formatCurrency(reportStats.get(report.id)?.totalAmount || 0)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Tag size={14} />
                      <span>{reportStats.get(report.id)?.count || 0} transactions</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
                    <Filter size={12} />
                    <span>{getFilterSummary(report)}</span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteReport(report.id);
                  }}
                  className="text-gray-400 hover:text-red-600 transition-colors p-1"
                  title="Delete report"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 