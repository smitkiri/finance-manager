// Props: net worth history points, currency formatter, formatDate.
// Owns its own theme + breakpoint-aware tick density.
import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { NetWorthHistory } from '../../types';

interface BalanceChartProps {
  history: NetWorthHistory[];
  formatCurrency: (n: number) => string;
  formatDate: (dateStr: string) => string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { netWorth: number } }>;
  label?: string;
  formatCurrency: (n: number) => string;
  formatDate: (dateStr: string) => string;
}

const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active,
  payload,
  label,
  formatCurrency,
  formatDate,
}) => {
  if (!active || !payload?.length || !label) return null;
  const data = payload[0]?.payload;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-3 shadow-lg text-sm">
      <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">{formatDate(label)}</p>
      <p
        className={`font-semibold ${(data?.netWorth ?? 0) >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}
      >
        Net Worth: {formatCurrency(data?.netWorth ?? 0)}
      </p>
    </div>
  );
};

export const BalanceChart: React.FC<BalanceChartProps> = ({
  history,
  formatCurrency,
  formatDate,
}) => {
  const { theme } = useTheme();
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'mobile';

  if (history.length === 0) return null;

  const gridStroke = theme === 'dark' ? '#374151' : '#e5e7eb';
  const tickFill = theme === 'dark' ? '#9ca3af' : '#6b7280';
  const tickFontSize = isMobile ? 10 : 12;

  // Format chart dates for x-axis
  const chartData = history.map((h) => ({
    ...h,
    dateLabel: new Date(h.date).toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    }),
  }));

  // Only show one tick per unique month/year — on phones, skip every other one
  // to keep labels legible.
  const allMonthTicks = chartData.reduce<string[]>((acc, d) => {
    const lastLabel =
      acc.length > 0
        ? new Date(acc[acc.length - 1]).toLocaleDateString('en-US', {
            month: 'short',
            year: '2-digit',
            timeZone: 'UTC',
          })
        : null;
    if (d.dateLabel !== lastLabel) acc.push(d.date);
    return acc;
  }, []);
  const chartTicks = isMobile ? allMonthTicks.filter((_, i) => i % 2 === 0) : allMonthTicks;

  const chartHeight = isMobile ? 220 : 280;
  const chartMargin = isMobile
    ? { top: 5, right: 8, left: 0, bottom: 5 }
    : { top: 5, right: 20, left: 10, bottom: 5 };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-5">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
        Net Worth Over Time
      </h3>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart data={chartData} margin={chartMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
          <XAxis
            dataKey="date"
            ticks={chartTicks}
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString('en-US', {
                month: 'short',
                year: '2-digit',
                timeZone: 'UTC',
              })
            }
            tick={{ fontSize: tickFontSize, fill: tickFill }}
            stroke={gridStroke}
          />
          <YAxis
            tickFormatter={(v) => `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            tick={{ fontSize: tickFontSize, fill: tickFill }}
            stroke={gridStroke}
            width={isMobile ? 40 : 60}
          />
          <Tooltip
            content={<ChartTooltip formatCurrency={formatCurrency} formatDate={formatDate} />}
          />
          <Line
            type="monotone"
            dataKey="netWorth"
            name="Net Worth"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={isMobile ? false : { r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
