import React, { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { CHART_COLORS } from './charts/colors';
import type { EverydayRow, EverydaySummary } from '../utils/everydaySpending';

interface EverydaySpendingCardProps {
  summary: EverydaySummary;
  pinned: string[];
  categories: string[];
  onChangePinned: (next: string[]) => void;
}

const SPARK_WIDTH = 90;
const SPARK_HEIGHT = 24;
const SPIKE_COLOR = '#dc2626';

const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const formatWhole = (amount: number): string => wholeDollars.format(amount);

const spikeDetail = (row: EverydayRow, month: string): string => {
  const entry = row.months.find((m) => m.month === month);
  if (!entry) return '';
  const multiple = (entry.amount / row.typical).toFixed(1);
  return `${month}: ${formatWhole(entry.amount)} — ${multiple}× a typical month. Plain average incl. spikes: ${formatWhole(row.plainMean)}.`;
};

interface SparklineProps {
  row: EverydayRow;
  color: string;
  onSpike: (month: string | null) => void;
}

const Sparkline: React.FC<SparklineProps> = ({ row, color, onSpike }) => {
  const pad = 3;
  const n = row.months.length;
  const top = row.max > 0 ? row.max : 1;
  const points = row.months.map((m, i) => ({
    ...m,
    x: n > 1 ? pad + (i * (SPARK_WIDTH - pad * 2)) / (n - 1) : SPARK_WIDTH / 2,
    y: SPARK_HEIGHT - pad - (m.amount / top) * (SPARK_HEIGHT - pad * 2),
  }));

  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        points={points.map((p) => `${p.x},${p.y}`).join(' ')}
      />
      {points
        .filter((p) => p.isSpike)
        .map((p) => (
          <circle
            key={p.month}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill={SPIKE_COLOR}
            className="cursor-pointer"
            onMouseEnter={() => onSpike(p.month)}
            onMouseLeave={() => onSpike(null)}
            onClick={() => onSpike(p.month)}
          />
        ))}
    </svg>
  );
};

export const EverydaySpendingCard: React.FC<EverydaySpendingCardProps> = ({
  summary,
  pinned,
  categories,
  onChangePinned,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(pinned);
  const [activeSpike, setActiveSpike] = useState<{ category: string; month: string } | null>(null);

  const openEditor = () => {
    setDraft(pinned);
    setIsEditing(true);
  };

  const toggleDraft = (category: string) => {
    setDraft((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const finishEditing = () => {
    onChangePinned(draft);
    setIsEditing(false);
  };

  const monthCount = summary.countedMonths.length;

  const renderBody = () => {
    if (pinned.length === 0) {
      return (
        <div className="py-4 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Pick the categories you spend on every month to see what a typical month costs.
          </p>
          <button
            type="button"
            onClick={openEditor}
            className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-md text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
          >
            Choose categories
          </button>
        </div>
      );
    }

    if (monthCount === 0) {
      return (
        <p className="py-4 text-sm text-gray-600 dark:text-gray-400">
          Pick a date range with at least one full past month.
        </p>
      );
    }

    return (
      <>
        <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_7rem_11rem_6rem] gap-x-4 pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <span>Category</span>
          <span className="text-right">Typical / mo</span>
          <span className="text-right">Range</span>
          <span className="text-center">Trend</span>
        </div>
        <ul className="divide-y divide-gray-200 dark:divide-gray-800 border-t border-gray-200 dark:border-gray-800">
          {summary.rows.map((row, index) => {
            const spikeMonths = row.months.filter((m) => m.isSpike);
            const peakSpike = spikeMonths.reduce<(typeof spikeMonths)[number] | null>(
              (best, m) => (best === null || m.amount > best.amount ? m : best),
              null
            );
            const showSpike = (month: string | null) =>
              setActiveSpike(month ? { category: row.category, month } : null);
            const detail =
              activeSpike?.category === row.category ? spikeDetail(row, activeSpike.month) : '';

            return (
              <li key={row.category} className="py-3 md:py-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_7rem_11rem_6rem] gap-x-4 gap-y-1 items-center">
                  <span className="text-sm text-gray-900 dark:text-white truncate">
                    {row.category}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                    {formatWhole(row.typical)}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 md:text-right tabular-nums">
                    <span>{`${formatWhole(row.min)} –`}</span>{' '}
                    {peakSpike ? (
                      <button
                        type="button"
                        className="font-semibold text-red-600 dark:text-red-400 underline decoration-dotted underline-offset-2"
                        onMouseEnter={() => showSpike(peakSpike.month)}
                        onMouseLeave={() => showSpike(null)}
                        onFocus={() => showSpike(peakSpike.month)}
                        onBlur={() => showSpike(null)}
                        onClick={() => showSpike(peakSpike.month)}
                      >
                        {`${formatWhole(row.max)} ▲`}
                      </button>
                    ) : (
                      <span>{formatWhole(row.max)}</span>
                    )}
                  </span>
                  <span className="flex justify-end md:justify-center">
                    <Sparkline
                      row={row}
                      color={CHART_COLORS[index % CHART_COLORS.length]}
                      onSpike={showSpike}
                    />
                  </span>
                </div>
                {detail && (
                  <p
                    role="status"
                    className="mt-1 text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md px-2 py-1"
                  >
                    {detail}
                  </p>
                )}
              </li>
            );
          })}
          <li className="py-3 md:py-2 border-t-2 border-gray-300 dark:border-gray-700">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_7rem_11rem_6rem] gap-x-4 items-center">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Total</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white text-right tabular-nums">
                {formatWhole(summary.totalTypical)}
              </span>
            </div>
          </li>
        </ul>
        {monthCount <= 2 && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {`Based on ${monthCount} ${monthCount === 1 ? 'month' : 'months'}.`}
          </p>
        )}
      </>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Everyday Spending</h3>
        {pinned.length > 0 && (
          <button
            type="button"
            aria-label="Edit everyday categories"
            onClick={openEditor}
            className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1 flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
          >
            <Pencil size={16} />
          </button>
        )}
      </div>

      {renderBody()}

      <Sheet
        isOpen={isEditing}
        onClose={() => setIsEditing(false)}
        title="Everyday categories"
        footer={
          <button
            type="button"
            onClick={finishEditing}
            className="w-full md:w-auto md:float-right px-4 py-2 min-h-[44px] md:min-h-0 rounded-md text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors"
          >
            Done
          </button>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Choose the categories you spend on every month.
        </p>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => {
            const isSelected = draft.includes(category);
            return (
              <button
                key={category}
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggleDraft(category)}
                className={`flex items-center space-x-1 px-3 py-2 md:py-1.5 min-h-[36px] md:min-h-0 rounded-md text-sm md:text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {isSelected && <Check size={12} />}
                <span>{category}</span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
};
