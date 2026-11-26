import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUp, Mic, Square, X } from 'lucide-react';
import { ChatMessage } from '../../types/travel';
import { BrandMark } from '../common/BrandMark';
import { EditorialSheetTarget } from './ContextualEditorialSheet';
import { renderInlineBold, renderRichChatContent } from '../../utils/format';
import { useVoiceDictation } from '../../hooks/useVoiceDictation';

interface CoPilotRailProps {
  messages: ChatMessage[];
  streamingText?: string | null;
  thinkingLabel: string | null;
  statusStep: string | null;
  sheetTarget: EditorialSheetTarget | null;
  isMobileSheet?: boolean;
  onCloseMobile?: () => void;
  onSend: (text: string) => void;
}

const VOICE_DEMO_TEXT =
  'Organize my saved places into a coherent Friday to Sunday itinerary with minimal travel time';

/**
 * Persistent Vesper AI Co-Pilot rail (docked on desktop right 34%, or rendered inside
 * the slide-up drawer on mobile). Automatically adapts its header status and contextual
 * quick-ask chips to whichever hotel, place, or tour is open in `ContextualEditorialSheet`.
 */
export const CoPilotRail: React.FC<CoPilotRailProps> = ({
  messages,
  streamingText,
  thinkingLabel,
  statusStep,
  sheetTarget,
  isMobileSheet = false,
  onCloseMobile,
  onSend,
}) => {
  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceDictation({ demoPhrase: VOICE_DEMO_TEXT, barCount: 28 });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamingText, thinkingLabel, statusStep]);

  const contextChips =
    sheetTarget?.kind === 'hotel'
      ? ['Is it quiet for a light sleeper?', 'How close is it to my planned stops?']
      : sheetTarget?.kind === 'place'
      ? [`Best time to visit ${sheetTarget.item.name}?`, 'Auto-route my stops into days']
      : sheetTarget?.kind === 'activity'
      ? ['What pairs well nearby after this?', 'Auto-route my stops into days']
      : [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = (voice.isRecording ? voice.transcript || VOICE_DEMO_TEXT : inputValue).trim();
    if (!text) return;
    setInputValue('');
    voice.reset();
    onSend(text);
  };

  return (
    <div className="h-full flex flex-col bg-[#FAF9F5]">
      {/* Co-Pilot Header */}
      <div className="shrink-0 h-[56px] px-4 flex items-center justify-between border-b border-black/[0.06]">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandMark size={26} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-[#14191F] leading-tight">
              Ask Vesper
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#7B828A]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">
                {sheetTarget
                  ? `Viewing ${
                      sheetTarget.kind === 'activity'
                        ? sheetTarget.item.shortTitle
                        : sheetTarget.item.name
                    }`
                  : 'Tips, timing & itinerary tweaks'}
              </span>
            </div>
          </div>
        </div>

        {isMobileSheet && onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-full hover:bg-black/[0.05] text-[#4A535C] cursor-pointer"
            aria-label="Close Ask Vesper"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Scrollable Message Stream */}
      <div className="flex-1 overflow-y-auto thin-scrollbar px-4 py-4 space-y-4">
        {messages.map((msg) => {
          const isCalibrationPill =
            msg.role === 'user' &&
            Boolean(
              msg.id.startsWith('taste-u-') ||
                (msg.text &&
                  (/^(Calibrated|Road trip)\s*·/.test(msg.text) ||
                    /pace\s*·\s*(Smart|Elevated|Iconic)\s+style$/i.test(msg.text)))
            );

          return (
            <div key={msg.id}>
              {isCalibrationPill ? (
                <div className="flex justify-center py-0.5">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECEAE2]/80 border border-black/[0.06] text-[11px] font-medium text-[#5A626A] text-center">
                    {msg.text?.replace(/^Calibrated\s*·\s*/i, '')}
                  </span>
                </div>
              ) : msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[88%] rounded-[18px] bg-[#ECEAE2] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#14191F]">
                    {msg.text}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {msg.blocks?.map((block, bIdx) => {
                    if (block.type === 'text') {
                      return <div key={bIdx}>{renderRichChatContent(block.content)}</div>;
                    }
                    if (block.type === 'bullets') {
                      return (
                        <div key={bIdx} className="space-y-2.5 text-[13.5px] leading-[1.6] text-[#2C333A]">
                          {block.intro && renderRichChatContent(block.intro)}
                          <ul className="space-y-1.5 pl-0.5">
                            {block.items.map((it, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="mt-[8px] w-1.5 h-1.5 rounded-full bg-[#C85A17] shrink-0" />
                                <span className="flex-1">{renderInlineBold(it)}</span>
                              </li>
                            ))}
                          </ul>
                          {block.outro && renderRichChatContent(block.outro)}
                        </div>
                      );
                    }
                    if (block.type === 'suggestions') {
                      return (
                        <div key={bIdx} className="space-y-1.5 pt-1">
                          {block.items.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => onSend(suggestion)}
                              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white hover:border-[#0E2034] border border-black/[0.08] text-left text-[12.5px] font-medium text-[#14191F] transition-all cursor-pointer group"
                            >
                              <span className="truncate pr-2">{suggestion}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-[#7B828A] group-hover:translate-x-0.5 transition-transform shrink-0" />
                            </button>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          );
        })}

        {streamingText && renderRichChatContent(streamingText, { trailingCursor: true })}

        {thinkingLabel && (
          <div className="text-[13px] font-medium thinking-shimmer">{thinkingLabel}</div>
        )}
        {statusStep && (
          <div className="flex items-center gap-2 py-1">
            <BrandMark size={20} className="animate-pulse shrink-0" />
            <span className="text-[12.5px] font-medium thinking-shimmer">{statusStep}</span>
          </div>
        )}
        <div ref={chatEndRef} className="h-4" />
      </div>

      {/* Contextual Chips + Input Composer */}
      <div className="shrink-0 px-3.5 pt-2 pb-safe border-t border-black/[0.06] space-y-2 bg-[#FAF9F5]">
        {sheetTarget && contextChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contextChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => onSend(chip)}
                className="px-2.5 py-1 rounded-full bg-white hover:border-[#0E2034] border border-black/[0.09] text-[11.5px] font-medium text-[#2C333A] transition-colors cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-[18px] bg-white border border-black/[0.09] px-3.5 py-2.5 shadow-2xs"
        >
          {voice.isRecording ? (
            <div className="space-y-2.5">
              <div className="text-[12.5px] text-[#14191F] line-clamp-2 min-h-[18px]">
                {voice.transcript || 'Listening...'}
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    voice.stopRecording();
                    setInputValue(voice.transcript);
                  }}
                  className="w-7 h-7 rounded-lg hover:bg-black/[0.05] flex items-center justify-center text-[#14191F] cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
                <div className="flex-1 flex items-center justify-end gap-[2px] h-5 overflow-hidden">
                  {voice.waveBars.map((h, i) => (
                    <motion.span
                      key={i}
                      animate={{ height: h }}
                      transition={{ duration: 0.09 }}
                      className="w-[2px] rounded-full bg-[#5A626A]/75 shrink-0"
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  className="w-7 h-7 rounded-full bg-[#0E2034] flex items-center justify-center cursor-pointer"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  sheetTarget
                    ? `Ask Vesper about ${
                        sheetTarget.kind === 'activity' ? 'this tour' : sheetTarget.item.name
                      }...`
                    : 'Ask Vesper to route, swap, or book...'
                }
                className="flex-1 bg-transparent text-[13.5px] text-[#14191F] placeholder:text-[#7B828A] focus:outline-none min-w-0"
              />
              <button
                type="button"
                onClick={voice.startRecording}
                className="w-8 h-8 rounded-full hover:bg-black/[0.05] text-[#5A626A] flex items-center justify-center cursor-pointer shrink-0"
                title="Voice prompt"
              >
                <Mic className="w-4 h-4" />
              </button>
              {inputValue.trim().length > 0 && (
                <button
                  type="submit"
                  className="w-8 h-8 rounded-full bg-[#0E2034] flex items-center justify-center cursor-pointer shrink-0"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
