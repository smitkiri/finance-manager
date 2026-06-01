import React from 'react';
import { Pencil, Trash2, List } from 'lucide-react';
import { DashboardPanel as DashboardPanelType, PanelMonthData } from '../../types';
import { PanelChart } from './PanelChart';
import { ChartLegend } from './ChartLegend';

interface DashboardPanelProps {
  panel: DashboardPanelType;
  data: PanelMonthData[];
  loading: boolean;
  onEdit: (panel: DashboardPanelType) => void;
  onDelete: (panelId: string) => void;
  onViewTransactions: (panel: DashboardPanelType) => void;
}

export const DashboardPanel: React.FC<DashboardPanelProps> = ({
  panel,
  data,
  loading,
  onEdit,
  onDelete,
  onViewTransactions,
}) => {
  return (
    <div className="card group relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate pr-2">
          {panel.title}
        </h3>
        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
          <button
            onClick={() => onViewTransactions(panel)}
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
            aria-label="View transactions"
          >
            <List size={14} />
          </button>
          <button
            onClick={() => onEdit(panel)}
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
            aria-label="Edit panel"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(panel.id)}
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center text-gray-400 hover:text-red-500 rounded"
            aria-label="Delete panel"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Chart */}
      <PanelChart
        data={data}
        chartType={panel.chartType}
        seriesMode={panel.seriesMode}
        netOrientation={panel.netOrientation}
        loading={loading}
        height={panel.legendOptions?.show ? 190 : 220}
      />
      {panel.legendOptions?.show && (
        <ChartLegend
          data={data}
          legendOptions={panel.legendOptions}
          seriesMode={panel.seriesMode}
        />
      )}
    </div>
  );
};
