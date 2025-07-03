import React, { useState, useEffect } from 'react';
import { X, Save, Plus } from 'lucide-react';
import { StandardizedColumn, ColumnMapping, CSVPreview } from '../types';

interface CSVMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  csvPreview: CSVPreview;
  existingMappings: ColumnMapping[];
  onSaveMapping: (mapping: ColumnMapping) => void;
  onImportWithMapping: (mapping: ColumnMapping) => void;
}

const STANDARDIZED_COLUMNS: StandardizedColumn[] = [
  'Transaction Date',
  'Description', 
  'Category',
  'Amount'
];

export const CSVMappingModal: React.FC<CSVMappingModalProps> = ({
  isOpen,
  onClose,
  csvPreview,
  existingMappings,
  onSaveMapping,
  onImportWithMapping
}) => {
  const [mappingName, setMappingName] = useState('');
  const [selectedMappingId, setSelectedMappingId] = useState<string>('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [columnMappings, setColumnMappings] = useState<{ csvColumn: string; standardColumn: StandardizedColumn | 'Ignore' }[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && csvPreview.headers.length > 0) {
      // Initialize mappings with all CSV columns set to 'Ignore'
      setColumnMappings(
        csvPreview.headers.map(header => ({
          csvColumn: header,
          standardColumn: 'Ignore' as const
        }))
      );
    }
  }, [isOpen, csvPreview.headers]);

  const handleMappingChange = (csvColumn: string, standardColumn: StandardizedColumn | 'Ignore') => {
    setColumnMappings(prev => 
      prev.map(mapping => 
        mapping.csvColumn === csvColumn 
          ? { ...mapping, standardColumn }
          : mapping
      )
    );
  };

  const validateMappings = (): string[] => {
    const newErrors: string[] = [];
    
    // Check if all required standardized columns are mapped
    const mappedColumns = columnMappings
      .filter(m => m.standardColumn !== 'Ignore')
      .map(m => m.standardColumn);
    
    const missingColumns = STANDARDIZED_COLUMNS.filter(col => !mappedColumns.includes(col));
    if (missingColumns.length > 0) {
      newErrors.push(`Missing required columns: ${missingColumns.join(', ')}`);
    }
    
    // Check for duplicate mappings
    const standardColumnCounts = mappedColumns.reduce((acc, col) => {
      acc[col] = (acc[col] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const duplicates = Object.entries(standardColumnCounts)
      .filter(([_, count]) => count > 1)
      .map(([col]) => col);
    
    if (duplicates.length > 0) {
      newErrors.push(`Duplicate mappings: ${duplicates.join(', ')}`);
    }
    
    return newErrors;
  };

  const handleSaveMapping = () => {
    const validationErrors = validateMappings();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }
    
    if (!mappingName.trim()) {
      setErrors(['Please enter a mapping name']);
      return;
    }
    
    const newMapping: ColumnMapping = {
      id: Date.now().toString(),
      name: mappingName.trim(),
      mappings: columnMappings,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };
    
    onSaveMapping(newMapping);
    setMappingName('');
    setIsCreatingNew(false);
    setErrors([]);
  };

  const handleUseExistingMapping = () => {
    const selectedMapping = existingMappings.find(m => m.id === selectedMappingId);
    if (selectedMapping) {
      onImportWithMapping(selectedMapping);
    }
  };

  const handleCreateNewMapping = () => {
    setIsCreatingNew(true);
    setSelectedMappingId('');
    setMappingName('');
    setErrors([]);
  };

  const getAvailableStandardColumns = (currentMapping: { csvColumn: string; standardColumn: StandardizedColumn | 'Ignore' }) => {
    const usedColumns = columnMappings
      .filter(m => m.csvColumn !== currentMapping.csvColumn && m.standardColumn !== 'Ignore')
      .map(m => m.standardColumn);
    
    return STANDARDIZED_COLUMNS.filter(col => !usedColumns.includes(col));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            CSV Column Mapping
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* CSV Preview */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              CSV Preview ({csvPreview.totalRows} rows)
            </h3>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    {csvPreview.headers.map((header, index) => (
                      <th key={index} className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.sampleRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b border-gray-100 dark:border-gray-800">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="py-2 px-3 text-gray-600 dark:text-gray-400">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Existing Mappings */}
          {existingMappings.length > 0 && !isCreatingNew && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Use Existing Mapping
              </h3>
              <div className="space-y-3">
                {existingMappings.map(mapping => (
                  <div
                    key={mapping.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedMappingId === mapping.id
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    onClick={() => setSelectedMappingId(mapping.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">{mapping.name}</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Created: {new Date(mapping.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {mapping.mappings.filter(m => m.standardColumn !== 'Ignore').length} columns mapped
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleUseExistingMapping}
                  disabled={!selectedMappingId}
                  className="w-full py-2 px-4 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
                >
                  Use Selected Mapping
                </button>
              </div>
              
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">or</span>
                </div>
              </div>
            </div>
          )}

          {/* Create New Mapping */}
          {(!isCreatingNew && existingMappings.length > 0) && (
            <button
              onClick={handleCreateNewMapping}
              className="w-full py-3 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
            >
              <Plus size={20} className="mx-auto mb-2" />
              Create New Mapping
            </button>
          )}

          {/* New Mapping Form */}
          {isCreatingNew && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mapping Name
                </label>
                <input
                  type="text"
                  value={mappingName}
                  onChange={(e) => setMappingName(e.target.value)}
                  placeholder="Enter a name for this mapping..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                  Map CSV Columns
                </h3>
                <div className="space-y-3">
                  {columnMappings.map((mapping, index) => (
                    <div key={index} className="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div className="flex-1">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {mapping.csvColumn}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-500 dark:text-gray-400">→</span>
                        <select
                          value={mapping.standardColumn}
                          onChange={(e) => handleMappingChange(mapping.csvColumn, e.target.value as StandardizedColumn | 'Ignore')}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="Ignore">Ignore</option>
                          {getAvailableStandardColumns(mapping).map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                          {mapping.standardColumn !== 'Ignore' && !getAvailableStandardColumns(mapping).includes(mapping.standardColumn as StandardizedColumn) && (
                            <option value={mapping.standardColumn}>{mapping.standardColumn}</option>
                          )}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Error Messages */}
              {errors.length > 0 && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Please fix the following errors:</h4>
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                    {errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleSaveMapping}
                  className="flex-1 py-2 px-4 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Save size={16} />
                  <span>Save Mapping & Import</span>
                </button>
                <button
                  onClick={() => {
                    setIsCreatingNew(false);
                    setErrors([]);
                  }}
                  className="py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* No existing mappings - show form directly */}
          {existingMappings.length === 0 && !isCreatingNew && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mapping Name
                </label>
                <input
                  type="text"
                  value={mappingName}
                  onChange={(e) => setMappingName(e.target.value)}
                  placeholder="Enter a name for this mapping..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                  Map CSV Columns
                </h3>
                <div className="space-y-3">
                  {columnMappings.map((mapping, index) => (
                    <div key={index} className="flex items-center space-x-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div className="flex-1">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {mapping.csvColumn}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-500 dark:text-gray-400">→</span>
                        <select
                          value={mapping.standardColumn}
                          onChange={(e) => handleMappingChange(mapping.csvColumn, e.target.value as StandardizedColumn | 'Ignore')}
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="Ignore">Ignore</option>
                          {getAvailableStandardColumns(mapping).map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                          {mapping.standardColumn !== 'Ignore' && !getAvailableStandardColumns(mapping).includes(mapping.standardColumn as StandardizedColumn) && (
                            <option value={mapping.standardColumn}>{mapping.standardColumn}</option>
                          )}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Error Messages */}
              {errors.length > 0 && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Please fix the following errors:</h4>
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                    {errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleSaveMapping}
                  className="flex-1 py-2 px-4 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Save size={16} />
                  <span>Save Mapping & Import</span>
                </button>
                <button
                  onClick={onClose}
                  className="py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 