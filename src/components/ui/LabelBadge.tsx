import React from 'react';
import { X } from 'lucide-react';

interface LabelBadgeProps {
  label: string;
  onRemove: () => void;
}

export const LabelBadge: React.FC<LabelBadgeProps> = ({ label, onRemove }) => {
  return (
    <div className="inline-flex items-center space-x-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium rounded-md border border-blue-200 dark:border-blue-700">
      <span>{label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 transition-colors"
      >
        <X size={10} />
      </button>
    </div>
  );
}; 