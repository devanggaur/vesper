import React from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * Vesper Emblem — a refined 4-point evening star (Venus) inside a celestial astrolabe ring.
 * Uses CSS variables so it shifts automatically across Twilight, Nocturne, and Mediterranean themes.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ size = 32, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Vesper Emblem"
    >
      <circle cx="20" cy="20" r="19" fill="var(--v-cta)" />
      <circle
        cx="20"
        cy="20"
        r="15.2"
        stroke="var(--v-cta-text)"
        strokeWidth="0.95"
        strokeOpacity="0.35"
      />
      {/* Delicate orbital arc */}
      <path
        d="M9.5 24.5C13.2 28.8 20.5 30.2 26.8 27.2"
        stroke="var(--v-cta-text)"
        strokeWidth="0.9"
        strokeLinecap="round"
        strokeOpacity="0.45"
      />
      {/* Sharp 4-point evening star */}
      <path
        d="M20 6.5C20.5 14.5 25.5 19.5 33.5 20C25.5 20.5 20.5 25.5 20 33.5C19.5 25.5 14.5 20.5 6.5 20C14.5 19.5 19.5 14.5 20 6.5Z"
        fill="var(--v-cta-text)"
      />
      {/* Accent evening star pinpoint */}
      <circle cx="27.5" cy="12.5" r="1.6" fill="var(--v-accent)" />
    </svg>
  );
};
