import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { PanelMonthData } from '../../types';
import { formatCurrency } from '../../utils';
import { useTheme } from '../../contexts/ThemeContext';

interface PanelChartProps {
  data: PanelMonthData[];
  chartType: 'bar' | 'line';
  seriesMode: 'two_series' | 'net_amount';
  netOrientation?: 'income_positive' | 'expense_positive' | null;
  loading?: boolean;
  emptyMessage?: string;
  height?: number | string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-900 p-3 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg text-xs">
      <p className="font-medium text-gray-900 dark:text-white mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color ?? entry.fill }}>
          {entry.name}: {formatCurrency(entry.value)}
        </p>
      ))}
    </div>
  );
};

export const PanelChart: React.FC<PanelChartProps> = ({
  data, chartType, seriesMode, netOrientation, loading, emptyMessage = 'No data for selected period', height = 220,
}) => {
  const { theme } = useTheme();
  const gridStroke = theme === 'dark' ? '#374151' : '#e5e7eb';
  const axisStroke = theme === 'dark' ? '#9ca3af' : '#6b7280';

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-500 dark:text-gray-400" style={{ height }}>
        {emptyMessage}
      </div>
    );
  }

  const isNet = seriesMode === 'net_amount';
  const yFormatter = (v: number) => `$${Math.abs(v).toFixed(0)}`;

  const renderChart = () => {
    if (chartType === 'line') {
      return (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis dataKey="month" stroke={axisStroke} fontSize={11} />
          <YAxis stroke={axisStroke} fontSize={11} tickFormatter={yFormatter} />
          <Tooltip content={<CustomTooltip />} />
          {isNet ? (
            <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Net" />
          ) : (
            <>
              <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Income" />
              <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Expenses" />
            </>
          )}
        </LineChart>
      );
    }

    return (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey="month" stroke={axisStroke} fontSize={11} />
        <YAxis
          stroke={axisStroke}
          fontSize={11}
          tickFormatter={yFormatter}
          reversed={netOrientation === 'expense_positive'}
          domain={[(dataMin: number) => Math.min(0, dataMin), (dataMax: number) => Math.max(0, dataMax)]}
        />
        <Tooltip content={<CustomTooltip />} />
        {isNet ? (
          <Bar dataKey="net" radius={[4, 4, 0, 0]} name="Net">
            {data.map((entry, i) => (
              <Cell key={i} fill={(entry.net ?? 0) >= 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        ) : (
          <>
            <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} name="Income" />
            <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
          </>
        )}
      </BarChart>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      {renderChart()}
    </ResponsiveContainer>
  );
};
