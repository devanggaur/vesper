import React from 'react';

/**
 * Lightweight inline markdown renderer for **bold** and *italic* segments used in
 * AI co-pilot replies and curated editorial copy, avoiding a heavy markdown dependency.
 */
export function renderInlineBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+?\*\*|\*[^*\n]+?\*)/g).map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[#14191F]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic text-[#2C333A]">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

/**
 * Editorial chat message renderer supporting clean multi-paragraph pacing,
 * bullet lists (`- ` / `* ` / `• `), **bold**, and *italic* — works identically
 * during live token streaming and on persisted assistant replies.
 */
export function renderRichChatContent(
  text: string,
  options?: { trailingCursor?: boolean }
): React.ReactNode {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return null;

  const blocks = normalized.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  const cursor = options?.trailingCursor ? (
    <span className="inline-block w-1.5 h-3.5 ml-1 align-middle rounded-[2px] bg-[#C85A17] animate-pulse" />
  ) : null;

  return (
    <div className="space-y-2.5 text-[13.5px] leading-[1.65] text-[#2C333A]">
      {blocks.map((block, blockIdx) => {
        const isLastBlock = blockIdx === blocks.length - 1;
        const lines = block
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);

        const hasBullets = lines.some((l) => /^[-*•]\s+/.test(l));
        if (!hasBullets) {
          return (
            <p key={blockIdx} className="whitespace-pre-line">
              {renderInlineBold(block)}
              {isLastBlock ? cursor : null}
            </p>
          );
        }

        // Mixed block: optional lead-in lines + bulleted items + optional trailing line
        const elements: React.ReactNode[] = [];
        let bulletGroup: string[] = [];

        const flushBullets = (keyPrefix: string, attachCursor: boolean) => {
          if (bulletGroup.length === 0) return;
          const items = bulletGroup;
          bulletGroup = [];
          elements.push(
            <ul key={keyPrefix} className="space-y-1.5 pl-0.5">
              {items.map((itemText, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-[8px] w-1.5 h-1.5 rounded-full bg-[#C85A17] shrink-0" />
                  <span className="flex-1">
                    {renderInlineBold(itemText)}
                    {attachCursor && i === items.length - 1 ? cursor : null}
                  </span>
                </li>
              ))}
            </ul>
          );
        };

        lines.forEach((line, lIdx) => {
          const isLastLine = isLastBlock && lIdx === lines.length - 1;
          if (/^[-*•]\s+/.test(line)) {
            bulletGroup.push(line.replace(/^[-*•]\s+/, ''));
            if (isLastLine) flushBullets(`b-${blockIdx}-${lIdx}`, true);
          } else {
            flushBullets(`b-${blockIdx}-${lIdx}`, false);
            elements.push(
              <p key={`p-${blockIdx}-${lIdx}`}>
                {renderInlineBold(line)}
                {isLastLine ? cursor : null}
              </p>
            );
          }
        });

        return (
          <div key={blockIdx} className="space-y-2">
            {elements}
          </div>
        );
      })}
    </div>
  );
}
