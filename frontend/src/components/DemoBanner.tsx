import React from 'react';

const REPO_URL = 'https://github.com/smitkiri/finance-manager';

interface DemoBannerProps {
  enabled: boolean;
}

export const DemoBanner: React.FC<DemoBannerProps> = ({ enabled }) => {
  if (!enabled) return null;

  return (
    <div className="bg-blue-600 text-white pl-16 pr-4 py-2 flex items-center justify-center text-xs md:text-sm">
      <span className="text-center">
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
    </div>
  );
};
