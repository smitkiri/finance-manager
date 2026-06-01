import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  DashboardPanel,
  Dashboard,
  Expense,
  FilterGroup,
  LegendOptions,
  PanelMonthData,
} from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { PanelChart } from './PanelChart';
import { ChartLegend } from './ChartLegend';
import { TransactionPreview } from './TransactionPreview';
import { FilterBuilder } from './FilterBuilder';
import { generateId } from '../../utils';
import { useBreakpoint } from '../../hooks/useBreakpoint';

interface PanelEditorProps {
  dashboard: Dashboard;
  panel: DashboardPanel | null; // null = create mode
  categories: string[];
  allLabels: string[];
  selectedUserId: string | null;
  dateRange: { start: Date; end: Date };
  onSave: (panel: DashboardPanel) => void;
  onCancel: () => void;
}

export const PanelEditor: React.FC<PanelEditorProps> = ({
  dashboard,
  panel,
  categories,
  allLabels,
  selectedUserId,
  dateRange,
  onSave,
  onCancel,
}) => {
  const isEdit = !!panel;
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const [title, setTitle] = useState(panel?.title || '');
  const [chartType, setChartType] = useState<'bar' | 'line'>(panel?.chartType || 'bar');
  const [seriesMode, setSeriesMode] = useState<'two_series' | 'net_amount'>(
    panel?.seriesMode || 'two_series'
  );
  const [netOrientation, setNetOrientation] = useState<'income_positive' | 'expense_positive'>(
    panel?.netOrientation || 'income_positive'
  );
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>(panel?.filterGroups || []);
  const [legendOptions, setLegendOptions] = useState<LegendOptions>(
    panel?.legendOptions || { show: false, min: false, max: false, avg: false, total: false }
  );

  const [chartData, setChartData] = useState<PanelMonthData[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [previewTransactions, setPreviewTransactions] = useState<Expense[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Validate regex conditions
  const regexErrors = filterGroups.flatMap((g, gi) =>
    g.conditions
      .map((c, ci) => {
        if (c.field !== 'description' || !c.value) return null;
        try {
          new RegExp(c.value as string);
          return null;
        } catch (e: any) {
          return { gi, ci, message: e.message };
        }
      })
      .filter(Boolean)
  );
  const hasRegexError = regexErrors.length > 0;
  const canSave = title.trim() !== '' && !hasRegexError && !saving;

  // Debounced data fetch
  const fetchPreviewData = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const dateFrom = dateRange.start.toISOString().slice(0, 10);
      const dateTo = dateRange.end.toISOString().slice(0, 10);

      // Fetch transaction preview
      setPreviewLoading(true);
      const previewResult = await ApiClient.previewPanelTransactions({
        filterGroups,
        userId: selectedUserId,
        dateFrom,
        dateTo,
        limit: 10,
      });
      setPreviewTransactions(previewResult.transactions);
      setPreviewTotal(previewResult.total);
      setPreviewLoading(false);

      // Fetch chart data via server-side aggregation endpoint
      setChartLoading(true);
      try {
        const chartResult = await ApiClient.chartPreview({
          filterGroups,
          userId: selectedUserId,
          dateFrom,
          dateTo,
        });

        // Use server-provided month series (includes all months in range)
        const monthMap: Record<string, PanelMonthData> = {};
        for (const [key, val] of Object.entries(chartResult.monthMap || {})) {
          monthMap[key] = val as PanelMonthData;
        }

        // Aggregate rows into PanelMonthData by month
        for (const row of chartResult.rows) {
          const key = row.sortMonth;
          if (!monthMap[key]) monthMap[key] = { month: row.month };
          if (seriesMode === 'net_amount') {
            const sign = row.type === 'income' ? 1 : -1;
            monthMap[key].net = (monthMap[key].net || 0) + sign * row.total;
          } else {
            if (row.type === 'income') monthMap[key].income = row.total;
            else monthMap[key].expenses = row.total;
          }
        }

        const sorted = Object.entries(monthMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, v]) => v);
        setChartData(sorted);
      } catch {
        setChartData([]);
      }
      setChartLoading(false);
    }, 400);
  }, [filterGroups, dateRange, selectedUserId, seriesMode]);

  useEffect(() => {
    fetchPreviewData();
  }, [fetchPreviewData]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // Strip empty groups before saving
      const cleanedGroups = filterGroups
        .map((g) => ({
          ...g,
          conditions: g.conditions.filter((c) => {
            if (c.field === 'type') return !!c.value;
            if (c.field === 'category' || c.field === 'labels')
              return Array.isArray(c.value) && c.value.length > 0;
            if (c.field === 'amount')
              return c.value !== '' && c.value !== null && c.value !== undefined;
            if (c.field === 'description') return !!c.value;
            return false;
          }),
        }))
        .filter((g) => g.conditions.length > 0);

      const payload = {
        id: panel?.id || generateId(),
        title: title.trim(),
        chartType,
        seriesMode,
        netOrientation: seriesMode === 'net_amount' ? netOrientation : null,
        legendOptions: legendOptions.show ? legendOptions : null,
        filterGroups: cleanedGroups,
        panelOrder: panel?.panelOrder ?? 0,
      };

      let saved: DashboardPanel;
      if (isEdit) {
        saved = await ApiClient.updatePanel(panel!.id, payload);
      } else {
        saved = await ApiClient.createPanel(dashboard.id, payload);
      }
      onSave(saved);
    } catch (e: any) {
      console.error('Failed to save panel:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0 px-4 md:px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Panel"
            className="flex-1 md:flex-none px-3 min-h-[44px] md:min-h-0 md:py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 md:w-64"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 md:flex-none px-4 min-h-[44px] md:min-h-0 md:py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 md:flex-none px-4 min-h-[44px] md:min-h-0 md:py-1.5 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Panel'}
          </button>
        </div>
      </div>

      {/* Chart settings toolbar */}
      <div className="flex flex-wrap items-center gap-3 md:gap-4 px-4 md:px-5 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Chart</span>
          <div className="flex border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
            {(['bar', 'line'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  chartType === t
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="hidden md:block w-px h-5 bg-gray-300 dark:bg-gray-600" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Series</span>
          <div className="flex border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
            {(
              [
                { value: 'two_series', label: 'Two Series' },
                { value: 'net_amount', label: 'Net Amount' },
              ] as const
            ).map((s) => (
              <button
                key={s.value}
                onClick={() => setSeriesMode(s.value)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  seriesMode === s.value
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {seriesMode === 'net_amount' && (
          <>
            <div className="hidden md:block w-px h-5 bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Orientation</span>
              <div className="flex border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
                {(
                  [
                    { value: 'income_positive', label: 'Income \u2191' },
                    { value: 'expense_positive', label: 'Expense \u2191' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setNetOrientation(o.value)}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      netOrientation === o.value
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <div className="hidden md:block w-px h-5 bg-gray-300 dark:bg-gray-600" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Legend</span>
          <button
            onClick={() => setLegendOptions((prev) => ({ ...prev, show: !prev.show }))}
            className={`px-3 py-1 text-xs font-medium rounded border transition-colors ${
              legendOptions.show
                ? 'bg-blue-500 text-white border-blue-500'
                : 'text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {legendOptions.show ? 'On' : 'Off'}
          </button>
          {legendOptions.show && (
            <div className="flex border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
              {(['min', 'max', 'avg', 'total'] as const).map((stat) => (
                <button
                  key={stat}
                  onClick={() => setLegendOptions((prev) => ({ ...prev, [stat]: !prev[stat] }))}
                  className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    legendOptions[stat]
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {stat}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div
        className="px-4 md:px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0"
        style={{ height: isMobile ? 220 : legendOptions.show ? 310 : 280 }}
      >
        <PanelChart
          data={chartData}
          chartType={chartType}
          seriesMode={seriesMode}
          netOrientation={netOrientation}
          loading={chartLoading}
          emptyMessage="No data for selected filters"
          height={legendOptions.show ? '85%' : '100%'}
        />
        <ChartLegend data={chartData} legendOptions={legendOptions} seriesMode={seriesMode} />
      </div>

      {/* Bottom section: Filters + Preview */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 border-t border-gray-200 dark:border-gray-700 overflow-y-auto md:overflow-hidden">
        {/* Filter builder (left) */}
        <div className="w-full md:w-3/5 md:overflow-y-auto p-4 md:p-5 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700">
          <FilterBuilder
            filterGroups={filterGroups}
            onChange={setFilterGroups}
            categories={categories}
            allLabels={allLabels}
          />
        </div>

        {/* Transaction preview (right) */}
        <div className="w-full md:w-2/5 md:overflow-y-auto p-4 md:p-5">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Matching Transactions
          </div>
          <TransactionPreview
            transactions={previewTransactions}
            total={previewTotal}
            loading={previewLoading}
          />
        </div>
      </div>
    </div>
  );
};
