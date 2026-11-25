import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  BedDouble,
  Plane,
  Plus,
  Trash2,
  ShieldCheck,
  Award,
  Check,
  MapPin,
  User,
} from 'lucide-react';
import { LoyaltyProgramEntry } from '../../types/travel';
import { BrandMark } from './BrandMark';

interface ProfileSettingsModalProps {
  userProfile?: { email: string; name?: string; avatarUrl?: string } | null;
  homeAirport: string;
  loyaltyPrograms: LoyaltyProgramEntry[];
  initialCategory?: 'hotel' | 'airline';
  onChangeHomeAirport: (airport: string) => void;
  onSaveLoyaltyPrograms: (next: LoyaltyProgramEntry[]) => void;
  onOpenAuth: () => void;
  onClose: () => void;
}

const HOME_AIRPORTS = [
  'San Francisco (SFO)',
  'New York (JFK)',
  'Los Angeles (LAX)',
  'Chicago (ORD)',
  'Seattle (SEA)',
  'Boston (BOS)',
  'Miami (MIA)',
  'London (LHR)',
];

const HOTEL_PRESETS = [
  { provider: 'Marriott', programName: 'Marriott Bonvoy' },
  { provider: 'Hyatt', programName: 'World of Hyatt' },
  { provider: 'Hilton', programName: 'Hilton Honors' },
  { provider: 'IHG', programName: 'IHG One Rewards' },
  { provider: 'Accor', programName: 'Accor Live Limitless' },
  { provider: 'Four Seasons', programName: 'Four Seasons' },
];

const AIRLINE_PRESETS = [
  { provider: 'United', programName: 'United MileagePlus' },
  { provider: 'Delta', programName: 'Delta SkyMiles' },
  { provider: 'American', programName: 'American AAdvantage' },
  { provider: 'Air Canada', programName: 'Air Canada Aeroplan' },
  { provider: 'British Airways', programName: 'British Airways Avios' },
  { provider: 'ANA', programName: 'ANA Mileage Club' },
  { provider: 'Air France / KLM', programName: 'Flying Blue' },
  { provider: 'Alaska', programName: 'Alaska Mileage Plan' },
];

/**
 * Profile & Loyalty Wallet Modal
 * ------------------------------
 * Lets travelers manage their Home Departure Airport plus Hotel & Airline loyalty
 * member numbers (never passwords!). Syncs to Supabase `public.profiles` when signed in
 * and mirrors to `localStorage` so guests keep their wallet seamlessly.
 */
