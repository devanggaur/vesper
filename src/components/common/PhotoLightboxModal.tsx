import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { SmartImage } from './SmartImage';

interface PhotoLightboxModalProps {
  title: string;
  subtitle?: string;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

/** Upgrades Vesper `/api/places/photo?...&w=900` proxy URLs to `w=1400` for crisp full-screen viewing. */
function toHighResUrl(url: string): string {
  if (!url) return url;
  if (url.includes('/api/places/photo') && /[?&]w=\d+/.test(url)) {
    return url.replace(/([?&]w=)\d+/, '$11400');
  }
  return url;
}

/**
 * Full-screen uncropped photo gallery viewer with keyboard (`←`, `→`, `Esc`),
 * touch-swipe navigation, and interactive thumbnail filmstrip.
 */
export const PhotoLightboxModal: React.FC<PhotoLightboxModalProps> = ({
  title,
  subtitle,
  images,
  initialIndex = 0,
  onClose,
}) => {
  const cleanImages = images.filter(Boolean);
  const total = cleanImages.length;
  const [index, setIndex] = useState(() =>
    total > 0 ? ((initialIndex % total) + total) % total : 0
  );
  const touchStartX = useRef<number | null>(null);

  const goPrev = () => {
    if (total <= 1) return;
    setIndex((i) => (i - 1 + total) % total);
  };

  const goNext = () => {
    if (total <= 1) return;
    setIndex((i) => (i + 1) % total);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (total > 1) setIndex((i) => (i - 1 + total) % total);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (total > 1) setIndex((i) => (i + 1) % total);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, total]);

  if (total === 0 || typeof document === 'undefined') return null;

  const activeUrl = toHighResUrl(cleanImages[index]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photo gallery`}
      className="fixed inset-0 z-[1300] bg-black/92 backdrop-blur-md flex flex-col select-none"
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        className="shrink-0 flex items-center justify-between gap-4 px-4 sm:px-6 py-3.5 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <div className="text-[15px] font-semibold truncate">{title}</div>
          {subtitle && <div className="text-[12px] text-white/65 truncate">{subtitle}</div>}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-tabular text-[12.5px] text-white/80 px-2.5 py-1 rounded-full bg-white/10">
            {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo viewer"
            className="w-9 h-9 rounded-full bg-white/12 hover:bg-white/22 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Full-View Stage */}
      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-3 sm:px-16 py-2"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
          const delta = endX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) > 45) {
            if (delta < 0) goNext();
            else goPrev();
          }
        }}
      >
        {total > 1 && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous photo"
            className="absolute left-3 sm:left-5 z-10 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/55 hover:bg-black/80 border border-white/15 text-white flex items-center justify-center backdrop-blur-xs transition-all cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <motion.div
          key={`${index}-${activeUrl}`}
          initial={{ opacity: 0.4, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.16 }}
          className="max-h-full max-w-full flex items-center justify-center"
        >
          <SmartImage
            src={activeUrl}
            alt={`${title} — photo ${index + 1} of ${total}`}
            className="max-h-[74vh] max-w-[92vw] sm:max-w-[82vw] w-auto h-auto object-contain rounded-xl shadow-2xl"
          />
        </motion.div>

        {total > 1 && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photo"
            className="absolute right-3 sm:right-5 z-10 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/55 hover:bg-black/80 border border-white/15 text-white flex items-center justify-center backdrop-blur-xs transition-all cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Filmstrip */}
      {total > 1 && (
        <div
          className="shrink-0 px-4 pb-5 pt-2 flex items-center justify-center gap-2 overflow-x-auto no-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          {cleanImages.map((imgUrl, idx) => {
            const active = idx === index;
            return (
              <button
                key={`${idx}-${imgUrl}`}
                type="button"
                onClick={() => setIndex(idx)}
                aria-label={`View photo ${idx + 1}`}
                className={`relative w-14 h-10 sm:w-16 sm:h-11 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                  active
                    ? 'border-white opacity-100 scale-105 shadow-lg'
                    : 'border-transparent opacity-55 hover:opacity-90'
                }`}
              >
                <SmartImage
                  src={imgUrl}
                  alt={`${title} thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </motion.div>,
    document.body
  );
};
