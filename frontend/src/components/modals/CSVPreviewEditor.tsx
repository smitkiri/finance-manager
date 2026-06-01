import React, { useState } from 'react';
import { Save, Trash2, Check } from 'lucide-react';
import { CSVPreview, Source, StandardizedColumn } from '../../types';
import { Sheet } from '../ui/Sheet';

interface CSVPreviewEditorProps {
  isOpen: boolean;
  onClose: () => void;
  csvPreview: CSVPreview;
  source: Source;
  onImport: (editedData: string[][], source: Source) => void;
}

const CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Healthcare',
  'Utilities',
  'Housing',
  'Travel',
  'Education',
  'Business',
  'Personal Care',
  'Gifts',
  'Insurance',
  'Taxes',
  'Investments',
  'Income',
  'Other',
];

export const CSVPreviewEditor: React.FC<CSVPreviewEditorProps> = ({
  isOpen,
  onClose,
  csvPreview,
  source,
  onImport,
}) => {
  const [editedRows, setEditedRows] = useState<string[][]>(csvPreview.sampleRows);
  const [deletedRows, setDeletedRows] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [categoryOverrides, setCategoryOverrides] = useState<Record<number, string>>({});

  const getColumnIndex = (standardColumn: StandardizedColumn): number => {
    const mappingItem = source.mappings.find((m) => m.standardColumn === standardColumn);
    if (!mappingItem) return -1;
    return csvPreview.headers.findIndex((h) => h === mappingItem.csvColumn);
  };

  const getAmountIndex = () => getColumnIndex('Amount');

  const isValidRow = (row: string[], rowIndex: number): boolean => {
    const amountIndex = getAmountIndex();
    if (amountIndex === -1) return true;

    const amount = row[amountIndex];
    if (!amount || amount.trim() === '') return false;

    const numAmount = parseFloat(amount.replace(/[,$]/g, ''));
    return !isNaN(numAmount) && numAmount !== 0;
  };

  const handleDeleteRow = (rowIndex: number) => {
    setDeletedRows((prev) => new Set([...prev, rowIndex]));
  };

  const handleRestoreRow = (rowIndex: number) => {
    setDeletedRows((prev) => {
      const newSet = new Set(prev);
      newSet.delete(rowIndex);
      return newSet;
    });
  };

  const handleEditCell = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = [...editedRows];
    newRows[rowIndex] = [...newRows[rowIndex]];
    newRows[rowIndex][colIndex] = value;
    setEditedRows(newRows);
  };

  const handleCategoryOverride = (rowIndex: number, category: string) => {
    setCategoryOverrides((prev) => ({
      ...prev,
      [rowIndex]: category,
    }));
  };

  const handleImport = () => {
    const validRows = editedRows.filter(
      (row, index) => !deletedRows.has(index) && isValidRow(row, index)
    );

    const categoryIndex = getColumnIndex('Category');
    const rowsWithCategories = validRows.map((row, index) => {
      const newRow = [...row];
      if (categoryIndex === -1) {
        const category = categoryOverrides[index] || 'Uncategorized';
        newRow.push(category);
      } else if (categoryOverrides[index]) {
        newRow[categoryIndex] = categoryOverrides[index];
      }
      return newRow;
    });

    onImport(rowsWithCategories, source);
    onClose();
  };

  const getRowStatus = (row: string[], rowIndex: number) => {
    if (deletedRows.has(rowIndex)) return 'deleted';
    if (!isValidRow(row, rowIndex)) return 'invalid';
    return 'valid';
  };

  const getRowStatusColor = (status: string) => {
    switch (status) {
      case 'deleted':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'invalid':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      default:
        return 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800';
    }
  };

  const validRowsCount = editedRows.filter(
    (row, index) => !deletedRows.has(index) && isValidRow(row, index)
  ).length;

  const footer = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {validRowsCount} rows will be imported • {deletedRows.size} rows deleted
      </div>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 sm:flex-none px-4 py-3 min-h-[48px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleImport}
          disabled={validRowsCount === 0}
          className="flex-1 sm:flex-none px-4 py-3 min-h-[48px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
        >
          <Save size={16} />
          <span>Import {validRowsCount} Rows</span>
        </button>
      </div>
    </div>
  );

  return (
    <Sheet isOpen={isOpen} onClose={onClose} title="Edit CSV Data" footer={footer}>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {validRowsCount} of {editedRows.length} rows will be imported
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Valid row</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Invalid amount</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">Deleted</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300 w-16">
                  Actions
                </th>
                {csvPreview.headers.map((header, index) => (
                  <th
                    key={index}
                    className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap"
                  >
                    {header}
                  </th>
                ))}
                {getColumnIndex('Category') === -1 && (
                  <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    Category
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {editedRows.map((row, rowIndex) => {
                const status = getRowStatus(row, rowIndex);
                const isDeleted = deletedRows.has(rowIndex);

                return (
                  <tr
                    key={rowIndex}
                    className={`border-b border-gray-100 dark:border-gray-800 ${getRowStatusColor(status)}`}
                  >
                    <td className="py-2 px-3">
                      <div className="flex items-center space-x-1">
                        {isDeleted ? (
                          <button
                            onClick={() => handleRestoreRow(rowIndex)}
                            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                            title="Restore row"
                          >
                            <Check size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeleteRow(rowIndex)}
                            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            title="Delete row"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="py-2 px-3">
                        {editingCell?.row === rowIndex && editingCell?.col === cellIndex ? (
                          <input
                            type="text"
                            value={cell}
                            onChange={(e) => handleEditCell(rowIndex, cellIndex, e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') setEditingCell(null);
                              if (e.key === 'Escape') {
                                setEditingCell(null);
                                handleEditCell(
                                  rowIndex,
                                  cellIndex,
                                  editedRows[rowIndex][cellIndex]
                                );
                              }
                            }}
                            className="w-full px-2 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-base md:text-sm"
                            autoFocus
                          />
                        ) : (
                          <div
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-2 py-2 min-h-[44px] flex items-center rounded -mx-2 whitespace-nowrap"
                            onClick={() => setEditingCell({ row: rowIndex, col: cellIndex })}
                          >
                            {cell}
                          </div>
                        )}
                      </td>
                    ))}
                    {getColumnIndex('Category') === -1 && (
                      <td className="py-2 px-3">
                        <select
                          value={categoryOverrides[rowIndex] || 'Uncategorized'}
                          onChange={(e) => handleCategoryOverride(rowIndex, e.target.value)}
                          className="w-full px-2 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-base md:text-sm"
                        >
                          {CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Sheet>
  );
};
