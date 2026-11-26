import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Car, Check, MapPin, Plane, Sparkles } from 'lucide-react';
import { RoadTripConfig, TripMode } from '../../types/travel';
import { BrandMark } from '../common/BrandMark';
import { SmartImage } from '../common/SmartImage';
import { TasteProfile } from './TasteCard';

interface MobileChatCalibrationProps {
  destination: string;
  dates: string;
  detectedTripMode?: TripMode;
  initialStartCity?: string;
  initialTransportMode?: 'drive_home' | 'fly_drive';
  initialProfile?: Partial<TasteProfile> | null;
  onSubmit: (profile: TasteProfile) => void;
}

const TRAVELER_OPTIONS = ['Just me', '2 travelers', 'Small group (3–4)', 'Family'];

const CITY_VIBES = [
  {
    id: 'Museums & Art',
    label: 'Museums & Art',
    image:
      'https://images.unsplash.com/photo-1554907984-15263bfd63bd?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'Architecture',
    label: 'Architecture',
    image:
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'Iconic Dining',
    label: 'Iconic Dining',
    image:
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'Contemporary Art',
    label: 'Contemporary',
    image:
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'Design Stays',
    label: 'Design Stays',
    image:
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'Markets & Bars',
    label: 'Markets & Bars',
    image:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=240&q=70',
  },
];

const ROADTRIP_VIBES = [
  {
    id: 'Scenic Overlooks',
    label: 'Scenic Overlooks',
    image:
      'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'Coastal & Hikes',
    label: 'Coastal & Hikes',
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'Small Towns & Bakeries',
    label: 'Towns & Bakeries',
    image:
      'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'Wineries & Farmstands',
    label: 'Wineries',
    image:
      'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'National Parks',
    label: 'National Parks',
    image:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=240&q=70',
  },
  {
    id: 'Boutique Lodges',
    label: 'Boutique Lodges',
    image:
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=240&q=70',
  },
];

const PACE_OPTIONS: Array<{ id: TasteProfile['pace']; sub: string }> = [
  { id: 'Unhurried', sub: '2 slow anchors/day' },
  { id: 'Balanced', sub: 'Clustered & easy' },
  { id: 'Packed', sub: 'See it all' },
];

const SPLURGE_OPTIONS: Array<{ id: TasteProfile['splurge']; sub: string }> = [
  { id: 'Smart', sub: 'Thoughtful value' },
  { id: 'Elevated', sub: 'Boutique 4-star' },
  { id: 'Iconic', sub: 'Splurge-worthy' },
];

const MAX_DRIVE_OPTIONS: Array<{ id: RoadTripConfig['maxDriveHoursPerDay']; label: string }> = [
  { id: 'under_2h', label: 'Under 2 hrs' },
  { id: '2_to_4h', label: '2–4 hrs' },
  { id: '4h_plus', label: '4+ hrs' },
];

type CalibrationStep = 'travelers' | 'roadtrip' | 'vibes' | 'pace_style';

/**
 * Thumb-friendly, chat-native taste calibration flow for mobile viewports (`< 1024px`).
 * Keeps each step compact above the bottom tab bar with zero heavy form scrolling,
 * emitting the exact same `TasteProfile` as desktop `TasteCard`.
 */
