import React from 'react';
import { X, Plus } from 'lucide-react';
import { FilterCondition, FilterGroup } from '../../types';

interface FilterBuilderProps {
  filterGroups: FilterGroup[];
  onChange: (filterGroups: FilterGroup[]) => void;
  categories: string[];
  allLabels: string[];
}

const FIELD_OPTIONS: { value: FilterCondition['field']; label: string }[] = [
  { value: 'type', label: 'Type' },
  { value: 'category', label: 'Category' },
  { value: 'labels', label: 'Labels' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
];

const OPERATORS_BY_FIELD: Record<FilterCondition['field'], { value: string; label: string }[]> = {
  type: [{ value: 'is', label: 'is' }],
  category: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
  ],
  labels: [
    { value: 'includes', label: 'includes' },
    { value: 'excludes', label: 'excludes' },
  ],
  description: [{ value: 'matches', label: 'matches' }],
  amount: [
    { value: 'gte', label: '>=' },
    { value: 'lte', label: '<=' },
  ],
};

function defaultOperator(field: FilterCondition['field']): string {
  return OPERATORS_BY_FIELD[field][0].value;
}

function defaultValue(field: FilterCondition['field']): FilterCondition['value'] {
  if (field === 'category' || field === 'labels') return [];
  if (field === 'amount') return '';
  return '';
}

const ConditionValueInput: React.FC<{
  condition: FilterCondition;
  categories: string[];
  allLabels: string[];
  onChange: (value: FilterCondition['value']) => void;
}> = ({ condition, categories, allLabels, onChange }) => {
  const { field, value } = condition;

  if (field === 'type') {
    return (
      <select
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-[48px] md:min-h-0 px-2 md:py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Select...</option>
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select>
    );
  }

  if (field === 'category') {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="w-full flex flex-wrap gap-1 p-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded min-h-[48px] md:min-h-[34px] max-h-24 overflow-y-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              const next = selected.includes(cat)
                ? selected.filter((c) => c !== cat)
                : [...selected, cat];
              onChange(next);
            }}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              selected.includes(cat)
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-gray-500 text-gray-400 hover:border-blue-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
    );
  }

  if (field === 'labels') {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="w-full flex flex-wrap gap-1 p-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded min-h-[48px] md:min-h-[34px] max-h-24 overflow-y-auto">
        {allLabels.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              const next = selected.includes(label)
                ? selected.filter((l) => l !== label)
                : [...selected, label];
              onChange(next);
            }}
            className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
              selected.includes(label)
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-gray-500 text-gray-400 hover:border-blue-400'
            }`}
          >
            {label}
          </button>
        ))}
        {allLabels.length === 0 && (
          <span className="text-xs text-gray-500 px-1">No labels available</span>
        )}
      </div>
    );
  }

  if (field === 'amount') {
    return (
      <input
        type="number"
        value={value as number | string}
        onChange={(e) => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))}
        placeholder="0.00"
        className="w-full min-h-[48px] md:min-h-0 px-2 md:py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  }

  // description
  return (
    <input
      type="text"
      value={(value as string) || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="regex pattern (e.g. uber|lyft)"
      className="w-full min-h-[48px] md:min-h-0 px-2 md:py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
};

export const FilterBuilder: React.FC<FilterBuilderProps> = ({
  filterGroups,
  onChange,
  categories,
  allLabels,
}) => {
  const updateCondition = (gi: number, ci: number, updates: Partial<FilterCondition>) => {
    const next = filterGroups.map((g, gIdx) => {
      if (gIdx !== gi) return g;
      return {
        ...g,
        conditions: g.conditions.map((c, cIdx) => {
          if (cIdx !== ci) return c;
          return { ...c, ...updates };
        }),
      };
    });
    onChange(next);
  };

  const addCondition = (gi: number) => {
    const next = filterGroups.map((g, gIdx) => {
      if (gIdx !== gi) return g;
      return {
        ...g,
        conditions: [...g.conditions, { field: 'type' as const, operator: 'is', value: '' }],
      };
    });
    onChange(next);
  };

  const removeCondition = (gi: number, ci: number) => {
    const group = filterGroups[gi];
    if (group.conditions.length <= 1) {
      // Remove the entire group
      onChange(filterGroups.filter((_, i) => i !== gi));
    } else {
      const next = filterGroups.map((g, gIdx) => {
        if (gIdx !== gi) return g;
        return { ...g, conditions: g.conditions.filter((_, i) => i !== ci) };
      });
      onChange(next);
    }
  };

  const addGroup = () => {
    onChange([
      ...filterGroups,
      { conditions: [{ field: 'type' as const, operator: 'is', value: '' }] },
    ]);
  };

  const removeGroup = (gi: number) => {
    onChange(filterGroups.filter((_, i) => i !== gi));
  };

  const handleFieldChange = (gi: number, ci: number, newField: FilterCondition['field']) => {
    updateCondition(gi, ci, {
      field: newField,
      operator: defaultOperator(newField),
      value: defaultValue(newField),
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Filters</span>
      </div>

      {filterGroups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && (
            <div className="text-center my-2">
              <span className="text-xs font-semibold text-amber-400">OR</span>
            </div>
          )}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-2 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Group {gi + 1}</span>
              <button
                type="button"
                onClick={() => removeGroup(gi)}
                className="text-red-400 hover:text-red-300 text-xs min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center -mr-2 md:mr-0"
              >
                <X size={14} />
              </button>
            </div>

            {group.conditions.map((cond, ci) => (
              <React.Fragment key={ci}>
                {ci > 0 && (
                  <div className="text-center my-1">
                    <span className="text-xs text-indigo-400 font-medium">AND</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] items-start gap-2 md:gap-3 mb-1">
                  {/* Field */}
                  <select
                    value={cond.field}
                    onChange={(e) =>
                      handleFieldChange(gi, ci, e.target.value as FilterCondition['field'])
                    }
                    className="w-full md:min-w-[100px] min-h-[48px] md:min-h-0 px-2 md:py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  {/* Operator */}
                  <select
                    value={cond.operator}
                    onChange={(e) => updateCondition(gi, ci, { operator: e.target.value })}
                    className="w-full md:w-auto md:min-w-[70px] min-h-[48px] md:min-h-0 px-2 md:py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {OPERATORS_BY_FIELD[cond.field].map((op) => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  {/* Value */}
                  <ConditionValueInput
                    condition={cond}
                    categories={categories}
                    allLabels={allLabels}
                    onChange={(val) => updateCondition(gi, ci, { value: val })}
                  />

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeCondition(gi, ci)}
                    className="text-red-400 hover:text-red-300 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 md:p-1.5 flex items-center justify-center justify-self-end md:justify-self-auto flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              </React.Fragment>
            ))}

            <button
              type="button"
              onClick={() => addCondition(gi)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 w-full md:w-auto justify-center md:justify-start min-h-[44px] md:min-h-0"
            >
              <Plus size={12} /> Add condition
            </button>
          </div>
        </React.Fragment>
      ))}

      <div className="text-center mt-3">
        <button
          type="button"
          onClick={addGroup}
          className="text-xs text-amber-400 hover:text-amber-300 border border-dashed border-amber-400/50 hover:border-amber-400 px-3 min-h-[44px] md:min-h-0 md:py-1.5 rounded-md transition-colors w-full md:w-auto flex items-center justify-center md:inline-flex"
        >
          <Plus size={12} className="inline mr-1" />
          Add OR group
        </button>
      </div>
    </div>
  );
};
