import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Subscription } from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { STATUS_LABEL } from './SubscriptionRow';

interface Props {
  target: Subscription;
  onMerge: (sourceIds: string[], name: string) => void;
  onCancel: () => void;
}

const CUSTOM = '__custom__';

export const SubscriptionMergePicker: React.FC<Props> = ({ target, onMerge, onCancel }) => {
  const [all, setAll] = useState<Subscription[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<'pick' | 'name'>('pick');
  const [nameChoice, setNameChoice] = useState(target.id);
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    let cancelled = false;
    void ApiClient.listSubscriptions({ limit: 500 }).then((res) => {
      if (!cancelled) setAll(res.subscriptions.filter((s) => s.id !== target.id));
    });
    return () => {
      cancelled = true;
    };
  }, [target.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, query]);

  const nameOptions = useMemo(
    () => [target, ...all.filter((s) => picked.has(s.id))],
    [target, all, picked]
  );

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chosenName =
    nameChoice === CUSTOM
      ? customName.trim()
      : (nameOptions.find((s) => s.id === nameChoice)?.name ?? target.name);

  if (step === 'name') {
    return (
      <div className="flex flex-col h-full">
        <p className="pb-3 text-sm text-gray-600 dark:text-gray-400">
          Merging {nameOptions.length} subscriptions. All their charges will be combined into one.
          Pick a name:
        </p>
        <div className="flex-1 overflow-y-auto -mx-4">
          {nameOptions.map((s) => (
            <label
              key={s.id}
              className="px-4 py-3 min-h-[56px] border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 cursor-pointer"
            >
              <input
                type="radio"
                name="merge-name"
                checked={nameChoice === s.id}
                onChange={() => setNameChoice(s.id)}
              />
              <span className="font-medium text-gray-900 dark:text-white truncate">{s.name}</span>
            </label>
          ))}
          <label className="px-4 py-3 min-h-[56px] border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="merge-name"
              checked={nameChoice === CUSTOM}
              onChange={() => setNameChoice(CUSTOM)}
            />
            <input
              value={customName}
              onChange={(e) => {
                setCustomName(e.target.value);
                setNameChoice(CUSTOM);
              }}
              onFocus={() => setNameChoice(CUSTOM)}
              placeholder="Custom name"
              className="flex-1 px-3 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
            />
          </label>
        </div>
        <div className="pt-3 border-t border-gray-200 dark:border-gray-800 flex gap-2 safe-bottom">
          <button
            onClick={() => setStep('pick')}
            className="flex-1 py-3 min-h-[48px] rounded-lg border border-gray-300 dark:border-gray-700"
          >
            Back
          </button>
          <button
            onClick={() => onMerge(Array.from(picked), chosenName)}
            disabled={!chosenName}
            className="flex-1 py-3 min-h-[48px] rounded-lg bg-blue-600 text-white disabled:opacity-50"
          >
            Merge
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="pb-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 min-h-[48px]">
          <Search size={16} className="text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subscriptions"
            className="flex-1 bg-transparent outline-none text-sm md:text-base"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto -mx-4">
        {filtered.map((s) => {
          const isPicked = picked.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => togglePick(s.id)}
              className={`w-full text-left px-4 py-3 min-h-[56px] border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 ${
                isPicked ? 'bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              <input type="checkbox" readOnly checked={isPicked} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-white truncate">{s.name}</div>
                <div className="text-xs text-gray-500">
                  ${s.expected_amount.toFixed(2)} · {s.cadence} · {s.member_count} charges ·{' '}
                  {STATUS_LABEL[s.status]}
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
          onClick={() => setStep('name')}
          disabled={picked.size === 0}
          className="flex-1 py-3 min-h-[48px] rounded-lg bg-blue-600 text-white disabled:opacity-50"
        >
          Next {picked.size > 0 ? `(${picked.size})` : ''}
        </button>
      </div>
    </div>
  );
};
