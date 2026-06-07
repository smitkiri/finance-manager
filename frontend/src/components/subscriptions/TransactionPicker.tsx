import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Expense } from '../../types';
import { ApiClient } from '../../utils/apiClient';

interface Props {
  excludeIds?: string[];
  onSelect: (txnIds: string[]) => void;
  onCancel: () => void;
}

export const TransactionPicker: React.FC<Props> = ({ excludeIds = [], onSelect, onCancel }) => {
  const [all, setAll] = useState<Expense[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void ApiClient.loadExpenses().then((rows) => {
      if (!cancelled) setAll(rows.filter((e) => e.type === 'expense'));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((e) => !excludeIds.includes(e.id))
      .filter((e) => !q || e.description.toLowerCase().includes(q))
      .slice(0, 100);
  }, [all, query, excludeIds]);

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="pb-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 min-h-[48px]">
          <Search size={16} className="text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions"
            className="flex-1 bg-transparent outline-none text-sm md:text-base"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto -mx-4">
        {filtered.map((e) => {
          const isPicked = picked.has(e.id);
          return (
            <button
              key={e.id}
              onClick={() => togglePick(e.id)}
              className={`w-full text-left px-4 py-3 min-h-[56px] border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 ${
                isPicked ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <input type="checkbox" readOnly checked={isPicked} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-white truncate">
                  {e.description}
                </div>
                <div className="text-xs text-gray-500">
                  {e.date} · ${Number(e.amount).toFixed(2)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="pt-3 border-t border-gray-200 dark:border-gray-800 flex gap-2 safe-bottom">
        <button
          onClick={onCancel}
          className="flex-1 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={() => onSelect(Array.from(picked))}
          disabled={picked.size === 0}
          className="flex-1 py-3 min-h-[48px] rounded-lg bg-blue-600 text-white disabled:opacity-50"
        >
          Add {picked.size > 0 ? `(${picked.size})` : ''}
        </button>
      </div>
    </div>
  );
};
