import React, { useState } from 'react';
import { Tag, Filter, DollarSign, X, ChevronDown, ChevronUp } from 'lucide-react';
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

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['types']));

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
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

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.categories?.length) count += filters.categories.length;
    if (filters.labels?.length) count += filters.labels.length;
    if (filters.types?.length) count += filters.types.length;
    if (filters.sources?.length) count += filters.sources.length;
    if (filters.minAmount !== undefined) count += 1;
    if (filters.maxAmount !== undefined) count += 1;
    return count;
  };

  if (isCompact) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-700 dark:to-slate-700 px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Filter size={18} className="text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Filters</h3>
              {hasActiveFilters() && (
                <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-medium rounded-full">
                  {getActiveFilterCount()}
                </span>
              )}
            </div>
            {hasActiveFilters() && onClearFilters && (
              <button
                onClick={onClearFilters}
                className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-600 rounded-lg transition-colors"
              >
                <X size={14} />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Transaction Type - Always visible */}
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('types')}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Filter size={16} className="text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">Transaction Type</span>
                {filters.types?.length ? (
                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                    {filters.types.length}
                  </span>
                ) : null}
              </div>
              {expandedSections.has('types') ? (
                <ChevronUp size={16} className="text-gray-500 dark:text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
              )}
            </button>
            {expandedSections.has('types') && (
              <div className="p-3 space-y-2 bg-white dark:bg-slate-800">
                <button
                  onClick={() => handleTypeChange('expense', !filters.types?.includes('expense'))}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    filters.types?.includes('expense')
                      ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-2 border-red-300 dark:border-red-700'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  Expenses
                </button>
                <button
                  onClick={() => handleTypeChange('income', !filters.types?.includes('income'))}
                  className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    filters.types?.includes('income')
                      ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-2 border-green-300 dark:border-green-700'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 border-2 border-transparent hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  Income
                </button>
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('categories')}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Tag size={16} className="text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">Categories</span>
                {filters.categories?.length ? (
                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                    {filters.categories.length}
                  </span>
                ) : null}
              </div>
              {expandedSections.has('categories') ? (
                <ChevronUp size={16} className="text-gray-500 dark:text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
              )}
            </button>
            {expandedSections.has('categories') && (
              <div className="p-3 bg-white dark:bg-slate-800">
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <button
                      key={category}
                      onClick={() => handleCategoryChange(category, !filters.categories?.includes(category))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        filters.categories?.includes(category)
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Labels */}
          {allLabels.length > 0 && (
            <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('labels')}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Tag size={16} className="text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Labels</span>
                  {filters.labels?.length ? (
                    <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                      {filters.labels.length}
                    </span>
                  ) : null}
                </div>
                {expandedSections.has('labels') ? (
                  <ChevronUp size={16} className="text-gray-500 dark:text-gray-400" />
                ) : (
                  <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
                )}
              </button>
              {expandedSections.has('labels') && (
                <div className="p-3 bg-white dark:bg-slate-800">
                  <div className="flex flex-wrap gap-2">
                    {allLabels.map((label) => (
                      <button
                        key={label}
                        onClick={() => handleLabelChange(label, !filters.labels?.includes(label))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          filters.labels?.includes(label)
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sources */}
          {sources.length > 0 && (
            <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection('sources')}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Filter size={16} className="text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Sources</span>
                  {filters.sources?.length ? (
                    <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                      {filters.sources.length}
                    </span>
                  ) : null}
                </div>
                {expandedSections.has('sources') ? (
                  <ChevronUp size={16} className="text-gray-500 dark:text-gray-400" />
                ) : (
                  <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
                )}
              </button>
              {expandedSections.has('sources') && (
                <div className="p-3 bg-white dark:bg-slate-800">
                  <div className="flex flex-wrap gap-2">
                    {sources.map((source) => (
                      <button
                        key={source.id}
                        onClick={() => handleSourceChange(source.id, !filters.sources?.includes(source.id))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          filters.sources?.includes(source.id)
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {source.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Amount Range */}
          <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection('amount')}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <DollarSign size={16} className="text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">Amount Range</span>
                {(filters.minAmount !== undefined || filters.maxAmount !== undefined) && (
                  <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                    Set
                  </span>
                )}
              </div>
              {expandedSections.has('amount') ? (
                <ChevronUp size={16} className="text-gray-500 dark:text-gray-400" />
              ) : (
                <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
              )}
            </button>
            {expandedSections.has('amount') && (
              <div className="p-3 bg-white dark:bg-slate-800 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Minimum
                  </label>
                  <input
                    type="number"
                    value={filters.minAmount || ''}
                    onChange={(e) => handleAmountRangeChange('minAmount', e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Maximum
                  </label>
                  <input
                    type="number"
                    value={filters.maxAmount || ''}
                    onChange={(e) => handleAmountRangeChange('maxAmount', e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
            )}
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