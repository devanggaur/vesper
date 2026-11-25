import React, { useState } from 'react';

interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackGradient?: string;
}

/**
 * Resilient lazy-loaded image wrapper that degrades gracefully to a subtle gradient
 * placeholder if an external media URL fails to load or is blocked.
 */
export const SmartImage: React.FC<SmartImageProps> = ({
  src,
  alt,
  className = '',
  fallbackGradient = 'from-[#2A3B4C] via-[#1C2A3A] to-[#0E2034]',
}) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`bg-gradient-to-br ${fallbackGradient} flex items-center justify-center text-white/70 text-xs font-medium ${className}`}
        role="img"
        aria-label={alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
