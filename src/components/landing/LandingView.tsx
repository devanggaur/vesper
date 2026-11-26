import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  Calendar,
  Users,
  Mic,
  ArrowUp,
  ArrowRight,
  Square,
  ChevronDown,
  Sparkles,
  User,
  Briefcase,
} from 'lucide-react';
import { BrandMark } from '../common/BrandMark';
import { SmartImage } from '../common/SmartImage';
import {
  DateRangePicker,
  getDefaultTripDateSelection,
  TripDateSelection,
} from './DateRangePicker';
import { useVoiceDictation } from '../../hooks/useVoiceDictation';
import {
  ALL_POSTCARDS,
  DEMO_VOICE_PROMPT,
  MOOD_TABS,
  MoodCategory,
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
 * - Centered open-ended prompt composer with rotating universal examples, voice dictation,
 *   interactive date range/flexible duration picker, and traveler picker.
 * - Traveler mood filter pills (`Anywhere`, `Cities`, `Beaches`, `Mountains & Nature`, etc.).
 * - Slow-drifting dual-row editorial postcard horizon that pauses on hover and filters by mood.
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
  const [dateSelection, setDateSelection] = useState<TripDateSelection>(() =>
    getDefaultTripDateSelection()
  );
  const [guestsLabel, setGuestsLabel] = useState('2 adults');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [activeMood, setActiveMood] = useState<MoodCategory>('Anywhere');

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
    onStartTrip(finalPrompt || DEMO_VOICE_PROMPT, undefined, dateSelection.label, guestsLabel);
  };

  const activeMoodObj = MOOD_TABS.find((m) => m.id === activeMood);
  const filteredPostcards =
    activeMood === 'Anywhere'
      ? ALL_POSTCARDS
      : ALL_POSTCARDS.filter((p) => p.moods.includes(activeMood));

  const renderPostcard = (dest: PostcardDestination, keySuffix: string) => (
    <button
      key={`${dest.id}-${keySuffix}`}
      type="button"
      onClick={() =>
        onStartTrip(dest.prompt, undefined, dateSelection.label, guestsLabel, dest.name)
      }
      className={`group relative ${
        dest.wide ? 'w-[240px] sm:w-[278px]' : 'w-[190px] sm:w-[220px]'
      } h-[142px] sm:h-[168px] rounded-[18px] overflow-hidden shrink-0 text-left shadow-[0_6px_22px_rgba(14,32,52,0.09)] border border-black/[0.06] cursor-pointer transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#0E2034]`}
    >
      <SmartImage
        src={dest.image}
        alt={dest.name}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/10" />
      <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-black/45 backdrop-blur-md text-[10px] font-medium text-white/95">
        {dest.tag}
      </span>
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

        {/* Elevated Centered Universal Prompt Composer */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="w-full max-w-[650px] rounded-[24px] bg-white border border-black/[0.09] shadow-[0_14px_42px_rgba(14,32,52,0.09)] px-4 sm:px-5 pt-4 pb-3 space-y-3.5"
        >
          <input
            type="text"
            value={voice.isRecording ? voice.transcript : prompt}
            onChange={(e) => {
              if (voice.isRecording) voice.stopRecording();
              setPrompt(e.target.value);
            }}
            placeholder={ROTATING_PLACEHOLDERS[placeholderIdx]}
            className="w-full bg-transparent text-[15px] sm:text-[15.5px] text-[#14191F] placeholder:text-[#7B828A] focus:outline-none"
          />

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/[0.06] min-h-[38px]">
            {voice.isRecording ? (
              <div className="flex items-center justify-between w-full gap-3">
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
            ) : (
              <>
                <div className="flex items-center gap-1.5 flex-wrap relative">
                  {/* Date Range & Flexible Duration Picker Trigger */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowDatePicker(true);
                      setShowGuestPicker(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F3F2EC] hover:bg-black/[0.06] text-[12px] font-medium text-[#2C333A] transition-colors cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5 text-[#5A626A]" />
                    <span className="font-tabular">{dateSelection.label}</span>
                    <ChevronDown className="w-3 h-3 text-[#7B828A]" />
                  </button>

                  {/* Travelers Picker */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowGuestPicker((v) => !v);
                        setShowDatePicker(false);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#F3F2EC] hover:bg-black/[0.06] text-[12px] font-medium text-[#2C333A] transition-colors cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5 text-[#5A626A]" />
                      <span>{guestsLabel}</span>
                    </button>
                    {showGuestPicker && (
                      <div className="absolute left-0 top-10 w-36 rounded-2xl bg-white border border-black/[0.08] shadow-xl p-1.5 z-50">
                        {['Solo', '2 adults', 'Family (4)', 'Group (5+)'].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setGuestsLabel(opt);
                              setShowGuestPicker(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs cursor-pointer ${
                              guestsLabel === opt
                                ? 'bg-[#0E2034] font-medium'
                                : 'hover:bg-black/[0.04] text-[#14191F]'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={voice.startRecording}
                    className="w-9 h-9 rounded-full hover:bg-black/[0.05] text-[#4A535C] flex items-center justify-center transition-colors cursor-pointer"
                    title="Speak to Vesper"
                  >
                    <Mic className="w-[17px] h-[17px]" />
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13px] font-medium shadow-xs transition-all cursor-pointer"
                  >
                    <span>Compose</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.form>

        {/* Traveler Mood Filter Pills */}
        <div className="w-full max-w-[780px] flex items-center justify-start sm:justify-center gap-1.5 overflow-x-auto no-scrollbar mt-4 pb-1 px-1">
          {MOOD_TABS.map((m) => {
            const active = activeMood === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveMood(m.id)}
                className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border shrink-0 transition-all cursor-pointer ${
                  active
                    ? 'bg-[#0E2034] border-[#0E2034] shadow-2xs'
                    : 'bg-white/85 text-[#4A535C] border-black/[0.08] hover:border-black/[0.2] hover:text-[#14191F]'
                }`}
              >
                {m.id}
              </button>
            );
          })}
        </div>

        {/* One-Click Contextual Mood Prompt Pill */}
        <AnimatePresence mode="wait">
          {activeMoodObj?.samplePrompt && (
            <motion.button
              key={activeMoodObj.id}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              type="button"
              onClick={() => onStartTrip(activeMoodObj.samplePrompt!, undefined, dateSelection.label)}
              className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#ECEAE2] hover:bg-[#E2DFD5] text-[12px] font-medium text-[#2C333A] transition-colors cursor-pointer max-w-full"
            >
              <Sparkles className="w-3 h-3 text-[#C85A17] shrink-0" />
              <span className="truncate">Try: “{activeMoodObj.samplePrompt}”</span>
              <ArrowRight className="w-3 h-3 shrink-0" />
            </motion.button>
          )}
        </AnimatePresence>
      </section>

      {/* Slow-Drifting Dual-Row Editorial Postcard Horizon */}
      <section className="flex-1 flex flex-col justify-center overflow-hidden pb-5 pt-1 min-h-[320px]">
        <AnimatePresence mode="wait">
          {activeMood === 'Anywhere' ? (
            <motion.div
              key="marquee-horizon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
              className="space-y-3 vesper-edge-fade overflow-hidden py-1"
            >
              <div className="vesper-marquee-row overflow-hidden">
                <div className="vesper-marquee-left gap-3 pr-3">
                  {ROW_1_POSTCARDS.map((d) => renderPostcard(d, 'r1a'))}
                  {ROW_1_POSTCARDS.map((d) => renderPostcard(d, 'r1b'))}
                </div>
              </div>

              <div className="vesper-marquee-row overflow-hidden">
                <div className="vesper-marquee-right gap-3 pr-3">
                  {ROW_2_POSTCARDS.map((d) => renderPostcard(d, 'r2a'))}
                  {ROW_2_POSTCARDS.map((d) => renderPostcard(d, 'r2b'))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`filtered-${activeMood}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24 }}
              className="max-w-[1200px] w-full mx-auto px-4 sm:px-8 overflow-y-auto thin-scrollbar"
            >
              <div className="flex flex-wrap justify-center gap-3.5 py-2">
                {filteredPostcards.map((d) => renderPostcard(d, 'filtered'))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Interactive Calendar Range & Flexible Duration Modal */}
      <AnimatePresence>
        {showDatePicker && (
          <DateRangePicker
            value={dateSelection}
            onChange={setDateSelection}
            onClose={() => setShowDatePicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
