import React, { useState } from 'react';
import { StatsCard } from './ui/StatsCard';
import { Chart } from './charts/Chart';
import { Expense } from '../types';
import { calculateStats } from '../utils';
import { Check } from 'lucide-react';

interface DashboardProps {
  expenses: Expense[];
  categories: string[];
}

export const Dashboard: React.FC<DashboardProps> = ({ expenses, categories }) => {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(categories);

  // Calculate statistics using the utility function
  const stats = calculateStats(expenses);

  // Calculate category breakdown
  const categoryBreakdown = categories.map(category => {
    const categoryExpenses = expenses.filter(expense => 
      expense.type === 'expense' && expense.category === category
    );
    const total = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const percentage = stats.totalExpenses > 0 ? (total / stats.totalExpenses) * 100 : 0;
    
    return {
      category: category || 'Uncategorized',
      amount: total,
      percentage: Math.round(percentage * 100) / 100
    };
  }).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);

  // Prepare category line chart data
  const categoriesToShow = selectedCategories.length > 0 ? selectedCategories : categories;
  const categoryLineData = prepareCategoryLineData(expenses, categoriesToShow);

  // Function to prepare category line chart data
  function prepareCategoryLineData(expenses: Expense[], categoriesToShow: string[]) {
    const monthlyData: { [key: string]: { [key: string]: number } } = {};
    
    // Initialize all months with 0 values for all categories
    expenses.forEach(expense => {
      if (expense.type === 'expense') {
        const month = new Date(expense.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        if (!monthlyData[month]) {
          monthlyData[month] = {};
          categoriesToShow.forEach(cat => {
            monthlyData[month][cat] = 0;
          });
        }
        
        const category = expense.category || 'Uncategorized';
        if (categoriesToShow.includes(category)) {
          monthlyData[month][category] += expense.amount;
        }
      }
    });

    // Convert to array format for chart
    return Object.keys(monthlyData)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .map(month => ({
        month,
        ...monthlyData[month]
      }));
  }

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(cat => cat !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedCategories(categories);
  };

  const handleClearAll = () => {
    setSelectedCategories([]);
  };

  return (
    <div className="space-y-6">
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
          title="Net Amount"
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
        
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Category Trends
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
      </div>

      {/* Category Breakdown Table */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Category Breakdown
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
                {categoryBreakdown.map((item) => (
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
    </div>
  );
}; 