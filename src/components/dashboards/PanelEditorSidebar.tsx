import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { DashboardPanel, Dashboard } from '../../types';
import { LocalStorage } from '../../utils/storage';
import { TransactionPreview } from './TransactionPreview';
import { generateId } from '../../utils';

interface PanelEditorSidebarProps {
  dashboard: Dashboard;
  panel: DashboardPanel | null; // null = create mode
  categories: string[];
  selectedUserId: string | null;
  dateRange: { start: Date; end: Date };
  onSave: (panel: DashboardPanel) => void;
  onClose: () => void;
}

const EMPTY_FORM = {
  title: '',
  chartType: 'bar' as 'bar' | 'line',
  filterType: 'both' as 'expense' | 'income' | 'both',
  filterCategories: [] as string[],
  filterRegex: '',
  seriesMode: 'two_series' as 'two_series' | 'net_amount',
  netOrientation: 'income_positive' as 'income_positive' | 'expense_positive',
};

export const PanelEditorSidebar: React.FC<PanelEditorSidebarProps> = ({
  dashboard,
  panel,
  categories,
  selectedUserId,
  dateRange,
  onSave,
  onClose,
}) => {
  const isEdit = !!panel;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [regexError, setRegexError] = useState('');
  const [previewTransactions, setPreviewTransactions] = useState<any[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Populate form when editing
  useEffect(() => {
    let formValues: typeof EMPTY_FORM;
    if (panel) {
      formValues = {
        title: panel.title,
        chartType: panel.chartType,
        filterType: panel.filterType,
        filterCategories: panel.filterCategories,
        filterRegex: panel.filterRegex || '',
        seriesMode: panel.seriesMode,
        netOrientation: panel.netOrientation || 'income_positive',
      };
    } else {
      formValues = { ...EMPTY_FORM };
    }
    setForm(formValues);
    setRegexError('');
    setPreviewTransactions([]);
    setPreviewTotal(0);
    fetchPreview(formValues);
  }, [panel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Validate regex
  const validateRegex = (value: string): boolean => {
    if (!value) { setRegexError(''); return true; }
    try { new RegExp(value); setRegexError(''); return true; }
    catch (e: any) { setRegexError(e.message); return false; }
  };

  // Debounced preview fetch
  const fetchPreview = useCallback((currentForm: typeof form) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      const types = currentForm.filterType === 'both' ? [] : [currentForm.filterType];
      const result = await LocalStorage.previewPanelTransactions({
        types,
        categories: currentForm.filterCategories,
        regex: currentForm.filterRegex || null,
        userId: selectedUserId,
        dateFrom: dateRange.start.toISOString().slice(0, 10),
        dateTo: dateRange.end.toISOString().slice(0, 10),
        limit: 10,
      });
      setPreviewTransactions(result.transactions);
      setPreviewTotal(result.total);
      setPreviewLoading(false);
    }, 400);
  }, [dateRange, selectedUserId]);

  const handleChange = (updates: Partial<typeof form>) => {
    const next = { ...form, ...updates };
    if ('filterRegex' in updates) validateRegex(updates.filterRegex || '');
    setForm(next);
    fetchPreview(next);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    if (form.filterRegex && !validateRegex(form.filterRegex)) return;
    setSaving(true);
    try {
      let saved: DashboardPanel;
      const payload = {
        id: panel?.id || generateId(),
        title: form.title.trim(),
        chartType: form.chartType,
        filterType: form.filterType,
        filterCategories: form.filterCategories,
        filterRegex: form.filterRegex || null,
        seriesMode: form.seriesMode,
        netOrientation: form.seriesMode === 'net_amount' ? form.netOrientation : null,
        panelOrder: panel?.panelOrder ?? 0,
      };
      if (isEdit) {
        saved = await LocalStorage.updatePanel(panel!.id, payload);
      } else {
        saved = await LocalStorage.createPanel(dashboard.id, payload);
      }
      onSave(saved);
    } catch (e: any) {
      console.error('Failed to save panel:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-25 z-40" onClick={onClose} />

      {/* Slide-in panel */}
      <div className="fixed right-0 top-0 h-full w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 z-50 flex flex-col shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Panel' : 'Add Panel'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => handleChange({ title: e.target.value })}
              placeholder="e.g. Uber / Lyft Spending"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Chart type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Chart Type</label>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {(['bar', 'line'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => handleChange({ chartType: type })}
                  className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
                    form.chartType === type
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Filter type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Transaction Type</label>
            <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              {(['both', 'expense', 'income'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => handleChange({ filterType: type })}
                  className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                    form.filterType === type
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Categories */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Categories <span className="text-gray-400 font-normal">(leave empty for all)</span>
            </label>
            <div className="flex flex-wrap gap-1 p-2 border border-gray-300 dark:border-gray-600 rounded-lg max-h-32 overflow-y-auto">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    const next = form.filterCategories.includes(cat)
                      ? form.filterCategories.filter(c => c !== cat)
                      : [...form.filterCategories, cat];
                    handleChange({ filterCategories: next });
                  }}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    form.filterCategories.includes(cat)
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Regex */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description Regex <span className="text-gray-400 font-normal">(POSIX, e.g. uber|lyft)</span>
            </label>
            <input
              type="text"
              value={form.filterRegex}
              onChange={e => handleChange({ filterRegex: e.target.value })}
              placeholder="uber|lyft"
              className={`w-full px-3 py-2 text-sm border rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 ${
                regexError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
              }`}
            />
            {regexError && <p className="mt-1 text-xs text-red-500">{regexError}</p>}
          </div>

          {/* Series mode */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Y-Axis Mode</label>
            <div className="space-y-2">
              {[
                { value: 'two_series', label: 'Two Series (Income & Expenses)' },
                { value: 'net_amount', label: 'Net Amount' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="seriesMode"
                    value={opt.value}
                    checked={form.seriesMode === opt.value}
                    onChange={() => handleChange({ seriesMode: opt.value as any })}
                    className="text-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Net orientation (only when net_amount) */}
          {form.seriesMode === 'net_amount' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Net Amount Orientation</label>
              <div className="space-y-2">
                {[
                  { value: 'income_positive', label: 'Income positive (surplus goes up)' },
                  { value: 'expense_positive', label: 'Expense positive (spending goes up)' },
                ].map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="netOrientation"
                      value={opt.value}
                      checked={form.netOrientation === opt.value}
                      onChange={() => handleChange({ netOrientation: opt.value as any })}
                      className="text-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Transaction preview */}
          <div>
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Transaction Preview</div>
            <TransactionPreview
              transactions={previewTransactions}
              total={previewTotal}
              loading={previewLoading}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.title.trim() || !!regexError || saving}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save Panel'}
          </button>
        </div>
      </div>
    </>
  );
};
