import React from 'react';
import { LegendOptions, PanelMonthData } from '../../types';
import { formatCurrency } from '../../utils';

interface ChartLegendProps {
  data: PanelMonthData[];
  legendOptions: LegendOptions;
  seriesMode: 'two_series' | 'net_amount';
}

interface SeriesStats {
  label: string;
  color: string;
  min: number | null;
  max: number | null;
  avg: number | null;
  total: number | null;
}

function computeStats(values: number[]): {
  min: number | null;
  max: number | null;
  avg: number | null;
  total: number | null;
} {
  if (values.length === 0) return { min: null, max: null, avg: null, total: null };
  const sum = values.reduce((s, v) => s + v, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: sum / values.length,
    total: sum,
  };
}

export const ChartLegend: React.FC<ChartLegendProps> = ({ data, legendOptions, seriesMode }) => {
  if (!legendOptions.show) return null;

  const showAnyStats =
    legendOptions.min || legendOptions.max || legendOptions.avg || legendOptions.total;

  const seriesList: SeriesStats[] = [];

  if (seriesMode === 'net_amount') {
    const values = data.map((d) => d.net).filter((v): v is number => v !== null && v !== undefined);
    const stats = computeStats(values);
    seriesList.push({ label: 'Net', color: '#3b82f6', ...stats });
  } else {
    const incomeValues = data
      .map((d) => d.income)
      .filter((v): v is number => v !== null && v !== undefined);
    const expenseValues = data
      .map((d) => d.expenses)
      .filter((v): v is number => v !== null && v !== undefined);
    seriesList.push({ label: 'Income', color: '#22c55e', ...computeStats(incomeValues) });
    seriesList.push({ label: 'Expenses', color: '#ef4444', ...computeStats(expenseValues) });
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-2 text-xs">
      {seriesList.map((series) => (
        <div key={series.label} className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: series.color }}
          />
          <span className="text-gray-700 dark:text-gray-300 font-medium">{series.label}</span>
          {showAnyStats && (
            <span className="text-gray-500 dark:text-gray-400">
              {[
                legendOptions.min &&
                  series.min !== null &&
                  series.min !== undefined &&
                  `Min: ${formatCurrency(series.min)}`,
                legendOptions.max &&
                  series.max !== null &&
                  series.max !== undefined &&
                  `Max: ${formatCurrency(series.max)}`,
                legendOptions.avg &&
                  series.avg !== null &&
                  series.avg !== undefined &&
                  `Avg: ${formatCurrency(series.avg)}`,
                legendOptions.total &&
                  series.total !== null &&
                  series.total !== undefined &&
                  `Total: ${formatCurrency(series.total)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
