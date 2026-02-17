import React from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { formatCurrency } from '../../utils';

interface StatsCardProps {
  title: string;
  value: number;
  type: 'expense' | 'income' | 'net';
  change?: number;
  changeLabel?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({ title, value, type, change, changeLabel }) => {
  const getIcon = () => {
    switch (type) {
      case 'expense':
        return <TrendingDown className="text-danger-600" size={24} />;
      case 'income':
        return <TrendingUp className="text-success-600" size={24} />;
      case 'net':
        return <DollarSign className="text-primary-600" size={24} />;
      default:
        return <DollarSign className="text-gray-600" size={24} />;
    }
  };

  const getValueColor = () => {
    switch (type) {
      case 'expense':
        return 'text-danger-600';
      case 'income':
        return 'text-success-600';
      case 'net':
        return value >= 0 ? 'text-success-600' : 'text-danger-600';
      default:
        return 'text-gray-900';
    }
  };

  const getChangeColor = () => {
    if (!change) return 'text-gray-500';
    return change >= 0 ? 'text-success-600' : 'text-danger-600';
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{title}</p>
          <p className={`text-2xl font-bold ${getValueColor()} mb-1`}>
            {formatCurrency(value)}
          </p>
          {change !== undefined && (
            <p className={`text-sm ${getChangeColor()}`}>
              {change >= 0 ? '+' : ''}{formatCurrency(change)} {changeLabel}
            </p>
          )}
        </div>
        <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
          {getIcon()}
        </div>
      </div>
    </div>
  );
}; 