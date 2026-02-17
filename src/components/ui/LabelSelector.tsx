import React, { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface LabelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLabel: (label: string) => void;
  existingLabels: string[];
  allLabels: string[];
  maxLabels: number;
  position: { x: number; y: number };
}

export const LabelSelector: React.FC<LabelSelectorProps> = ({
  isOpen,
  onClose,
  onAddLabel,
  existingLabels,
  allLabels,
  maxLabels,
  position
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredLabels, setFilteredLabels] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    // Get recently used labels (excluding already added ones)
    const recentlyUsedLabels = allLabels
      .filter(label => !existingLabels.includes(label))
      .slice(0, 2);

    if (searchTerm.trim() === '') {
      setFilteredLabels(recentlyUsedLabels);
    } else {
      const filtered = allLabels
        .filter(label => 
          !existingLabels.includes(label) &&
          label.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .slice(0, 5);
      setFilteredLabels(filtered);
    }
  }, [searchTerm, allLabels, existingLabels]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTerm = searchTerm.trim();
    if (trimmedTerm && !existingLabels.includes(trimmedTerm)) {
      onAddLabel(trimmedTerm);
      setSearchTerm('');
      onClose();
    }
  };

  const handleLabelClick = (label: string) => {
    onAddLabel(label);
    setSearchTerm('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen || existingLabels.length >= maxLabels) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      
      {/* Label Selector */}
      <div
        className="fixed z-50 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 min-w-64 max-w-80"
        style={{
          left: position.x,
          top: position.y,
          transform: 'translate(-50%, -100%)',
          marginTop: '-8px'
        }}
      >
        <div className="p-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              Add Label
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={16} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to search or create new label..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </form>
        </div>

        <div className="max-h-48 overflow-y-auto">
          {filteredLabels.length > 0 ? (
            <div className="py-1">
              {filteredLabels.map((label) => (
                <button
                  key={label}
                  onClick={() => handleLabelClick(label)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center space-x-2"
                >
                  <Plus size={14} className="text-gray-400" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ) : searchTerm.trim() !== '' ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              Press Enter to create "{searchTerm.trim()}"
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              No labels available
            </div>
          )}
        </div>
      </div>
    </>
  );
}; 