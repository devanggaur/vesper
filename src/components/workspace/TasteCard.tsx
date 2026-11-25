import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles, Users } from 'lucide-react';
import { SmartImage } from '../common/SmartImage';

/**
 * Structured taste calibration output sent to the workspace/backend to personalize curation.
 */
export interface TasteProfile {
  travelers: string;
  vibes: string[];
  pace: 'Unhurried' | 'Balanced' | 'Packed';
  splurge: 'Smart' | 'Elevated' | 'Iconic';
}

interface TasteCardProps {
  destination: string;
  dates: string;
  onSubmit: (profile: TasteProfile) => void;
}

const VIBE_TILES = [
  {
    id: 'Museums & Art',
    label: 'Museums & Art',
    image:
      'https://images.unsplash.com/photo-1554907984-15263bfd63bd?auto=format&fit=crop&w=500&q=75',
  },
  {
    id: 'Architecture',
    label: 'Architecture',
    image:
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=500&q=75',
  },
  {
    id: 'Iconic Dining',
    label: 'Iconic Dining',
    image:
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=500&q=75',
  },
  {
    id: 'Contemporary Art',
    label: 'Contemporary Art',
    image:
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=500&q=75',
  },
  {
    id: 'Design Stays',
    label: 'Design Stays',
    image:
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=500&q=75',
  },
  {
    id: 'Markets & Bars',
    label: 'Markets & Bars',
    image:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=500&q=75',
  },
];

const PACE_LABELS: Array<TasteProfile['pace']> = ['Unhurried', 'Balanced', 'Packed'];
const PACE_NOTES = [
  '2 slow anchors a day, generous café breaks',
  '2–3 key stops clustered by neighborhood, zero zig-zagging',
  'Full dawn-to-dusk cultural sweep',
];

const SPLURGE_LABELS: Array<TasteProfile['splurge']> = ['Smart', 'Elevated', 'Iconic'];
const SPLURGE_NOTES = [
  'High-taste neighborhood gems with thoughtful value',
  'Boutique 4-star stays & memorable dinners',
  'Splurge where it counts — iconic dining & design suites',
];

export const TasteCard: React.FC<TasteCardProps> = ({ destination, dates, onSubmit }) => {
  const [travelers, setTravelers] = useState('Maria & me');
  const [selectedVibes, setSelectedVibes] = useState<string[]>([
    'Museums & Art',
    'Architecture',
    'Iconic Dining',
    'Contemporary Art',
  ]);
  const [paceIdx, setPaceIdx] = useState(1);
  const [splurgeIdx, setSplurgeIdx] = useState(2);

  const toggleVibe = (id: string) => {
    setSelectedVibes((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((v) => v !== id)
          : prev
        : [...prev, id]
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-[760px] mx-auto w-full rounded-[26px] bg-white border border-black/[0.08] shadow-[0_12px_40px_rgba(14,32,52,0.06)] p-5 sm:p-7 space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-4 border-b border-black/[0.06]">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C85A17] mb-1">
            <Sparkles className="w-3 h-3" />
            <span>5-Second Taste Calibration</span>
          </div>
          <h2 className="font-editorial text-[28px] sm:text-[34px] font-normal text-[#14191F] leading-tight">
            How should {destination} feel?
          </h2>
        </div>
        <span className="font-tabular text-[12px] text-[#7B828A] shrink-0">{dates}</span>
      </div>

      {/* 1. Travelers */}
      <div className="space-y-2.5">
        <label className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-[#5A626A]">
          <Users className="w-3.5 h-3.5" />
          <span>Who’s traveling</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {['Just me', 'Maria & me', 'Small group (3–4)', 'Family'].map((opt) => {
            const active = travelers === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setTravelers(opt)}
                className={`px-3.5 py-2 rounded-full text-[13px] font-medium border transition-all cursor-pointer ${
                  active
                    ? 'bg-[#0E2034] border-[#0E2034] shadow-xs'
                    : 'bg-[#F7F6F1] text-[#2C333A] border-black/[0.08] hover:border-black/[0.22]'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Visual Vibe Photo Tiles */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#5A626A]">
            Select your vibe
          </span>
          <span className="text-[11.5px] text-[#7B828A] font-tabular">
            {selectedVibes.length} selected
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {VIBE_TILES.map((tile) => {
            const isSelected = selectedVibes.includes(tile.id);
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => toggleVibe(tile.id)}
                className={`group relative h-[96px] sm:h-[106px] rounded-[16px] overflow-hidden text-left transition-all cursor-pointer border-2 ${
                  isSelected
                    ? 'border-[#0E2034] scale-[1.01] shadow-md'
                    : 'border-transparent opacity-80 hover:opacity-100'
                }`}
              >
                <SmartImage
                  src={tile.image}
                  alt={tile.label}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div
                  className={`absolute inset-0 transition-colors ${
                    isSelected
                      ? 'bg-gradient-to-t from-black/75 via-black/25 to-black/10'
                      : 'bg-gradient-to-t from-black/70 via-black/30 to-black/20'
                  }`}
                />
                <span
                  className={`absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-[#0E2034] scale-100 shadow'
                      : 'bg-black/35 border border-white/50 scale-90'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
                <span className="absolute bottom-2.5 left-3 right-2 text-[13px] font-semibold text-white drop-shadow-xs">
                  {tile.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Tactile Pace & Splurge Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Pace Dial */}
        <div className="rounded-[18px] bg-[#FAF9F5] border border-black/[0.07] p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[#5A626A]">
              Pace
            </span>
            <span className="text-[13.5px] font-semibold text-[#14191F]">
              {PACE_LABELS[paceIdx]}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-full bg-[#ECEAE2] p-1">
            {PACE_LABELS.map((lbl, idx) => (
              <button
                key={lbl}
                type="button"
                onClick={() => setPaceIdx(idx)}
                className={`py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
                  paceIdx === idx
                    ? 'bg-[#0E2034] shadow-2xs'
                    : 'text-[#5A626A] hover:text-[#14191F]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <p className="text-[11.5px] text-[#7B828A] leading-snug">{PACE_NOTES[paceIdx]}</p>
        </div>

        {/* Splurge Dial */}
        <div className="rounded-[18px] bg-[#FAF9F5] border border-black/[0.07] p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[#5A626A]">
              Splurge Style
            </span>
            <span className="text-[13.5px] font-semibold text-[#14191F]">
              {SPLURGE_LABELS[splurgeIdx]}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-full bg-[#ECEAE2] p-1">
            {SPLURGE_LABELS.map((lbl, idx) => (
              <button
                key={lbl}
                type="button"
                onClick={() => setSplurgeIdx(idx)}
                className={`py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
                  splurgeIdx === idx
                    ? 'bg-[#0E2034] shadow-2xs'
                    : 'text-[#5A626A] hover:text-[#14191F]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <p className="text-[11.5px] text-[#7B828A] leading-snug">
            {SPLURGE_NOTES[splurgeIdx]}
          </p>
        </div>
      </div>

      {/* Primary Action */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-[12px] text-[#7B828A]">
          You can adjust any stop, hotel, or flight anytime with Vesper.
        </span>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              travelers,
              vibes: selectedVibes,
              pace: PACE_LABELS[paceIdx],
              splurge: SPLURGE_LABELS[splurgeIdx],
            })
          }
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[14px] font-medium shadow-md transition-all cursor-pointer active:scale-[0.98]"
        >
          <span>Compose my weekend</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};
