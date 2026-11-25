import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, MapPin, Calendar, Sparkles, LogOut, User, Award } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { ThemeSwitcher, VesperTheme } from './ThemeSwitcher';
import { TripSummary } from '../../types/travel';

interface TripSidebarProps {
  isOpen: boolean;
  theme: VesperTheme;
  userProfile?: { email: string; name?: string; avatarUrl?: string } | null;
  loyaltyCount?: number;
  onChangeTheme: (t: VesperTheme) => void;
  onClose: () => void;
  currentTripTitle: string;
  recentTrips: TripSummary[];
  onNewTrip: () => void;
  onSelectTrip: (tripId: string, slug?: string) => void;
  onStartPrompt: (prompt: string) => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

/**
 * Slide-out trip drawer housing saved trips, starter inspirations, Supabase Auth account
 * controls, Loyalty Wallet entry point, and the Vesper theme switcher.
 */
export const TripSidebar: React.FC<TripSidebarProps> = ({
  isOpen,
  theme,
  userProfile,
  loyaltyCount = 0,
  onChangeTheme,
  onClose,
  currentTripTitle,
  recentTrips,
  onNewTrip,
  onSelectTrip,
  onStartPrompt,
  onOpenProfile,
  onOpenAuth,
  onSignOut,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-[1100]"
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed left-0 top-0 bottom-0 w-[296px] bg-[#F7F6F1] border-r border-black/[0.08] shadow-2xl z-[1110] flex flex-col p-4"
          >
            <div className="flex items-center justify-between pb-4 border-b border-black/[0.06]">
              <div className="flex items-center gap-2.5">
                <BrandMark size={28} />
                <span className="font-editorial text-[24px] font-medium text-[#14191F]">
                  Vesper
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#5A626A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => {
                onNewTrip();
                onClose();
              }}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13px] font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Plan a new trip</span>
            </button>

            <div className="mt-6 flex-1 overflow-y-auto">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8A9097] px-2 mb-2">
                Your Trips
              </div>

              {recentTrips.length > 0 ? (
                recentTrips.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onSelectTrip(t.id, t.slug);
                      onClose();
                    }}
                    className="w-full text-left p-3 rounded-2xl bg-white border border-black/[0.08] shadow-xs hover:border-black/[0.16] transition-all cursor-pointer mb-2"
                  >
                    <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[#14191F]">
                      <MapPin className="w-3.5 h-3.5 text-[#C85A17] shrink-0" />
                      <span className="truncate">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11.5px] text-[#5A626A]">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {t.destination} · {t.datesLabel}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <button
                  onClick={() => {
                    onStartPrompt('Plan a modernist architecture & food weekend in Mexico City');
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-2xl bg-white border border-black/[0.08] shadow-xs hover:border-black/[0.16] transition-all cursor-pointer mb-2"
                >
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[#14191F]">
                    <MapPin className="w-3.5 h-3.5 text-[#C85A17]" />
                    <span className="truncate">{currentTripTitle || 'Mexico City Weekend'}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11.5px] text-[#5A626A]">
                    <Calendar className="w-3 h-3" />
                    <span>Tap to compose a new trip</span>
                  </div>
                </button>
              )}

              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8A9097] px-2 mt-5 mb-2">
                Quick Inspirations
              </div>
              {[
                {
                  name: 'Banff & Lake Louise Family Loop',
                  dates: '5 days · Alpine lakes & wildlife',
                  prompt: 'Plan a 5-day family road trip through Banff and Lake Louise with scenic hikes and mountain lodges',
                },
                {
                  name: 'Kyoto Timber & Tea',
                  dates: '4 days · Temples, gardens & kaiseki',
                  prompt: 'Plan a 4-day Kyoto trip focused on temples, gardens, craft architecture, and kaiseki dining',
                },
                {
                  name: 'Lisbon Tiles & Coast',
                  dates: '4 days · Miradouros, trams & seafood',
                  prompt: 'Plan a 4-day Lisbon getaway with historic neighborhoods, coastal day trips, and local seafood',
                },
              ].map((item) => (
                <div
                  key={item.name}
                  className="p-2.5 rounded-xl hover:bg-black/[0.04] transition-colors cursor-pointer"
                  onClick={() => {
                    onStartPrompt(item.prompt);
                    onClose();
                  }}
                >
                  <div className="text-[13px] font-medium text-[#2C333A]">{item.name}</div>
                  <div className="text-[11px] text-[#8A9097] mt-0.5">{item.dates}</div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-black/[0.06] space-y-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProfile();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white border border-black/[0.08] hover:border-black/[0.18] text-[12.5px] font-medium text-[#14191F] transition-colors cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#C85A17]" />
                  <span>Profile & Loyalty</span>
                </span>
                <span className="font-tabular text-[11px] px-2 py-0.5 rounded-full bg-[#F3F2EC] text-[#5A626A]">
                  {loyaltyCount > 0 ? `${loyaltyCount} saved` : 'Add'}
                </span>
              </button>

              <div className="space-y-1.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8A9097] px-1">
                  Atmosphere
                </div>
                <ThemeSwitcher theme={theme} onChange={onChangeTheme} />
              </div>

              {userProfile ? (
                <div className="flex items-center justify-between gap-2 px-1 pt-1">
                  <div className="flex items-center gap-2 text-xs text-[#2C333A] min-w-0">
                    {userProfile.avatarUrl ? (
                      <img
                        src={userProfile.avatarUrl}
                        alt={userProfile.name || userProfile.email}
                        referrerPolicy="no-referrer"
                        className="w-7 h-7 rounded-full object-cover shrink-0 border border-black/10"
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-[#0E2034] flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {(userProfile.name || userProfile.email)[0].toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      {userProfile.name && (
                        <div className="truncate font-semibold text-[#14191F] leading-tight">
                          {userProfile.name}
                        </div>
                      )}
                      <div className="truncate text-[11px] text-[#7B828A] leading-tight">
                        {userProfile.email}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSignOut();
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#5A626A] hover:text-[#14191F] px-2 py-1 rounded-lg hover:bg-black/[0.04] cursor-pointer shrink-0"
                    title="Sign out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between px-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAuth();
                    }}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#14191F] hover:underline cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5 text-[#C85A17]" />
                    <span>Sign in to sync trips</span>
                  </button>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B68E35] bg-[#B68E35]/10 px-2 py-0.5 rounded-full">
                    <Sparkles className="w-3 h-3" /> Vesper
                  </span>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
