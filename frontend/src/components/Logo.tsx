import React from 'react';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 220 72"
    className={className}
    role="img"
    aria-label="Tally"
  >
    <g stroke="#2563eb" strokeWidth="6" strokeLinecap="round" fill="none">
      <line x1="12" y1="16" x2="12" y2="56" />
      <line x1="26" y1="16" x2="26" y2="56" />
      <line x1="40" y1="16" x2="40" y2="56" />
      <line x1="54" y1="16" x2="54" y2="56" />
      <line x1="6" y1="50" x2="60" y2="22" />
    </g>
    <text
      x="78"
      y="51"
      fontFamily="Inter, system-ui, -apple-system, sans-serif"
      fontSize="38"
      fontWeight="700"
      fill="currentColor"
      letterSpacing="-1.5"
    >
      tally
    </text>
  </svg>
);
