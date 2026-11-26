import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Menu,
  Mic,
  ArrowUp,
  ArrowRight,
  Square,
  User,
  Briefcase,
} from 'lucide-react';
import { BrandMark } from '../common/BrandMark';
import { SmartImage } from '../common/SmartImage';
import { useVoiceDictation } from '../../hooks/useVoiceDictation';
import {
  DEMO_VOICE_PROMPT,
  PostcardDestination,
  ROTATING_PLACEHOLDERS,
  ROW_1_POSTCARDS,
  ROW_2_POSTCARDS,
} from '../../data/landingDestinations';

interface LandingViewProps {
  userProfile?: { email: string; name?: string; avatarUrl?: string } | null;
  savedTripsCount?: number;
  onStartTrip: (
    prompt: string,
    focusMode?: 'flights' | 'stays' | 'activities',
    datesSummary?: string,
    travelers?: string,
    destinationHint?: string
  ) => void;
  onOpenSidebar: () => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
}

/**
 * Universal Vesper Homepage ("Horizon"):
 * - Clean, frictionless 2-row natural-language prompt composer with rotating examples & voice dictation.
 * - Pure, uncluttered dual-row editorial postcard horizon that pauses on hover.
 */
export const LandingView: React.FC<LandingViewProps> = ({
  userProfile,
  savedTripsCount = 0,
  onStartTrip,
  onOpenSidebar,
  onOpenAuth,
  onOpenProfile,
}) => {
  const [prompt, setPrompt] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  const voice = useVoiceDictation({ demoPhrase: DEMO_VOICE_PROMPT, barCount: 40 });

  // Rotate composer placeholder examples to highlight Vesper's support for any destination/style
  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % ROTATING_PLACEHOLDERS.length);
    }, 3600);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const finalPrompt = (voice.isRecording ? voice.transcript || DEMO_VOICE_PROMPT : prompt).trim();
    voice.reset();
    onStartTrip(finalPrompt || DEMO_VOICE_PROMPT);
  };

  const renderPostcard = (dest: PostcardDestination, keySuffix: string) => (
    <button
      key={`${dest.id}-${keySuffix}`}
      type="button"
      onClick={() => onStartTrip(dest.prompt, undefined, undefined, undefined, dest.name)}
      className={`group relative ${
        dest.wide ? 'w-[240px] sm:w-[278px]' : 'w-[190px] sm:w-[220px]'
      } h-[148px] sm:h-[176px] rounded-[18px] overflow-hidden shrink-0 text-left shadow-[0_6px_22px_rgba(14,32,52,0.09)] border border-black/[0.06] cursor-pointer transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#0E2034]`}
    >
      <SmartImage
        src={dest.image}
        alt={dest.name}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute bottom-2.5 left-3 right-3 text-white">
        <div className="text-[14.5px] font-semibold leading-tight drop-shadow-xs">{dest.name}</div>
        <div className="text-[11px] text-white/80 leading-tight mt-0.5">{dest.country}</div>
      </div>
    </button>
  );

  return (
    <div className="relative h-dvh w-full overflow-y-auto lg:overflow-hidden bg-[#F7F6F1] flex flex-col">
      {/* Top Masthead Header */}
      <header className="relative z-30 shrink-0 flex items-center justify-between px-4 sm:px-7 py-3.5 border-b border-black/[0.05]">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSidebar}
            className="p-2 -ml-2 rounded-lg text-[#14191F] hover:bg-black/[0.04] transition-colors cursor-pointer"
            aria-label="Open menu"
          >
            <Menu className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-2.5 select-none">
            <BrandMark size={29} />
            <span className="font-editorial text-[25px] font-medium text-[#14191F] leading-none">
              Vesper
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          {savedTripsCount > 0 && (
            <button
              type="button"
              onClick={onOpenSidebar}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white hover:bg-black/[0.04] border border-black/[0.09] px-3 py-1.5 text-[12px] font-medium text-[#2C333A] transition-colors cursor-pointer"
            >
              <Briefcase className="w-3.5 h-3.5 text-[#5A626A]" strokeWidth={1.8} />
              <span>My trips</span>
              <span className="font-tabular text-[11px] text-[#7B828A]">{savedTripsCount}</span>
            </button>
          )}
          <button
            type="button"
            onClick={userProfile ? onOpenProfile : onOpenAuth}
            title={userProfile ? 'Open Profile & Loyalty Wallet' : 'Sign in to Vesper'}
            className="hidden sm:flex items-center gap-2 rounded-full bg-[#0E2034] hover:bg-[#17304D] px-3 py-1.5 text-[12px] font-medium shadow-xs transition-all cursor-pointer max-w-[180px]"
          >
            {userProfile?.avatarUrl ? (
              <img
                src={userProfile.avatarUrl}
                alt={userProfile.name || userProfile.email}
                referrerPolicy="no-referrer"
                className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/25"
              />
            ) : (
              <User className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
            )}
            <span className="truncate">
              {userProfile
                ? (userProfile.name?.split(' ')[0] || userProfile.email.split('@')[0])
                : 'Sign in'}
            </span>
          </button>
        </div>
      </header>

      {/* Centered Universal Hero + Composer + Mood Filters */}
      <section className="relative z-20 shrink-0 flex flex-col items-center px-4 pt-6 sm:pt-9 pb-4">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="font-editorial text-[38px] sm:text-[52px] md:text-[58px] font-normal text-[#14191F] text-center leading-[1.06] mb-2.5"
        >
          Plan any trip, anywhere.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="text-[14px] sm:text-[15.5px] text-[#5A626A] text-center max-w-[520px] mb-5 sm:mb-6"
        >
          Weekend city breaks, family road trips, beaches, or solo adventures—routed and bookable in minutes.
        </motion.p>

        {/* Elevated Centered Universal Prompt Composer (Clean, Odessia-inspired 2-row box) */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="w-full max-w-[650px] rounded-[24px] bg-white border border-black/[0.09] shadow-[0_14px_42px_rgba(14,32,52,0.09)] px-4 sm:px-5 pt-4 pb-3 space-y-2.5"
        >
          {voice.isRecording ? (
            <div className="space-y-2.5">
              <div className="text-[15.5px] text-[#14191F] min-h-[48px] leading-relaxed">
                {voice.transcript || 'Listening...'}
              </div>
              <div className="flex items-center justify-between w-full gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    voice.stopRecording();
                    setPrompt(voice.transcript);
                  }}
                  className="w-8 h-8 rounded-full hover:bg-black/[0.05] flex items-center justify-center text-[#14191F] cursor-pointer"
                  title="Stop voice input"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>

                <div className="flex-1 flex items-center justify-end gap-[2.5px] h-7 overflow-hidden">
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
                  className="w-9 h-9 rounded-full bg-[#0E2034] flex items-center justify-center cursor-pointer shrink-0 shadow-xs"
                  title="Send voice prompt"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={ROTATING_PLACEHOLDERS[placeholderIdx]}
                className="w-full resize-none bg-transparent text-[15.5px] sm:text-[16px] leading-[1.5] text-[#14191F] placeholder:text-[#7B828A] focus:outline-none min-h-[48px]"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={voice.startRecording}
                  className="w-9 h-9 rounded-full hover:bg-black/[0.05] text-[#4A535C] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Speak to Vesper"
                  aria-label="Speak to Vesper"
                >
                  <Mic className="w-[17px] h-[17px]" />
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13px] font-medium shadow-xs transition-all cursor-pointer shrink-0"
                  style={{ color: '#FFFFFF' }}
                >
                  <span>Compose</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </motion.form>
      </section>

      {/* Slow-Drifting Dual-Row Editorial Postcard Horizon */}
      <section className="flex-1 flex flex-col justify-center overflow-hidden pb-6 pt-2 min-h-[340px]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.32 }}
          className="space-y-3.5 vesper-edge-fade overflow-hidden py-1"
        >
          <div className="vesper-marquee-row overflow-hidden">
            <div className="vesper-marquee-left gap-3.5 pr-3.5">
              {ROW_1_POSTCARDS.map((d) => renderPostcard(d, 'r1a'))}
              {ROW_1_POSTCARDS.map((d) => renderPostcard(d, 'r1b'))}
            </div>
          </div>

          <div className="vesper-marquee-row overflow-hidden">
            <div className="vesper-marquee-right gap-3.5 pr-3.5">
              {ROW_2_POSTCARDS.map((d) => renderPostcard(d, 'r2a'))}
              {ROW_2_POSTCARDS.map((d) => renderPostcard(d, 'r2b'))}
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
};
