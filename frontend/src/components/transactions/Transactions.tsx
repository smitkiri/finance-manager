import React, { useState } from 'react';
import { TransactionList } from './TransactionList';
import { Expense, Source } from '../../types';
import { Search, Filter as FilterIcon } from 'lucide-react';
import {
  TransactionFilters as FilterType,
  TransactionFiltersComponent,
} from './TransactionFilters';
import { Sheet } from '../ui/Sheet';

interface TransactionsProps {
  expenses: Expense[];
  totalCount?: number;
  isLoading?: boolean;
  onLoadMore?: () => void;
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onUpdateCategory: (expenseId: string, newCategory: string) => void;
  onAddLabel: (expenseId: string, label: string) => void;
  onRemoveLabel: (expenseId: string, label: string) => void;
  onViewDetails: (expense: Expense) => void;
  categories: string[];
  searchText?: string;
  onSearchChange?: (searchText: string) => void;
  selectedUserId?: string | null;
  filters?: FilterType;
  onFiltersChange?: (f: FilterType) => void;
  onClearFilters?: () => void;
  sources?: Source[];
  allLabels?: string[];
}

export const Transactions: React.FC<TransactionsProps> = ({
  expenses,
  totalCount,
  isLoading = false,
  onLoadMore,
  onDelete,
  onEdit,
  onUpdateCategory,
  onAddLabel,
  onRemoveLabel,
  onViewDetails,
  categories,
  searchText = '',
  onSearchChange,
  selectedUserId,
  filters,
  onFiltersChange,
  onClearFilters,
  sources,
  allLabels,
}) => {
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const displayTotal = totalCount !== undefined ? totalCount : expenses.length;

  const activeFilterCount =
    (filters?.categories?.length ?? 0) +
    (filters?.labels?.length ?? 0) +
    (filters?.types?.length ?? 0) +
    (filters?.sources?.length ?? 0) +
    (filters?.minAmount !== undefined ? 1 : 0) +
    (filters?.maxAmount !== undefined ? 1 : 0);

  const sourceNameById = new Map((sources ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transactions</h1>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {isLoading ? 'Loading...' : `${displayTotal} transaction${displayTotal !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Search Bar + Filter Trigger */}
      {onSearchChange && (
        <div className="flex items-center gap-3">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={20}
              />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-10 pr-4 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-white"
              />
            </div>
          </div>
          {filters && onFiltersChange && (
            <button
              type="button"
              onClick={() => setIsFilterSheetOpen(true)}
              className="lg:hidden flex items-center gap-2 px-4 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <FilterIcon size={18} />
              <span className="text-sm font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-blue-600 text-white text-xs rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* Active filter chips (mobile only) */}
      {filters && onFiltersChange && activeFilterCount > 0 && (
        <div className="lg:hidden flex flex-wrap gap-2">
          {filters.categories?.map((c) => (
            <button
              key={`cat-${c}`}
              type="button"
              onClick={() => {
                const next = filters.categories!.filter((x) => x !== c);
                onFiltersChange({
                  ...filters,
                  categories: next.length > 0 ? next : undefined,
                });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[32px] bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-xs font-medium"
            >
              <span>{c}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {filters.labels?.map((l) => (
            <button
              key={`lbl-${l}`}
              type="button"
              onClick={() => {
                const next = filters.labels!.filter((x) => x !== l);
                onFiltersChange({
                  ...filters,
                  labels: next.length > 0 ? next : undefined,
                });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[32px] bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-xs font-medium"
            >
              <span>{l}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {filters.types?.map((t) => (
            <button
              key={`typ-${t}`}
              type="button"
              onClick={() => {
                const next = filters.types!.filter((x) => x !== t);
                onFiltersChange({
                  ...filters,
                  types: next.length > 0 ? next : undefined,
                });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[32px] bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-xs font-medium"
            >
              <span className="capitalize">{t}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {filters.sources?.map((s) => (
            <button
              key={`src-${s}`}
              type="button"
              onClick={() => {
                const next = filters.sources!.filter((x) => x !== s);
                onFiltersChange({
                  ...filters,
                  sources: next.length > 0 ? next : undefined,
                });
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[32px] bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded-full text-xs font-medium"
            >
              <span>{sourceNameById.get(s) ?? s}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {filters.minAmount !== undefined && (
            <button
              key="min"
              type="button"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  minAmount: undefined,
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[32px] bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full text-xs font-medium"
            >
              <span>{`≥ $${filters.minAmount}`}</span>
              <span aria-hidden="true">×</span>
            </button>
          )}
          {filters.maxAmount !== undefined && (
            <button
              key="max"
              type="button"
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  maxAmount: undefined,
                })
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[32px] bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-full text-xs font-medium"
            >
              <span>{`≤ $${filters.maxAmount}`}</span>
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      )}

      {/* Mobile filter sheet */}
      {filters && onFiltersChange && (
        <Sheet
          isOpen={isFilterSheetOpen}
          onClose={() => setIsFilterSheetOpen(false)}
          title="Filters"
          footer={
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  onClearFilters?.();
                }}
                className="flex-1 py-3 min-h-[48px] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-medium"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(false)}
                className="flex-1 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg font-medium"
              >
                Apply
              </button>
            </div>
          }
        >
          <TransactionFiltersComponent
            filters={filters}
            onFiltersChange={onFiltersChange}
            categories={categories}
            sources={sources ?? []}
            allLabels={allLabels ?? []}
            isCompact={false}
            onClearFilters={onClearFilters ?? (() => {})}
          />
        </Sheet>
      )}

      {/* Transaction List */}
      <TransactionList
        expenses={expenses}
        totalCount={totalCount}
        onLoadMore={onLoadMore}
        isLoading={isLoading}
        onDelete={onDelete}
        onEdit={onEdit}
        onUpdateCategory={onUpdateCategory}
        onAddLabel={onAddLabel}
        onRemoveLabel={onRemoveLabel}
        onViewDetails={onViewDetails}
        categories={categories}
        selectedUserId={selectedUserId}
      />
    </div>
  );
};
