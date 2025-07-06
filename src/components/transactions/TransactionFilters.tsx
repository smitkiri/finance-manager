import React from 'react';
import { Tag, Filter, DollarSign, X } from 'lucide-react';
import { Source } from '../../types';

export interface TransactionFilters {
  categories?: string[];
  labels?: string[];
  types?: ('expense' | 'income')[];
  sources?: string[];
  minAmount?: number;
  maxAmount?: number;
  searchText?: string;
}

interface TransactionFiltersProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  categories: string[];
  sources: Source[];
  allLabels: string[];
  isCompact?: boolean;
  onClearFilters?: () => void;
}

export const TransactionFiltersComponent: React.FC<TransactionFiltersProps> = ({
  filters,
  onFiltersChange,
  categories,
  sources,
  allLabels,
  isCompact = false,
  onClearFilters
}) => {
  const handleCategoryChange = (category: string, checked: boolean) => {
    const currentCategories = filters.categories || [];
    const newCategories = checked
      ? [...currentCategories, category]
      : currentCategories.filter(c => c !== category);
    onFiltersChange({ ...filters, categories: newCategories.length > 0 ? newCategories : undefined });
  };

  const handleLabelChange = (label: string, checked: boolean) => {
    const currentLabels = filters.labels || [];
    const newLabels = checked
      ? [...currentLabels, label]
      : currentLabels.filter(l => l !== label);
    onFiltersChange({ ...filters, labels: newLabels.length > 0 ? newLabels : undefined });
  };

  const handleTypeChange = (type: 'expense' | 'income', checked: boolean) => {
    const currentTypes = filters.types || [];
    const newTypes = checked
      ? [...currentTypes, type]
      : currentTypes.filter(t => t !== type);
    onFiltersChange({ ...filters, types: newTypes.length > 0 ? newTypes : undefined });
  };

  const handleSourceChange = (sourceId: string, checked: boolean) => {
    const currentSources = filters.sources || [];
    const newSources = checked
      ? [...currentSources, sourceId]
      : currentSources.filter(s => s !== sourceId);
    onFiltersChange({ ...filters, sources: newSources.length > 0 ? newSources : undefined });
  };

  const handleAmountRangeChange = (field: 'minAmount' | 'maxAmount', value: string) => {
    const numValue = value === '' ? undefined : parseFloat(value);
    onFiltersChange({ ...filters, [field]: numValue });
  };

  const hasActiveFilters = () => {
    return !!(
      filters.categories?.length ||
      filters.labels?.length ||
      filters.types?.length ||
      filters.sources?.length ||
      filters.minAmount !== undefined ||
      filters.maxAmount !== undefined
    );
  };

  if (isCompact) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h3>
          {hasActiveFilters() && onClearFilters && (
            <button
              onClick={onClearFilters}
              className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X size={14} />
              <span>Clear</span>
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* Categories */}
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <Tag size={16} className="text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Categories</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((category) => (
                <label key={category} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.categories?.includes(category) || false}
                    onChange={(e) => handleCategoryChange(category, e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-700 dark:text-gray-300">{category}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Labels */}
          {allLabels.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Tag size={16} className="text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Labels</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {allLabels.map((label) => (
                  <label key={label} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.labels?.includes(label) || false}
                      onChange={(e) => handleLabelChange(label, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Types */}
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <Filter size={16} className="text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Type</span>
            </div>
            <div className="space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.types?.includes('expense') || false}
                  onChange={(e) => handleTypeChange('expense', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">Expenses</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.types?.includes('income') || false}
                  onChange={(e) => handleTypeChange('income', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">Income</span>
              </label>
            </div>
          </div>

          {/* Sources */}
          {sources.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Filter size={16} className="text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sources</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {sources.map((source) => (
                  <label key={source.id} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.sources?.includes(source.id) || false}
                      onChange={(e) => handleSourceChange(source.id, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300">{source.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Amount Range */}
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <DollarSign size={16} className="text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Amount Range</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <input
                  type="number"
                  value={filters.minAmount || ''}
                  onChange={(e) => handleAmountRangeChange('minAmount', e.target.value)}
                  placeholder="Min"
                  step="0.01"
                  min="0"
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <input
                  type="number"
                  value={filters.maxAmount || ''}
                  onChange={(e) => handleAmountRangeChange('maxAmount', e.target.value)}
                  placeholder="Max"
                  step="0.01"
                  min="0"
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full size version (for reports)
  return (
    <div className="space-y-6">
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
  );
}; 