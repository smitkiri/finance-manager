import React from 'react';

interface ListRowProps {
  primary: React.ReactNode;
  amount: React.ReactNode;
  meta: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}

export const ListRow: React.FC<ListRowProps> = ({
  primary,
  amount,
  meta,
  trailing,
  onClick,
  ariaLabel,
}) => {
  const interactive = !!onClick;
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      className={`w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-4 py-3 min-h-[56px] md:min-h-0 md:py-2 md:px-3 ${
        interactive
          ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 font-medium text-gray-900 dark:text-white truncate">
          {primary}
        </div>
        <div className="flex-shrink-0 font-semibold tabular-nums">{amount}</div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-xs md:text-[11px] text-gray-500 dark:text-gray-400 truncate">
          {meta}
        </div>
        {trailing && <div className="flex-shrink-0">{trailing}</div>}
      </div>
    </div>
  );
};
