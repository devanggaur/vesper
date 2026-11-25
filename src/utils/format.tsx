import React from 'react';

/**
 * Lightweight inline markdown renderer for **bold** segments used in AI co-pilot replies
 * and curated section intros, avoiding a heavy markdown parser dependency.
 */
export function renderInlineBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*.*?\*\*)/g).map((part, idx) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={idx} className="font-semibold text-[#14191F]">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}
