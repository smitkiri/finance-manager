import React from 'react';
import { StatsCard } from './StatsCard';
import { Chart } from './Chart';
import { Expense } from '../types';
import { calculateStats } from '../utils';

interface DashboardProps {
  expenses: Expense[];
  categories: string[];
}

export const Dashboard: React.FC<DashboardProps> = ({ expenses, categories }) => {
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

  // Prepare chart data
  const pieData = categoryBreakdown.map(item => ({
    name: item.category,
    value: item.amount
  }));

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
        
        <Chart
          data={pieData}
          type="pie"
          title="Category Breakdown"
        />
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