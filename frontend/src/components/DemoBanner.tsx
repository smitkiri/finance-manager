import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const STORAGE_KEY = 'demoBannerDismissed';
const REPO_URL = 'https://github.com/smitkiri/expense-tracker';

interface DemoBannerProps {
  enabled: boolean;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ enabled }) => {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      // ignore
    }
  }, []);

  if (!enabled || dismissed) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between text-sm">
      <span>
        🎈 You're in demo mode — data resets daily.{' '}
        <a
          href={REPO_URL}
          className="underline hover:no-underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          View on GitHub →
        </a>
      </span>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="p-1 hover:bg-blue-700 rounded transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
};
