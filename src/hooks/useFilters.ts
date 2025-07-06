import { useState, useEffect, useMemo } from 'react';
import { Expense, DateRange } from '../types';
import { filterExpensesByDateRange } from '../utils';

export const useFilters = (expenses: Expense[]) => {
  const [filter, setFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start of current month
    end: new Date() // Today
  });

  // Memoize all unique labels from all expenses
  const allLabels = useMemo(() => 
    Array.from(new Set(
      expenses.flatMap(expense => expense.labels || [])
    )), [expenses]
  );

  // Memoize filtered expenses to prevent recalculation on every render
  const { dateFilteredExpenses, filteredExpenses } = useMemo(() => {
    const dateFiltered = filterExpensesByDateRange(expenses, dateRange);
    const filtered = dateFiltered.filter(exp => {
      // Type filter
      if (filter === 'all') {
        // Continue to label filter
      } else if (filter === 'expenses') {
        if (exp.type !== 'expense') return false;
      } else if (filter === 'income') {
        if (exp.type !== 'income') return false;
      } else {
        if (exp.category !== filter) return false;
      }
      
      // Label filter
      if (labelFilter.length > 0) {
        const expenseLabels = exp.labels || [];
        // Show transactions that have ANY of the selected labels
        return labelFilter.some(label => expenseLabels.includes(label));
      }
      
      return true;
    });

    return { dateFilteredExpenses: dateFiltered, filteredExpenses: filtered };
  }, [expenses, dateRange, filter, labelFilter]);

  const clearAllFilters = () => {
    setFilter('all');
    setLabelFilter([]);
  };

  return {
    filter,
    setFilter,
    labelFilter,
    setLabelFilter,
    dateRange,
    setDateRange,
    allLabels,
    filteredExpenses,
    clearAllFilters,
  };
}; 