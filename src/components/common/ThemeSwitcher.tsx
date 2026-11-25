import React from 'react';

export type VesperTheme = 'twilight' | 'nocturne' | 'mediterranean';

interface ThemeSwitcherProps {
  theme: VesperTheme;
  onChange: (theme: VesperTheme) => void;
  compact?: boolean;
}

const THEMES: {
  id: VesperTheme;
  label: string;
  shortLabel: string;
  swatchBg: string;
  swatchAccent: string;
  subtitle: string;
}[] = [
  {
    id: 'twilight',
    label: 'Twilight',
    shortLabel: 'Twilight',
    swatchBg: '#F5F2EC',
    swatchAccent: '#151B2B',
    subtitle: 'Twilight Editorial — Instrument Serif · Indigo & Copper',
  },
  {
    id: 'nocturne',
    label: 'Nocturne',
    shortLabel: 'Nocturne',
    swatchBg: '#0E1117',
    swatchAccent: '#E5C585',
    subtitle: 'Nocturne — Fraunces · Obsidian & Champagne Gold',
  },
  {
    id: 'mediterranean',
    label: 'Mediterranean',
    shortLabel: 'Olive',
    swatchBg: '#F6F2EA',
    swatchAccent: '#1F3A2E',
    subtitle: 'Mediterranean Sun — Fraunces · Olive & Terracotta',
  },
];

/**
 * Sleek inline header/sidebar theme switcher pill (replaces bottom-right floating pill).
 */
export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({
  theme,
  onChange,
  compact = false,
}) => {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full p-0.5 border"
      style={{
        backgroundColor: 'var(--v-canvas-subtle)',
        borderColor: 'var(--v-border)',
      }}
      role="radiogroup"
      aria-label="Vesper theme"
    >
      {THEMES.map((t) => {
        const isActive = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            title={t.subtitle}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-1.5 rounded-full font-medium transition-all cursor-pointer ${
              compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1 text-[11.5px]'
            }`}
            style={
              isActive
                ? {
                    backgroundColor: 'var(--v-surface)',
                    color: 'var(--v-ink)',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  }
                : {
                    color: 'var(--v-ink-muted)',
                  }
            }
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/15 relative overflow-hidden"
              style={{ backgroundColor: t.swatchBg }}
            >
              <span
                className="absolute right-0 top-0 bottom-0 w-1/2"
                style={{ backgroundColor: t.swatchAccent }}
              />
            </span>
            <span className={compact ? 'hidden sm:inline' : 'inline'}>
              {compact ? t.shortLabel : t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
