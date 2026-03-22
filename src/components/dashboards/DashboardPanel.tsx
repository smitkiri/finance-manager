import React from 'react';
import { Pencil, Trash2, List } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { DashboardPanel as DashboardPanelType, PanelMonthData } from '../../types';
import { formatCurrency } from '../../utils';
import { useTheme } from '../../contexts/ThemeContext';
import { ChartLegend } from './ChartLegend';

interface DashboardPanelProps {
  panel: DashboardPanelType;
  data: PanelMonthData[];
  loading: boolean;
  onEdit: (panel: DashboardPanelType) => void;
  onDelete: (panelId: string) => void;
  onViewTransactions: (panel: DashboardPanelType) => void;
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

export const DashboardPanel: React.FC<DashboardPanelProps> = ({ panel, data, loading, onEdit, onDelete, onViewTransactions }) => {
  const { theme } = useTheme();
  const gridStroke = theme === 'dark' ? '#374151' : '#e5e7eb';
  const axisStroke = theme === 'dark' ? '#9ca3af' : '#6b7280';

  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (!data.length) {
      return (
        <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">
          No data for selected period
        </div>
      );
    }

    const isNet = panel.seriesMode === 'net_amount';
    const yFormatter = (v: number) => `$${Math.abs(v).toFixed(0)}`;

    if (panel.chartType === 'line') {
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

    // Bar chart
    return (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
        <XAxis dataKey="month" stroke={axisStroke} fontSize={11} />
        <YAxis
          stroke={axisStroke}
          fontSize={11}
          tickFormatter={yFormatter}
          reversed={panel.netOrientation === 'expense_positive'}
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
    <div className="card group relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate pr-2">{panel.title}</h3>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onViewTransactions(panel)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
            aria-label="View transactions"
          >
            <List size={14} />
          </button>
          <button
            onClick={() => onEdit(panel)}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
            aria-label="Edit panel"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(panel.id)}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            aria-label="Delete panel"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={panel.legendOptions?.show ? 190 : 220}>
        {renderChart() as React.ReactElement}
      </ResponsiveContainer>
      {panel.legendOptions?.show && (
        <ChartLegend data={data} legendOptions={panel.legendOptions} seriesMode={panel.seriesMode} />
      )}
    </div>
  );
};
