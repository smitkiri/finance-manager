import React, { useState, useMemo, useCallback } from 'react';
import { StatsCard } from './ui/StatsCard';
import { Chart } from './charts/Chart';
import { Expense, User } from '../types';
import { calculateStats, formatCurrency, formatDate } from '../utils';
import { filterTransfersForCalculations } from '../utils/transferDetection';
import { Check } from 'lucide-react';

interface DashboardProps {
  expenses: Expense[];
  categories: string[];
  selectedUserId: string | null;
  users: User[];
  onViewDetails?: (expense: Expense) => void;
}

export const Dashboard: React.FC<DashboardProps> = React.memo(({ expenses, categories, selectedUserId, users, onViewDetails }) => {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(categories);
  const [topTransactionCount, setTopTransactionCount] = useState<number>(10);

  // Memoize filtered expenses to prevent recalculation on every render
  const filteredExpenses = useMemo(() => 
    filterTransfersForCalculations(expenses, selectedUserId), [expenses, selectedUserId]
  );

  // Memoize statistics calculation using filtered expenses
  const stats = useMemo(() => 
    calculateStats(filteredExpenses), [filteredExpenses]
  );

  // Memoize category breakdown for expenses
  const expenseCategoryBreakdown = useMemo(() => 
    categories.map(category => {
      const categoryExpenses = filteredExpenses.filter(expense => 
        expense.type === 'expense' && expense.category === category
      );
      const total = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const percentage = stats.totalExpenses > 0 ? (total / stats.totalExpenses) * 100 : 0;
      
      return {
        category: category || 'Uncategorized',
        amount: total,
        percentage: Math.round(percentage * 100) / 100
      };
    }).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount), 
    [categories, filteredExpenses, stats.totalExpenses]
  );

  // Memoize category breakdown for income
  const incomeCategoryBreakdown = useMemo(() => 
    categories.map(category => {
      const categoryIncome = filteredExpenses.filter(expense => 
        expense.type === 'income' && expense.category === category
      );
      const total = categoryIncome.reduce((sum, expense) => sum + expense.amount, 0);
      const percentage = stats.totalIncome > 0 ? (total / stats.totalIncome) * 100 : 0;
      
      return {
        category: category || 'Uncategorized',
        amount: total,
        percentage: Math.round(percentage * 100) / 100
      };
    }).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount), 
    [categories, filteredExpenses, stats.totalIncome]
  );

  // Memoize categories to show
  const categoriesToShow = useMemo(() => 
    selectedCategories.length > 0 ? selectedCategories : categories, 
    [selectedCategories, categories]
  );

  // Memoize category line chart data
  const categoryLineData = useMemo(() => 
    prepareCategoryLineData(filteredExpenses, categoriesToShow), 
    [filteredExpenses, categoriesToShow]
  );

  // Memoize savings monthly data
  const savingsMonthlyData = useMemo(() => 
    stats.monthlyData.map(month => ({
      month: month.month,
      savings: month.income - month.expenses
    })), [stats.monthlyData]
  );

  // Memoize donut chart data
  const donutData = useMemo(() => 
    stats.netAmount >= 0 
      ? [
          { name: 'Savings', value: stats.netAmount },
          { name: 'Expenses', value: stats.totalExpenses }
        ]
      : [
          { name: 'Expenses', value: stats.totalExpenses }
        ], 
    [stats.netAmount, stats.totalExpenses]
  );

  // Memoize top expenses by amount
  const topExpenses = useMemo(() => 
    filteredExpenses
      .filter(exp => exp.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, topTransactionCount),
    [filteredExpenses, topTransactionCount]
  );

  // Memoize top income by amount
  const topIncome = useMemo(() => 
    filteredExpenses
      .filter(exp => exp.type === 'income')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, topTransactionCount),
    [filteredExpenses, topTransactionCount]
  );

  // Function to prepare category line chart data
  function prepareCategoryLineData(expenses: Expense[], categoriesToShow: string[]) {
    const monthlyMap = new Map<string, { month: string; displayMonth: string; [key: string]: any }>();
    
    // Initialize all months with 0 values for all categories
    expenses.forEach(expense => {
      if (expense.type === 'expense') {
        const date = new Date(expense.date);
        const isoMonth = date.toISOString().slice(0, 7); // YYYY-MM
        const displayMonth = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        if (!monthlyMap.has(isoMonth)) {
          const entry: { month: string; displayMonth: string; [key: string]: any } = {
            month: isoMonth,
            displayMonth,
          };
          categoriesToShow.forEach(cat => {
            entry[cat] = 0;
          });
          monthlyMap.set(isoMonth, entry);
        }
        const entry = monthlyMap.get(isoMonth)!;
        const category = expense.category || 'Uncategorized';
        if (categoriesToShow.includes(category)) {
          entry[category] += expense.amount;
        }
      }
    });

    // Convert to array format for chart, sorted oldest to newest
    return Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(entry => {
        const { displayMonth, ...rest } = entry;
        // Remove the ISO 'month' key, only use displayMonth as 'month' for the chart
        const { month, ...categoryData } = rest;
        return { month: displayMonth, ...categoryData };
      });
  }

  const handleCategoryToggle = useCallback((category: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(cat => cat !== category);
      } else {
        return [...prev, category];
      }
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedCategories(categories);
  }, [categories]);

  const handleClearAll = useCallback(() => {
    setSelectedCategories([]);
  }, []);

  // Memoize user label
  const userLabel = useMemo(() => {
    if (selectedUserId) {
      const user = users.find(u => u.id === selectedUserId);
      return user ? user.name : 'Unknown User';
    }
    return 'All Users';
  }, [selectedUserId, users]);

  return (
    <div className="space-y-6">
      {/* User Filter Indicator */}
      <div className="flex items-center mb-2">
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          Stats for: <span className="font-semibold text-gray-700 dark:text-white">{userLabel}</span>
        </span>
      </div>
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard
          title="Total Expenses"
          value={stats.totalExpenses}
          type="expense"
        />
        <StatsCard
          title="Total Income"
          value={stats.totalIncome}
          type="income"
        />
        <StatsCard
          title="Savings"
          value={stats.netAmount}
          type="net"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Chart
          data={stats.monthlyData}
          type="line"
          title="Monthly Overview"
        />
        
        <Chart
          data={savingsMonthlyData}
          type="savings-bar"
          title="Savings"
        />
        
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Expense Category Trends
            </h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSelectAll}
                className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/30 transition-colors"
              >
                Select All
              </button>
              <button
                onClick={handleClearAll}
                className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
          
          <Chart
            data={categoryLineData}
            type="line"
            title=""
            categoryMode={true}
          />
          
          {/* Category Selector */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Categories:
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const isSelected = selectedCategories.includes(category);
                return (
                  <button
                    key={category}
                    onClick={() => handleCategoryToggle(category)}
                    className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      isSelected
                        ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {isSelected && <Check size={12} />}
                    <span>{category}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <Chart
          data={donutData}
          type="donut"
          title="Savings vs Expenses"
        />
      </div>

      {/* Category Breakdown Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Category Breakdown */}
        {expenseCategoryBreakdown.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Expense Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    <th className="text-left py-2 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Category
                    </th>
                    <th className="text-right py-2 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Amount
                    </th>
                    <th className="text-right py-2 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Percentage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {expenseCategoryBreakdown.map((item) => (
                    <tr key={item.category} className="border-b border-gray-100 dark:border-slate-700">
                      <td className="py-2 px-4 text-sm text-gray-900 dark:text-white">
                        {item.category}
                      </td>
                      <td className="py-2 px-4 text-sm text-right text-red-600 dark:text-red-400 font-medium">
                        ${item.amount.toFixed(2)}
                      </td>
                      <td className="py-2 px-4 text-sm text-right text-gray-500 dark:text-gray-400">
                        {item.percentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Income Category Breakdown */}
        {incomeCategoryBreakdown.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Income Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    <th className="text-left py-2 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Category
                    </th>
                    <th className="text-right py-2 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Amount
                    </th>
                    <th className="text-right py-2 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Percentage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {incomeCategoryBreakdown.map((item) => (
                    <tr key={item.category} className="border-b border-gray-100 dark:border-slate-700">
                      <td className="py-2 px-4 text-sm text-gray-900 dark:text-white">
                        {item.category}
                      </td>
                      <td className="py-2 px-4 text-sm text-right text-green-600 dark:text-green-400 font-medium">
                        ${item.amount.toFixed(2)}
                      </td>
                      <td className="py-2 px-4 text-sm text-right text-gray-500 dark:text-gray-400">
                        {item.percentage}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Top Transactions by Amount */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Top Transactions by Amount
          </h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Show:</span>
            {[5, 10, 20].map((count) => (
              <button
                key={count}
                onClick={() => setTopTransactionCount(count)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  topTransactionCount === count
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Expenses */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Top Expenses
            </h4>
            {topExpenses.length > 0 ? (
              <div className="space-y-2">
                {topExpenses.map((expense, index) => (
                  <button
                    key={expense.id}
                    onClick={() => onViewDetails?.(expense)}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-red-300 dark:hover:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            #{index + 1}
                          </span>
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {expense.description}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(expense.date)}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {expense.category}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-red-600 dark:text-red-400 ml-4">
                        -{formatCurrency(expense.amount)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No expenses found</p>
            )}
          </div>

          {/* Top Income */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Top Income
            </h4>
            {topIncome.length > 0 ? (
              <div className="space-y-2">
                {topIncome.map((expense, index) => (
                  <button
                    key={expense.id}
                    onClick={() => onViewDetails?.(expense)}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/10 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            #{index + 1}
                          </span>
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {expense.description}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(expense.date)}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {expense.category}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-green-600 dark:text-green-400 ml-4">
                        +{formatCurrency(expense.amount)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No income found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}); 