export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  userProfile,
  homeAirport,
  loyaltyPrograms,
  initialCategory = 'hotel',
  onChangeHomeAirport,
  onSaveLoyaltyPrograms,
  onOpenAuth,
  onClose,
}) => {
  const [activeCategory, setActiveCategory] = useState<'hotel' | 'airline'>(initialCategory);
  const [selectedPreset, setSelectedPreset] = useState(
    initialCategory === 'hotel' ? HOTEL_PRESETS[0] : AIRLINE_PRESETS[0]
  );
  const [memberNumber, setMemberNumber] = useState('');
  const [tier, setTier] = useState('');
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const presets = activeCategory === 'hotel' ? HOTEL_PRESETS : AIRLINE_PRESETS;
  const filteredPrograms = loyaltyPrograms.filter((p) => p.category === activeCategory);

  const handleSwitchCategory = (cat: 'hotel' | 'airline') => {
    setActiveCategory(cat);
    setSelectedPreset(cat === 'hotel' ? HOTEL_PRESETS[0] : AIRLINE_PRESETS[0]);
    setMemberNumber('');
    setTier('');
  };

  const handleAddProgram = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = memberNumber.trim();
    if (!cleanNum) return;

    const id = `${activeCategory}-${selectedPreset.provider.toLowerCase().replace(/\s+/g, '-')}`;
    const entry: LoyaltyProgramEntry = {
      id,
      category: activeCategory,
      provider: selectedPreset.provider,
      programName: selectedPreset.programName,
      memberNumber: cleanNum,
      tier: tier.trim() || undefined,
    };

    const next = [...loyaltyPrograms.filter((p) => p.id !== id), entry];
    onSaveLoyaltyPrograms(next);
    setMemberNumber('');
    setTier('');
    setJustAddedId(id);
    window.setTimeout(() => setJustAddedId((curr) => (curr === id ? null : curr)), 1800);
  };

  const handleRemove = (id: string) => {
    onSaveLoyaltyPrograms(loyaltyPrograms.filter((p) => p.id !== id));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[1200] bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[540px] max-h-[88dvh] rounded-[26px] bg-[#FAF9F5] border border-black/[0.08] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <span className="font-editorial text-[22px] font-medium text-[#14191F]">
              Profile & Loyalty Wallet
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#5A626A] cursor-pointer"
            aria-label="Close profile settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto thin-scrollbar p-6 space-y-5">
          {/* Account & Home Airport Card */}
          <div className="rounded-[20px] bg-white border border-black/[0.08] p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              {userProfile ? (
                <div className="flex items-center gap-3 min-w-0">
                  {userProfile.avatarUrl ? (
                    <img
                      src={userProfile.avatarUrl}
                      alt={userProfile.name || userProfile.email}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-black/10 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#0E2034] flex items-center justify-center text-[14px] font-semibold shrink-0">
                      {(userProfile.name || userProfile.email)[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[#14191F] truncate">
                      {userProfile.name || userProfile.email.split('@')[0]}
                    </div>
                    <div className="text-[12px] text-[#7B828A] truncate">{userProfile.email}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-[#ECEAE2] flex items-center justify-center text-[#5A626A]">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-[#14191F]">Guest mode</div>
                      <div className="text-[11.5px] text-[#7B828A]">
                        Sign in to sync your Loyalty Wallet across devices
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuth();
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[12px] font-medium shrink-0 cursor-pointer"
                  >
                    Sign in
                  </button>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-[#2C333A]">
                <MapPin className="w-3.5 h-3.5 text-[#C85A17]" />
                <span>Home departure airport</span>
              </div>
              <select
                value={homeAirport}
                onChange={(e) => onChangeHomeAirport(e.target.value)}
                className="rounded-full bg-[#F3F2EC] border border-black/[0.09] px-3 py-1.5 text-[12.5px] font-semibold text-[#14191F] focus:outline-none cursor-pointer"
                aria-label="Home departure airport"
              >
                {HOME_AIRPORTS.map((ap) => (
                  <option key={ap} value={ap}>
                    {ap}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Loyalty Category Tabs: Hotels | Airlines */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1 rounded-full bg-[#ECEAE2] p-1">
                <button
                  type="button"
                  onClick={() => handleSwitchCategory('hotel')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all cursor-pointer ${
                    activeCategory === 'hotel'
                      ? 'bg-[#0E2034] shadow-2xs'
                      : 'text-[#5A626A] hover:text-[#14191F]'
                  }`}
                >
                  <BedDouble className="w-3.5 h-3.5" />
                  <span>Hotel Chains</span>
                  {loyaltyPrograms.filter((p) => p.category === 'hotel').length > 0 && (
                    <span className="font-tabular text-[10.5px] opacity-80">
                      ({loyaltyPrograms.filter((p) => p.category === 'hotel').length})
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchCategory('airline')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all cursor-pointer ${
                    activeCategory === 'airline'
                      ? 'bg-[#0E2034] shadow-2xs'
                      : 'text-[#5A626A] hover:text-[#14191F]'
                  }`}
                >
                  <Plane className="w-3.5 h-3.5" />
                  <span>Airlines</span>
                  {loyaltyPrograms.filter((p) => p.category === 'airline').length > 0 && (
                    <span className="font-tabular text-[10.5px] opacity-80">
                      ({loyaltyPrograms.filter((p) => p.category === 'airline').length})
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Saved Programs List */}
            {filteredPrograms.length > 0 && (
              <div className="space-y-2">
                {filteredPrograms.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl bg-white border border-black/[0.08] px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-[#F3F2EC] flex items-center justify-center text-[#C85A17] shrink-0">
                        <Award className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-[#14191F]">
                            {entry.programName}
                          </span>
                          {entry.tier && (
                            <span className="px-2 py-0.2 rounded-full bg-[#B68E35]/15 text-[#8E6C1E] text-[10.5px] font-semibold">
                              {entry.tier}
                            </span>
                          )}
                          {justAddedId === entry.id && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700">
                              <Check className="w-3 h-3" /> Saved
                            </span>
                          )}
                        </div>
                        <div className="font-tabular text-[12px] text-[#5A626A]">
                          #{entry.memberNumber}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(entry.id)}
                      className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#7B828A] hover:text-rose-600 cursor-pointer shrink-0"
                      title="Remove program"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add / Update Loyalty Entry Form */}
            <form
              onSubmit={handleAddProgram}
              className="rounded-[20px] bg-white border border-black/[0.08] p-4 space-y-3.5"
            >
              <div className="text-[12px] font-semibold uppercase tracking-wider text-[#5A626A]">
                Add {activeCategory === 'hotel' ? 'hotel loyalty program' : 'frequent flyer program'}
              </div>

              {/* Quick-select program chips */}
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => {
                  const active = selectedPreset.programName === p.programName;
                  return (
                    <button
                      key={p.programName}
                      type="button"
                      onClick={() => setSelectedPreset(p)}
                      className={`px-3 py-1 rounded-full text-[12px] font-medium border transition-all cursor-pointer ${
                        active
                          ? 'bg-[#0E2034] border-[#0E2034]'
                          : 'bg-[#FAF9F5] text-[#2C333A] border-black/[0.09] hover:border-black/[0.22]'
                      }`}
                    >
                      {p.programName}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-7 space-y-1">
                  <label className="text-[11px] font-semibold text-[#5A626A]">
                    Member number
                  </label>
                  <input
                    type="text"
                    required
                    value={memberNumber}
                    onChange={(e) => setMemberNumber(e.target.value)}
                    placeholder={activeCategory === 'hotel' ? 'e.g. 987654321' : 'e.g. MP123456'}
                    className="w-full rounded-xl bg-[#FAF9F5] border border-black/[0.1] px-3 py-2 font-tabular text-[13px] text-[#14191F] placeholder:text-[#8A9097] focus:outline-none focus:border-[#0E2034]"
                  />
                </div>
                <div className="sm:col-span-5 space-y-1">
                  <label className="text-[11px] font-semibold text-[#5A626A]">
                    Status tier (optional)
                  </label>
                  <input
                    type="text"
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    placeholder={activeCategory === 'hotel' ? 'e.g. Globalist' : 'e.g. Gold / 1K'}
                    className="w-full rounded-xl bg-[#FAF9F5] border border-black/[0.1] px-3 py-2 text-[13px] text-[#14191F] placeholder:text-[#8A9097] focus:outline-none focus:border-[#0E2034]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13px] font-medium flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Save {selectedPreset.programName}</span>
              </button>
            </form>

            {/* Security & Privacy Trust Note */}
            <div className="flex items-start gap-2 text-[11.5px] text-[#5A626A] px-1">
              <ShieldCheck className="w-4 h-4 text-[#0E2034] shrink-0 mt-0.5" />
              <span>
                <strong>Member numbers only</strong> — Vesper never asks for or stores your hotel or
                airline passwords. Used to prioritize points-eligible stays, alliance flights, and
                1-tap checkout copy.
              </span>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="shrink-0 px-6 py-3.5 border-t border-black/[0.06] bg-[#FAF9F5] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13px] font-medium cursor-pointer"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
