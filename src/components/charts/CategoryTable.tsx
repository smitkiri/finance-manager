import React from 'react';
import { formatCurrency } from '../../utils';

interface CategoryTableProps {
  categoryBreakdown: { [key: string]: number };
  totalExpenses: number;
}

export const CategoryTable: React.FC<CategoryTableProps> = ({ categoryBreakdown, totalExpenses }) => {
  const categories = Object.entries(categoryBreakdown)
    .map(([name, amount]) => ({
      name: name || 'Uncategorized',
      amount,
      percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount); // Sort by amount descending

  if (categories.length === 0) {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Expenses by Category</h3>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No expense data available
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Expenses by Category</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Category</th>
              <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Percentage</th>
              <th className="text-right py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Amount</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category, index) => (
              <tr 
                key={category.name} 
                className={`border-b border-gray-100 dark:border-gray-700 ${
                  index === categories.length - 1 ? 'border-b-0' : ''
                }`}
              >
                <td className="py-3 px-4">
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-3"
                      style={{
                        backgroundColor: `hsl(${(index * 137.5) % 360}, 70%, 60%)`
                      }}
                    />
                    <span className="font-medium text-gray-900 dark:text-white">{category.name}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                  {category.percentage.toFixed(1)}%
                </td>
                <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(category.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
              <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">Total</td>
              <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">100%</td>
              <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white">
                {formatCurrency(totalExpenses)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}; 