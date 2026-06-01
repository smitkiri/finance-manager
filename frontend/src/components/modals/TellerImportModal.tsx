import React, { useState, useMemo } from 'react';
import { Building2, Loader2, CheckCircle2 } from 'lucide-react';
import { Account, User, TellerImportPreviewAccount, TellerImportResult } from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { Sheet } from '../ui/Sheet';

interface Props {
  accounts: Account[];
  users: User[];
  categories: string[];
  onClose: () => void;
  onImportComplete: (totalAdded: number) => void;
}

type Step = 'configure' | 'previewing' | 'category-review' | 'preview' | 'importing' | 'done';
type DateMode = 'month' | 'custom';

function getMonthOptions(): { label: string; start: string; end: string }[] {
  const options = [];
  const today = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    options.push({ label, start, end });
  }
  return options;
}

export function TellerImportModal({
  accounts,
  users,
  categories,
  onClose,
  onImportComplete,
}: Props) {
  const tellerAccounts = useMemo(() => accounts.filter((a) => a.tellerAccountId), [accounts]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const [step, setStep] = useState<Step>('configure');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateMode, setDateMode] = useState<DateMode>('month');
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [previewToken, setPreviewToken] = useState('');
  const [previewAccounts, setPreviewAccounts] = useState<TellerImportPreviewAccount[]>([]);
  const [newCategories, setNewCategories] = useState<string[]>([]);
  const [categoryChoices, setCategoryChoices] = useState<Record<string, string>>({});
  const [importSessions, setImportSessions] = useState<TellerImportResult[]>([]);
  const [reconnectAccounts, setReconnectAccounts] = useState<string[]>([]);
  const [error, setError] = useState('');

  function toggleAccount(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getDateRange(): { startDate: string; endDate: string } {
    if (dateMode === 'month') {
      const opt = monthOptions[selectedMonth];
      return { startDate: opt.start, endDate: opt.end };
    }
    return { startDate: customStart, endDate: customEnd };
  }

  async function handlePreview() {
    setError('');
    setStep('previewing');
    try {
      const { startDate, endDate } = getDateRange();
      const result = await ApiClient.tellerPreviewImport(
        Array.from(selectedIds),
        startDate,
        endDate
      );
      setPreviewToken(result.previewToken);
      setPreviewAccounts(result.accounts);
      setReconnectAccounts([]);
      const incoming = result.newCategories ?? [];
      setNewCategories(incoming);
      const choices: Record<string, string> = {};
      for (const cat of incoming) choices[cat] = '';
      setCategoryChoices(choices);
      setStep(incoming.length > 0 ? 'category-review' : 'preview');
    } catch (e: any) {
      if (e?.message === 'reconnect_required' && Array.isArray(e.accounts)) {
        setReconnectAccounts(e.accounts);
        setError('');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to preview import');
        setReconnectAccounts([]);
      }
      setStep('configure');
    }
  }

  async function handleImport() {
    setError('');
    setStep('importing');
    try {
      const userMappings: Record<string, string> = {};
      for (const [newCat, choice] of Object.entries(categoryChoices)) {
        if (choice !== '') userMappings[newCat] = choice;
      }
      const result = await ApiClient.tellerImportTransactions(previewToken, userMappings);
      const totalAdded = result.sessions.reduce((sum, s) => sum + s.added, 0);
      setImportSessions(result.sessions);
      onImportComplete(totalAdded);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import transactions');
      setStep('preview');
    }
  }

  const totalNew = previewAccounts.reduce((sum, a) => sum + a.newCount, 0);
  const canPreview =
    selectedIds.size > 0 &&
    (dateMode === 'month' || (customStart !== '' && customEnd !== '' && customEnd >= customStart));

  const inputCls =
    'w-full px-3 py-3 min-h-[48px] text-base md:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white';

  const title = (
    <div className="flex items-center space-x-2">
      <Building2 size={20} className="text-blue-600" />
      <span>Import from Bank</span>
    </div>
  );

  return (
    <Sheet isOpen={true} onClose={onClose} title={title}>
      <div>
        {reconnectAccounts.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
            <p className="font-medium mb-1">
              The following account{reconnectAccounts.length !== 1 ? 's need' : ' needs'} to be
              reconnected in Settings before importing:
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {reconnectAccounts.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {(step === 'configure' || step === 'previewing') && (
          <>
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select accounts
                </p>
                {tellerAccounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedIds.size === tellerAccounts.length) {
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(tellerAccounts.map((a) => a.id)));
                      }
                    }}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline min-h-[44px] px-2"
                  >
                    {selectedIds.size === tellerAccounts.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {tellerAccounts.map((account) => (
                  <label
                    key={account.id}
                    className="flex items-center space-x-3 cursor-pointer p-3 min-h-[56px] border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(account.id)}
                      onChange={() => toggleAccount(account.id)}
                      className="w-5 h-5 text-blue-600 rounded border-gray-300 dark:border-gray-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {account.name}
                      </div>
                      {account.userId && userMap.has(account.userId) && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {userMap.get(account.userId)}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
                {tellerAccounts.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No bank accounts connected.
                  </p>
                )}
              </div>
            </div>

            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Date range
              </p>
              <div className="flex space-x-4 mb-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={dateMode === 'month'}
                    onChange={() => setDateMode('month')}
                    className="text-blue-600 w-4 h-4"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Month</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={dateMode === 'custom'}
                    onChange={() => setDateMode('custom')}
                    className="text-blue-600 w-4 h-4"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Custom</span>
                </label>
              </div>

              {dateMode === 'month' ? (
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className={inputCls}
                >
                  {monthOptions.map((opt, idx) => (
                    <option key={idx} value={idx}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className={inputCls}
                  />
                  <span className="hidden sm:inline text-gray-500 dark:text-gray-400">to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
            </div>

            <button
              onClick={handlePreview}
              disabled={!canPreview || step === 'previewing'}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {step === 'previewing' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Fetching transactions…</span>
                </>
              ) : (
                <span>Preview</span>
              )}
            </button>
          </>
        )}

        {step === 'category-review' && (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              The following categories from your bank don't exist yet. Keep them as new categories
              or map them to ones you already use.
            </p>
            <div className="mb-5 space-y-3 max-h-[50vh] overflow-y-auto">
              {newCategories.map((cat) => (
                <div
                  key={cat}
                  className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2"
                >
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200 break-words">
                    {cat}
                  </div>
                  <select
                    value={categoryChoices[cat] ?? ''}
                    onChange={(e) =>
                      setCategoryChoices((prev) => ({ ...prev, [cat]: e.target.value }))
                    }
                    className={inputCls}
                  >
                    <option value="">Keep as new category</option>
                    <option value="Uncategorized">Uncategorized</option>
                    {categories
                      .filter((c) => c !== 'Uncategorized')
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
              Mappings you choose will be remembered for future imports.
            </p>
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setStep('configure');
                  setError('');
                }}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline min-h-[48px] px-2"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep('preview')}
                className="px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Next →
              </button>
            </div>
          </>
        )}

        {(step === 'preview' || step === 'importing') && (
          <>
            <div className="mb-4 space-y-2">
              {previewAccounts.map((a) => (
                <div
                  key={a.accountId}
                  className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="text-sm text-gray-800 dark:text-gray-200 font-medium break-words">
                    {a.accountName}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-sm">
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {a.newCount} new
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {a.duplicateCount} already imported
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              {totalNew} new transaction{totalNew !== 1 ? 's' : ''} across{' '}
              {previewAccounts.filter((a) => a.newCount > 0).length} account
              {previewAccounts.filter((a) => a.newCount > 0).length !== 1 ? 's' : ''}
            </p>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setStep(newCategories.length > 0 ? 'category-review' : 'configure');
                  setError('');
                }}
                disabled={step === 'importing'}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 min-h-[48px] px-2"
              >
                ← Back
              </button>
              <button
                onClick={handleImport}
                disabled={totalNew === 0 || step === 'importing'}
                className="flex items-center space-x-2 px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {step === 'importing' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Importing…</span>
                  </>
                ) : (
                  <span>
                    Import {totalNew} Transaction{totalNew !== 1 ? 's' : ''}
                  </span>
                )}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="flex items-center space-x-2 mb-4">
              <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Import complete
              </p>
            </div>
            <div className="mb-5 space-y-2">
              {importSessions.map((s) => (
                <div
                  key={s.sessionId}
                  className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div className="text-sm text-gray-800 dark:text-gray-200 font-medium break-words">
                    {s.accountName}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-sm">
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {s.added} added
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">{s.skipped} skipped</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
