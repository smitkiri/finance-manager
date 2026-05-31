import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  size?: 'auto' | 'full';
}

export const Sheet: React.FC<SheetProps> = ({
  isOpen,
  onClose,
  title,
  footer,
  children,
  size = 'auto',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const containerCls =
    size === 'full'
      ? 'fixed inset-0 bg-white dark:bg-gray-900 flex flex-col'
      : 'fixed inset-0 bg-white dark:bg-gray-900 flex flex-col md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-2xl md:w-[90vw] md:max-h-[85vh] md:rounded-lg md:shadow-xl';

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 hidden md:block"
        onClick={onClose}
        aria-hidden="true"
      />
      <div role="dialog" aria-modal="true" className={`${containerCls} z-50`}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors -mr-2"
          >
            <X size={22} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <footer className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 flex-shrink-0 safe-bottom">
            {footer}
          </footer>
        )}
      </div>
    </>
  );
};