export const MobileChatCalibration: React.FC<MobileChatCalibrationProps> = ({
  destination,
  dates,
  detectedTripMode = 'city',
  initialStartCity = '',
  initialTransportMode = 'drive_home',
  initialProfile,
  onSubmit,
}) => {
  const isRoadTrip = (initialProfile?.tripMode || detectedTripMode) === 'roadtrip';
  const [step, setStep] = useState<CalibrationStep>('travelers');
  const [travelers, setTravelers] = useState<string>(() => {
    const raw = initialProfile?.travelers;
    if (!raw || raw === 'Maria & me' || raw === 'Couple (2)') return '2 travelers';
    return raw;
  });
  const [travelersPicked, setTravelersPicked] = useState(false);

  const [startCity, setStartCity] = useState(
    initialProfile?.roadTrip?.startCity || initialStartCity || 'San Francisco'
  );
  const [transportMode, setTransportMode] = useState<'drive_home' | 'fly_drive'>(
    initialProfile?.roadTrip?.transportMode || initialTransportMode
  );
  const [maxDriveHours, setMaxDriveHours] = useState<RoadTripConfig['maxDriveHoursPerDay']>(
    initialProfile?.roadTrip?.maxDriveHoursPerDay || '2_to_4h'
  );
  const [roadTripPicked, setRoadTripPicked] = useState(false);

  const [selectedVibes, setSelectedVibes] = useState<string[]>(() => {
    if (initialProfile?.vibes && initialProfile.vibes.length > 0) return initialProfile.vibes;
    return isRoadTrip
      ? ['Scenic Overlooks', 'Coastal & Hikes', 'Small Towns & Bakeries']
      : ['Museums & Art', 'Architecture', 'Iconic Dining'];
  });
  const [vibesPicked, setVibesPicked] = useState(false);

  const [pace, setPace] = useState<TasteProfile['pace']>(initialProfile?.pace || 'Balanced');
  const [splurge, setSplurge] = useState<TasteProfile['splurge']>(
    initialProfile?.splurge || 'Iconic'
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialStartCity && !initialProfile?.roadTrip?.startCity) {
      setStartCity(initialStartCity);
    }
  }, [initialStartCity, initialProfile?.roadTrip?.startCity]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [step, travelersPicked, roadTripPicked, vibesPicked]);

  const activeVibesList = isRoadTrip ? ROADTRIP_VIBES : CITY_VIBES;
  const placeLabel = destination || 'your trip';

  const submitFinal = (overrides?: Partial<TasteProfile>) => {
    const finalTripMode: TripMode = isRoadTrip ? 'roadtrip' : 'city';
    onSubmit({
      travelers: overrides?.travelers || travelers,
      vibes: overrides?.vibes || selectedVibes,
      pace: overrides?.pace || pace,
      splurge: overrides?.splurge || splurge,
      tripMode: finalTripMode,
      ...(isRoadTrip
        ? {
            roadTrip: {
              startCity: startCity.trim() || destination || 'San Francisco',
              transportMode,
              maxDriveHoursPerDay: maxDriveHours,
            },
          }
        : {}),
    });
  };

  const toggleVibe = (id: string) => {
    setSelectedVibes((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((v) => v !== id)
          : prev
        : [...prev, id]
    );
  };

  const handlePickTravelers = (opt: string) => {
    setTravelers(opt);
    setTravelersPicked(true);
    setStep(isRoadTrip ? 'roadtrip' : 'vibes');
  };

  const handleConfirmRoadTrip = () => {
    setRoadTripPicked(true);
    setStep('vibes');
  };

  const handleConfirmVibes = () => {
    setVibesPicked(true);
    setStep('pace_style');
  };

  const maxDriveSummary =
    MAX_DRIVE_OPTIONS.find((o) => o.id === maxDriveHours)?.label || '2–4 hrs';

  return (
    <div className="flex flex-col h-full max-w-[540px] mx-auto w-full">
      {/* Compact Header Strip with 1-tap Skip */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-black/[0.07] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BrandMark size={24} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#14191F] truncate">
              {destination ? `Planning ${destination}` : 'Quick trip setup'}
            </div>
            {dates && dates.trim() && dates.toLowerCase() !== 'flexible dates' && (
              <div className="font-tabular text-[11px] text-[#7B828A] truncate">{dates}</div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => submitFinal()}
          className="px-3 py-1 rounded-full bg-white border border-black/[0.1] text-[11.5px] font-medium text-[#5A626A] hover:text-[#14191F] cursor-pointer shrink-0"
        >
          Skip
        </button>
      </div>

      {/* Conversational Thread */}
      <div className="flex-1 overflow-y-auto thin-scrollbar space-y-4 pb-6">
        {/* Step 1: Travelers */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="rounded-[20px] rounded-tl-md bg-white border border-black/[0.07] px-4 py-3 shadow-2xs text-[14px] leading-[1.55] text-[#2C333A]">
            {destination ? (
              <>
                I’d love to help compose <strong className="text-[#14191F]">{destination}</strong>{' '}
                for you. First up—who’s coming along?
              </>
            ) : (
              <>I’d love to help compose this trip with you. First up—who’s coming along?</>
            )}
          </div>

          {!travelersPicked || step === 'travelers' ? (
            <div className="flex flex-wrap gap-2">
              {TRAVELER_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handlePickTravelers(opt)}
                  className={`px-4 py-2.5 rounded-full text-[13.5px] font-medium border transition-all active:scale-[0.97] cursor-pointer ${
                    travelers === opt && travelersPicked
                      ? 'bg-[#0E2034] border-[#0E2034] shadow-xs'
                      : 'bg-white text-[#14191F] border-black/[0.12] hover:border-[#0E2034] shadow-2xs'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStep('travelers')}
                className="rounded-[18px] rounded-tr-md bg-[#0E2034] px-3.5 py-2 text-[13px] font-medium shadow-2xs cursor-pointer"
                style={{ color: '#FFFFFF' }}
                title="Tap to change"
              >
                {travelers}
              </button>
            </div>
          )}
        </motion.div>

        {/* Optional Step 1b: Road Trip Setup (only when user explicitly asked for a road trip) */}
        <AnimatePresence>
          {isRoadTrip && travelersPicked && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="rounded-[20px] rounded-tl-md bg-white border border-black/[0.07] px-4 py-3 shadow-2xs text-[14px] leading-[1.55] text-[#2C333A]">
                Where are you starting the drive, and how many hours on the road feels comfortable
                each day?
              </div>

              {!roadTripPicked || step === 'roadtrip' ? (
                <div className="rounded-[20px] bg-white border border-black/[0.09] p-3.5 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FAF9F5] border border-black/[0.08]">
                    <MapPin className="w-3.5 h-3.5 text-[#C85A17] shrink-0" />
                    <input
                      type="text"
                      value={startCity}
                      onChange={(e) => setStartCity(e.target.value)}
                      placeholder="Starting city (e.g. San Francisco)"
                      className="flex-1 bg-transparent text-[13.5px] font-medium text-[#14191F] focus:outline-none min-w-0"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#F3F2EC] p-1">
                    <button
                      type="button"
                      onClick={() => setTransportMode('drive_home')}
                      className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium cursor-pointer ${
                        transportMode === 'drive_home'
                          ? 'bg-[#0E2034] text-white'
                          : 'text-[#5A626A]'
                      }`}
                      style={transportMode === 'drive_home' ? { color: '#FFFFFF' } : undefined}
                    >
                      <Car className="w-3.5 h-3.5" />
                      <span>Drive from home</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransportMode('fly_drive')}
                      className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium cursor-pointer ${
                        transportMode === 'fly_drive'
                          ? 'bg-[#0E2034] text-white'
                          : 'text-[#5A626A]'
                      }`}
                      style={transportMode === 'fly_drive' ? { color: '#FFFFFF' } : undefined}
                    >
                      <Plane className="w-3.5 h-3.5" />
                      <span>Fly &amp; rent</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-1 rounded-full bg-[#F3F2EC] p-1">
                    {MAX_DRIVE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMaxDriveHours(opt.id)}
                        className={`py-1.5 rounded-full text-[12px] font-medium cursor-pointer ${
                          maxDriveHours === opt.id
                            ? 'bg-[#0E2034] text-white'
                            : 'text-[#5A626A]'
                        }`}
                        style={maxDriveHours === opt.id ? { color: '#FFFFFF' } : undefined}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmRoadTrip}
                    className="w-full py-2.5 rounded-full bg-[#0E2034] text-[13px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ color: '#FFFFFF' }}
                  >
                    <span>Next</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep('roadtrip')}
                    className="rounded-[18px] rounded-tr-md bg-[#0E2034] px-3.5 py-2 text-[13px] font-medium shadow-2xs cursor-pointer"
                    style={{ color: '#FFFFFF' }}
                  >
                    From {startCity} · {maxDriveSummary}/day
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 2: Vibes */}
        <AnimatePresence>
          {travelersPicked && (!isRoadTrip || roadTripPicked) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="rounded-[20px] rounded-tl-md bg-white border border-black/[0.07] px-4 py-3 shadow-2xs text-[14px] leading-[1.55] text-[#2C333A]">
                What should <strong className="text-[#14191F]">{placeLabel}</strong> feel like? Pick
                a few vibes:
              </div>

              {!vibesPicked || step === 'vibes' ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    {activeVibesList.map((tile) => {
                      const active = selectedVibes.includes(tile.id);
                      return (
                        <button
                          key={tile.id}
                          type="button"
                          onClick={() => toggleVibe(tile.id)}
                          className={`flex items-center gap-2.5 p-1.5 pr-2.5 rounded-2xl border text-left transition-all active:scale-[0.98] cursor-pointer ${
                            active
                              ? 'bg-[#0E2034] border-[#0E2034] shadow-xs'
                              : 'bg-white border-black/[0.1] text-[#14191F]'
                          }`}
                          style={active ? { color: '#FFFFFF' } : undefined}
                        >
                          <SmartImage
                            src={tile.image}
                            alt={tile.label}
                            className="w-9 h-9 rounded-xl object-cover shrink-0"
                          />
                          <span className="text-[12.5px] font-semibold leading-tight flex-1 min-w-0 truncate">
                            {tile.label}
                          </span>
                          {active && <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={2.6} />}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmVibes}
                    className="w-full py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13.5px] font-medium inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    style={{ color: '#FFFFFF' }}
                  >
                    <span>Next ({selectedVibes.length} selected)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep('vibes')}
                    className="max-w-[85%] rounded-[18px] rounded-tr-md bg-[#0E2034] px-3.5 py-2 text-[13px] font-medium text-right shadow-2xs cursor-pointer"
                    style={{ color: '#FFFFFF' }}
                  >
                    {selectedVibes.join(' · ')}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 3: Pace & Style */}
        <AnimatePresence>
          {vibesPicked && step === 'pace_style' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="rounded-[20px] rounded-tl-md bg-white border border-black/[0.07] px-4 py-3 shadow-2xs text-[14px] leading-[1.55] text-[#2C333A]">
                Last one—what pace and budget style fit best?
              </div>

              <div className="rounded-[20px] bg-white border border-black/[0.09] p-3.5 shadow-xs space-y-3.5">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7B828A] px-0.5">
                    Pace
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {PACE_OPTIONS.map((opt) => {
                      const active = pace === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setPace(opt.id)}
                          className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                            active
                              ? 'bg-[#0E2034] border-[#0E2034] shadow-2xs'
                              : 'bg-[#FAF9F5] border-black/[0.08] text-[#14191F]'
                          }`}
                          style={active ? { color: '#FFFFFF' } : undefined}
                        >
                          <div className="text-[12.5px] font-semibold leading-tight">{opt.id}</div>
                          <div
                            className={`text-[10px] mt-0.5 leading-tight ${
                              active ? 'opacity-80' : 'text-[#7B828A]'
                            }`}
                          >
                            {opt.sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#7B828A] px-0.5">
                    Splurge style
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SPLURGE_OPTIONS.map((opt) => {
                      const active = splurge === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSplurge(opt.id)}
                          className={`py-2 px-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                            active
                              ? 'bg-[#0E2034] border-[#0E2034] shadow-2xs'
                              : 'bg-[#FAF9F5] border-black/[0.08] text-[#14191F]'
                          }`}
                          style={active ? { color: '#FFFFFF' } : undefined}
                        >
                          <div className="text-[12.5px] font-semibold leading-tight">{opt.id}</div>
                          <div
                            className={`text-[10px] mt-0.5 leading-tight ${
                              active ? 'opacity-80' : 'text-[#7B828A]'
                            }`}
                          >
                            {opt.sub}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => submitFinal()}
                  className="w-full py-3 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[14px] font-medium inline-flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all cursor-pointer"
                  style={{ color: '#FFFFFF' }}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isRoadTrip ? 'Build my road trip' : 'Build my trip'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} className="h-2" />
      </div>
    </div>
  );
};
