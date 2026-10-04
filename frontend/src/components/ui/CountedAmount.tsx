import React from 'react';
import { Expense } from '../../types';
import { formatCurrency } from '../../utils';
import { countedAmount, countState } from '../../utils/transferGroups';

interface CountedAmountProps {
  expense: Pick<
    Expense,
    'amount' | 'type' | 'effectiveAmount' | 'transferGroup' | 'excludedFromCalculations'
  >;
  selectedUserId?: string | null;
  size?: 'sm' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { primary: 'text-sm font-semibold', original: 'text-xs' },
  lg: { primary: 'text-3xl font-bold', original: 'text-base' },
};

/**
 * A transaction amount, shown sale-price style when a transfer/refund group
 * means only part of it counts: the original struck through, the counted
 * amount as the primary figure. Fully offset amounts are struck through alone.
 */
export const CountedAmount: React.FC<CountedAmountProps> = ({
  expense,
  selectedUserId = null,
  size = 'sm',
  className = '',
}) => {
  const sign = expense.type === 'expense' ? '-' : '+';
  const color =
    expense.type === 'expense'
      ? 'text-red-600 dark:text-red-400'
      : 'text-green-600 dark:text-green-400';
  const sizes = SIZES[size];
  const original = `${sign}${formatCurrency(expense.amount)}`;
  const state = countState(expense as Expense, selectedUserId);

  if (state === 'offset' && !expense.excludedFromCalculations) {
    const label = `Not counted: ${original} is offset`;
    return (
      <s
        aria-label={label}
        title={label}
        className={`${sizes.primary} tabular-nums text-gray-400 dark:text-gray-500 ${className}`}
      >
        {original}
      </s>
    );
  }

  if (state === 'partial') {
    const counted = formatCurrency(countedAmount(expense as Expense, selectedUserId));
    const label = `Counted ${counted} of ${formatCurrency(expense.amount)}`;
    return (
      <span
        aria-label={label}
        title={label}
        className={`inline-flex flex-col items-end md:flex-row md:items-baseline md:gap-1.5 tabular-nums ${className}`}
      >
        <span className={`${sizes.primary} ${color} md:order-2`}>
          {sign}
          {counted}
        </span>
        <s className={`${sizes.original} font-normal text-gray-400 dark:text-gray-500 md:order-1`}>
          {original}
        </s>
      </span>
    );
  }

  return <span className={`${sizes.primary} tabular-nums ${color} ${className}`}>{original}</span>;
};
