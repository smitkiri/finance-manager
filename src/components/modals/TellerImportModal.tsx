import React, { useState, useMemo } from 'react';
import { X, Building2, Loader2, CheckCircle2 } from 'lucide-react';
import { Account, User, TellerImportPreviewAccount, TellerImportResult } from '../../types';
import { LocalStorage } from '../../utils/storage';

interface Props {
  accounts: Account[];
  users: User[];
  categories: string[];
  onClose: () => void;
  onImportComplete: (totalAdded: number) => void;
}

type Step = 'configure' | 'previewing' | 'category-review' | 'preview' | 'importing' | 'done';
type DateMode = 'month' | 'custom';

// Returns current month + 12 previous months (13 total)
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

export function TellerImportModal({ accounts, users, categories, onClose, onImportComplete }: Props) {
  const tellerAccounts = useMemo(
    () => accounts.filter(a => a.tellerAccountId),
    [accounts]
  );

  const userMap = useMemo(
    () => new Map(users.map(u => [u.id, u.name])),
    [users]
  );

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
  // Maps a new category name to '' (keep as-is) or an existing category name (remap)
  const [categoryChoices, setCategoryChoices] = useState<Record<string, string>>({});
  const [importSessions, setImportSessions] = useState<TellerImportResult[]>([]);
  const [reconnectAccounts, setReconnectAccounts] = useState<string[]>([]);
  const [error, setError] = useState('');

  function toggleAccount(id: string) {
    setSelectedIds(prev => {
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
      const result = await LocalStorage.tellerPreviewImport(
        Array.from(selectedIds),
        startDate,
        endDate
      );
      setPreviewToken(result.previewToken);
      setPreviewAccounts(result.accounts);
      const incoming = result.newCategories ?? [];
      setNewCategories(incoming);
      // Initialize choices: all set to '' (keep as-is)
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
      // Only send explicit remappings (where user chose an existing category)
      const userMappings: Record<string, string> = {};
      for (const [newCat, choice] of Object.entries(categoryChoices)) {
        if (choice !== '') userMappings[newCat] = choice;
      }
      const result = await LocalStorage.tellerImportTransactions(previewToken, userMappings);
      const totalAdded = result.sessions.reduce((sum, s) => sum + s.added, 0);
      setImportSessions(result.sessions);
      // Notify parent first (triggers data refresh), then show done step
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Building2 size={20} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Import from Bank</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {reconnectAccounts.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
              <p className="font-medium mb-1">The following account{reconnectAccounts.length !== 1 ? 's need' : ' needs'} to be reconnected in Settings before importing:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {reconnectAccounts.map(name => <li key={name}>{name}</li>)}
              </ul>
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Step: configure + previewing spinner */}
          {(step === 'configure' || step === 'previewing') && (
            <>
              <div className="mb-5">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select accounts</p>
                <div className="space-y-2">
                  {tellerAccounts.map(account => (
                    <label key={account.id} className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(account.id)}
                        onChange={() => toggleAccount(account.id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-200">{account.name}</span>
                      {account.userId && userMap.has(account.userId) && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{userMap.get(account.userId)}</span>
                      )}
                    </label>
                  ))}
                  {tellerAccounts.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No bank accounts connected.</p>
                  )}
                </div>
              </div>

              <div className="mb-5">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date range</p>
                <div className="flex space-x-4 mb-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={dateMode === 'month'}
                      onChange={() => setDateMode('month')}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Month</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={dateMode === 'custom'}
                      onChange={() => setDateMode('custom')}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Custom</span>
                  </label>
                </div>

                {dateMode === 'month' ? (
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {monthOptions.map((opt, idx) => (
                      <option key={idx} value={idx}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <div className="flex space-x-2">
                    <input
                      type="date"
                      value={customStart}
                      onChange={e => setCustomStart(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <span className="self-center text-gray-500 dark:text-gray-400">to</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={e => setCustomEnd(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <button
                onClick={handlePreview}
                disabled={!canPreview || step === 'previewing'}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

          {/* Step: category-review */}
          {step === 'category-review' && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                The following categories from your bank don't exist yet. Keep them as new categories or map them to ones you already use.
              </p>
              <div className="mb-5 max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-gray-900">
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-2 font-medium">Bank Category</th>
                      <th className="pb-2 font-medium pl-4">Map To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newCategories.map(cat => (
                      <tr key={cat} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 text-gray-800 dark:text-gray-200 font-medium">{cat}</td>
                        <td className="py-2 pl-4">
                          <select
                            value={categoryChoices[cat] ?? ''}
                            onChange={e => setCategoryChoices(prev => ({ ...prev, [cat]: e.target.value }))}
                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          >
                            <option value="">Keep as new category</option>
                            {categories.filter(c => c !== 'Uncategorized').map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
                Mappings you choose will be remembered for future imports.
              </p>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStep('configure'); setError(''); }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep('preview')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {/* Step: preview summary + importing spinner */}
          {(step === 'preview' || step === 'importing') && (
            <>
              <div className="mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-2 font-medium">Account</th>
                      <th className="pb-2 font-medium text-right">New</th>
                      <th className="pb-2 font-medium text-right">Already Imported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewAccounts.map(a => (
                      <tr key={a.accountId} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 text-gray-800 dark:text-gray-200">{a.accountName}</td>
                        <td className="py-2 text-right font-medium text-green-600 dark:text-green-400">{a.newCount}</td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">{a.duplicateCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                {totalNew} new transaction{totalNew !== 1 ? 's' : ''} across {previewAccounts.filter(a => a.newCount > 0).length} account{previewAccounts.filter(a => a.newCount > 0).length !== 1 ? 's' : ''}
              </p>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStep(newCategories.length > 0 ? 'category-review' : 'configure'); setError(''); }}
                  disabled={step === 'importing'}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={totalNew === 0 || step === 'importing'}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {step === 'importing' ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Importing…</span>
                    </>
                  ) : (
                    <span>Import {totalNew} Transaction{totalNew !== 1 ? 's' : ''}</span>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Step: done — per-account summary */}
          {step === 'done' && (
            <>
              <div className="flex items-center space-x-2 mb-4">
                <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Import complete
                </p>
              </div>
              <div className="mb-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-2 font-medium">Account</th>
                      <th className="pb-2 font-medium text-right">Added</th>
                      <th className="pb-2 font-medium text-right">Skipped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importSessions.map(s => (
                      <tr key={s.sessionId} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 text-gray-800 dark:text-gray-200">{s.accountName}</td>
                        <td className="py-2 text-right font-medium text-green-600 dark:text-green-400">{s.added}</td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">{s.skipped}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
