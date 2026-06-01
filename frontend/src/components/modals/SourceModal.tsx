import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2 } from 'lucide-react';
import { StandardizedColumn, CSVPreview, Source } from '../../types';
import { Sheet } from '../ui/Sheet';

interface SourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  csvPreview: CSVPreview;
  existingSources: Source[];
  onSaveSource: (source: Source, userId: string) => void;
  onImportWithSource: (source: Source, userId: string) => void;
  onDeleteSource: (id: string) => void;
  users: { id: string; name: string }[];
}

const STANDARDIZED_COLUMNS: StandardizedColumn[] = [
  'Transaction Date',
  'Description',
  'Category',
  'Amount',
];

export const SourceModal: React.FC<SourceModalProps> = ({
  isOpen,
  onClose,
  csvPreview,
  existingSources,
  onSaveSource,
  onImportWithSource,
  onDeleteSource,
  users,
}) => {
  const [sourceName, setSourceName] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [columnMappings, setColumnMappings] = useState<
    { csvColumn: string; standardColumn: StandardizedColumn | 'Ignore' }[]
  >([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [flipIncomeExpense, setFlipIncomeExpense] = useState(false);

  useEffect(() => {
    if (isOpen && csvPreview.headers.length > 0) {
      setColumnMappings(
        csvPreview.headers.map((header) => ({
          csvColumn: header,
          standardColumn: 'Ignore' as const,
        }))
      );
      setSelectedUser('');
      setFlipIncomeExpense(false);
    }
  }, [isOpen, csvPreview.headers, users]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.user-dropdown')) {
        setIsUserDropdownOpen(false);
      }
    };

    if (isUserDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserDropdownOpen]);

  const handleSourceChange = (csvColumn: string, standardColumn: StandardizedColumn | 'Ignore') => {
    setColumnMappings((prev) =>
      prev.map((mapping) =>
        mapping.csvColumn === csvColumn ? { ...mapping, standardColumn } : mapping
      )
    );
  };

  const validateSource = (): string[] => {
    const newErrors: string[] = [];

    const mappedColumns = columnMappings
      .filter((m) => m.standardColumn !== 'Ignore')
      .map((m) => m.standardColumn);

    const requiredColumns: StandardizedColumn[] = ['Transaction Date', 'Description', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !mappedColumns.includes(col));
    if (missingColumns.length > 0) {
      newErrors.push(`Missing required columns: ${missingColumns.join(', ')}`);
    }

    const standardColumnCounts = mappedColumns.reduce(
      (acc, col) => {
        acc[col] = (acc[col] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const duplicates = Object.entries(standardColumnCounts)
      .filter(([_, count]) => count > 1)
      .map(([col]) => col);

    if (duplicates.length > 0) {
      newErrors.push(`Duplicate mappings: ${duplicates.join(', ')}`);
    }

    return newErrors;
  };

  const handleSaveSource = () => {
    const validationErrors = validateSource();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (!sourceName.trim()) {
      setErrors(['Please enter a source name']);
      return;
    }
    if (!selectedUser) {
      setErrors(['Please select a user']);
      return;
    }
    if (
      existingSources.some((s) => s.name.trim().toLowerCase() === sourceName.trim().toLowerCase())
    ) {
      setErrors(['A source with this name already exists. Please choose a different name.']);
      return;
    }
    const newSource: Source = {
      id: Date.now().toString(),
      name: sourceName.trim(),
      mappings: columnMappings,
      flipIncomeExpense,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };
    onSaveSource(newSource, selectedUser);
    setSourceName('');
    setIsCreatingNew(false);
    setErrors([]);
  };

  const handleUseExistingSource = () => {
    if (!selectedUser) {
      setErrors(['Please select a user']);
      return;
    }
    const selectedSource = existingSources.find((s) => s.id === selectedSourceId);
    if (selectedSource) {
      onImportWithSource(selectedSource, selectedUser);
    }
  };

  const handleCreateNewSource = () => {
    setIsCreatingNew(true);
    setSelectedSourceId('');
    setSourceName('');
    setFlipIncomeExpense(false);
    setErrors([]);
  };

  const getAvailableStandardColumns = (currentMapping: {
    csvColumn: string;
    standardColumn: StandardizedColumn | 'Ignore';
  }) => {
    const usedColumns = columnMappings
      .filter((m) => m.csvColumn !== currentMapping.csvColumn && m.standardColumn !== 'Ignore')
      .map((m) => m.standardColumn);

    return STANDARDIZED_COLUMNS.filter((col) => !usedColumns.includes(col));
  };

  if (!isOpen) return null;

  const inputCls =
    'w-full px-3 py-3 min-h-[48px] text-base md:text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white';

  const renderNewSourceForm = (showCancelToList: boolean) => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Source Name
        </label>
        <input
          type="text"
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
          placeholder="Enter a name for this source..."
          className={inputCls}
        />
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Map CSV Columns</h3>
        <div className="space-y-3">
          {columnMappings.map((mapping, index) => (
            <div
              key={index}
              className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900 dark:text-white break-words">
                  {mapping.csvColumn}
                </span>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-gray-500 dark:text-gray-400 hidden md:inline">→</span>
                <select
                  value={mapping.standardColumn}
                  onChange={(e) =>
                    handleSourceChange(
                      mapping.csvColumn,
                      e.target.value as StandardizedColumn | 'Ignore'
                    )
                  }
                  className={inputCls + ' md:w-auto'}
                >
                  <option value="Ignore">Ignore</option>
                  {getAvailableStandardColumns(mapping).map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                  {mapping.standardColumn !== 'Ignore' &&
                    !getAvailableStandardColumns(mapping).includes(
                      mapping.standardColumn as StandardizedColumn
                    ) && <option value={mapping.standardColumn}>{mapping.standardColumn}</option>}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Import Options</h3>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="flipIncomeExpense"
                checked={flipIncomeExpense}
                onChange={(e) => setFlipIncomeExpense(e.target.checked)}
                className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <label
                htmlFor="flipIncomeExpense"
                className="text-sm font-medium text-gray-900 dark:text-white"
              >
                Flip Income/Expense Signs
              </label>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              If checked, positive values will be treated as expenses and negative values as income
            </div>
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
            Please fix the following errors:
          </h4>
          <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
            {errors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleSaveSource}
          className="flex-1 py-3 min-h-[48px] px-4 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors flex items-center justify-center space-x-2"
        >
          <Save size={16} />
          <span>Save Source & Import</span>
        </button>
        <button
          onClick={() => {
            if (showCancelToList) {
              setIsCreatingNew(false);
              setErrors([]);
            } else {
              onClose();
            }
          }}
          className="py-3 min-h-[48px] px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Sheet isOpen={isOpen} onClose={onClose} title="Add New Source">
        <div>
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              CSV Preview ({csvPreview.totalRows} rows)
            </h3>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    {csvPreview.headers.map((header, index) => (
                      <th
                        key={index}
                        className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.sampleRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-gray-100 dark:border-gray-800">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="py-2 px-3 text-gray-600 dark:text-gray-400 whitespace-nowrap"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              User
            </label>
            <div className="relative user-dropdown">
              <button
                type="button"
                onClick={() => users.length > 0 && setIsUserDropdownOpen(!isUserDropdownOpen)}
                disabled={users.length === 0}
                className={
                  inputCls +
                  ' text-left flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                }
              >
                <span
                  className={
                    selectedUser
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }
                >
                  {users.length === 0
                    ? 'No users available'
                    : selectedUser
                      ? users.find((u) => u.id === selectedUser)?.name
                      : 'Select user'}
                </span>
                {users.length > 0 && (
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isUserDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                )}
              </button>

              {isUserDropdownOpen && users.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {users.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedUser(user.id);
                        setIsUserDropdownOpen(false);
                      }}
                      className="w-full px-3 py-3 min-h-[48px] text-left hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors first:rounded-t-lg last:rounded-b-lg"
                    >
                      <span className="text-gray-900 dark:text-white">{user.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {existingSources.length > 0 && !isCreatingNew && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Use Existing Source
              </h3>
              <div className="space-y-3">
                {existingSources.map((source) => (
                  <div
                    key={source.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedSourceId === source.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    onClick={() => setSelectedSourceId(source.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-medium text-gray-900 dark:text-white truncate">
                          {source.name}
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Created: {new Date(source.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">
                          {
                            source.mappings.filter(
                              (m: { standardColumn: StandardizedColumn | 'Ignore' }) =>
                                m.standardColumn !== 'Ignore'
                            ).length
                          }{' '}
                          columns mapped
                        </span>
                        <button
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                          title="Delete source"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(source.id);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleUseExistingSource}
                  disabled={!selectedSourceId || !selectedUser}
                  className="w-full py-3 min-h-[48px] px-4 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
                >
                  Use Selected Source
                </button>
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-900 text-gray-500">or</span>
                </div>
              </div>
            </div>
          )}

          {!isCreatingNew && existingSources.length > 0 && (
            <button
              onClick={handleCreateNewSource}
              className="w-full py-3 min-h-[48px] px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <Plus size={20} className="mx-auto mb-2" />
              Add New Source
            </button>
          )}

          {isCreatingNew && renderNewSourceForm(true)}

          {existingSources.length === 0 && !isCreatingNew && renderNewSourceForm(false)}
        </div>
      </Sheet>

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Delete Source?
            </h3>
            <p className="mb-6 text-gray-700 dark:text-gray-300">
              Are you sure you want to delete this source? This action cannot be undone.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                className="py-3 min-h-[48px] px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                className="py-3 min-h-[48px] px-4 rounded-lg bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  onDeleteSource(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
