import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  Plus,
  Check,
  Star,
  Clock,
  ArrowRight,
  ChevronDown,
  DollarSign,
  Award,
  Sparkles,
  ThumbsUp,
  MessageSquare,
  X,
} from 'lucide-react';
import {
  ActivityItem,
  CollabEntityKind,
  HotelItem,
  PlaceItem,
  TripNote,
  TripVote,
} from '../../types/travel';
import { SmartImage } from '../common/SmartImage';
import { renderInlineBold } from '../../utils/format';
import {
  getBookingTypeMeta,
  inferActivityBookingType,
  inferPlaceBookingType,
} from '../../utils/bookingHelpers';

/* ── Activities Carousel ──────────────────────────────────────────────── */
interface ActivityCarouselProps {
  title: string;
  activities: ActivityItem[];
  likedIds: Set<string>;
  onToggleLike: (id: string) => void;
  onOpenActivity: (activity: ActivityItem) => void;
  onHoverId: (id: string | null) => void;
}

export const ActivityCarousel: React.FC<ActivityCarouselProps> = ({
  title,
  activities,
  likedIds,
  onToggleLike,
  onOpenActivity,
  onHoverId,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-[#14191F]">{title}</h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => scrollBy(-1)}
            className="w-7 h-7 rounded-full border border-black/[0.1] bg-white hover:bg-black/[0.03] flex items-center justify-center text-[#4A535C] cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollBy(1)}
            className="w-7 h-7 rounded-full border border-black/[0.1] bg-white hover:bg-black/[0.03] flex items-center justify-center text-[#4A535C] cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-3.5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1 -mx-1 px-1"
      >
        {activities.map((act) => {
          const actBookingType = inferActivityBookingType(act);
          const actBadge = getBookingTypeMeta(actBookingType);
          return (
          <div
            key={act.id}
            onMouseEnter={() => onHoverId(act.id)}
            onMouseLeave={() => onHoverId(null)}
            className="w-[82vw] max-w-[310px] sm:w-[310px] snap-start shrink-0 rounded-[20px] bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(14,32,52,0.04)] overflow-hidden flex flex-col justify-between group"
          >
            <div>
              <div
                onClick={() => onOpenActivity(act)}
                className="relative h-[185px] overflow-hidden cursor-pointer"
              >
                <SmartImage
                  src={act.image}
                  alt={act.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span
                  className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold backdrop-blur-md shadow-xs ${
                    actBookingType === 'walk_in'
                      ? 'bg-white/90 text-[#2C333A]'
                      : 'bg-[#0E2034]/85 text-white'
                  }`}
                >
                  {actBadge.shortLabel}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLike(act.id);
                  }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-xs flex items-center justify-center text-white transition-colors cursor-pointer"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      likedIds.has(act.id) ? 'fill-rose-500 text-rose-500' : 'text-white'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3.5 space-y-1.5">
                <div
                  onClick={() => onOpenActivity(act)}
                  className="text-[13.5px] font-semibold text-[#14191F] truncate cursor-pointer hover:underline"
                >
                  {act.title}
                </div>
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-[#5A626A]">
                    <Star className="w-3.5 h-3.5 fill-[#C85A17] text-[#C85A17]" />
                    <span className="font-semibold text-[#14191F]">{act.rating.toFixed(1)}</span>
                    <span>({act.reviews.toLocaleString()})</span>
                    <span>·</span>
                    <Clock className="w-3 h-3" />
                    <span>{act.duration}</span>
                  </span>
                  <span className="text-[14px] font-semibold text-[#14191F]">
                    ${act.pricePerPerson}
                  </span>
                </div>
                <p className="text-[12px] text-[#5A626A] line-clamp-2 leading-relaxed pt-0.5">
                  {act.tagline}
                </p>
              </div>
            </div>

            <div className="px-3.5 pb-3.5 pt-1 grid grid-cols-2 gap-2">
              <button
                onClick={() => onOpenActivity(act)}
                className="py-2 px-3 rounded-full border border-black/[0.1] hover:border-[#0E2034] bg-[#FAF9F5] hover:bg-white text-[12.5px] font-medium text-[#14191F] transition-all cursor-pointer"
              >
                Tickets & dates
              </button>
              <button
                onClick={() => onOpenActivity(act)}
                className="py-2 px-3 rounded-full border border-black/[0.1] hover:border-[#0E2034] bg-[#FAF9F5] hover:bg-white text-[12.5px] font-medium text-[#14191F] flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <span>View details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Places Carousel (Museums, Contemporary Art, Food, Landmarks) ─────── */
interface PlaceCarouselProps {
  title?: string;
  intro?: string;
  places: PlaceItem[];
  savedRefIds: Set<string>;
  likedIds: Set<string>;
  onToggleSave: (place: PlaceItem) => void;
  onToggleLike: (id: string) => void;
  onSelectPlace: (place: PlaceItem) => void;
  onHoverId: (id: string | null) => void;
}

export const PlaceCarousel: React.FC<PlaceCarouselProps> = ({
  title,
  intro,
  places,
  savedRefIds,
  likedIds,
  onToggleSave,
  onToggleLike,
  onSelectPlace,
  onHoverId,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  };

  return (
    <div className="space-y-3">
      {title && (
        <h3 className="font-editorial text-[22px] font-medium text-[#14191F] tracking-[-0.015em]">
          {title}
        </h3>
      )}
      {intro && (
        <p className="text-[13.5px] leading-[1.6] text-[#2C333A] whitespace-pre-line">
          {renderInlineBold(intro)}
        </p>
      )}

      <div className="flex justify-end gap-1.5 -mb-1">
        <button
          onClick={() => scrollBy(-1)}
          className="w-7 h-7 rounded-full border border-black/[0.1] bg-white hover:bg-black/[0.03] flex items-center justify-center text-[#4A535C] cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => scrollBy(1)}
          className="w-7 h-7 rounded-full border border-black/[0.1] bg-white hover:bg-black/[0.03] flex items-center justify-center text-[#4A535C] cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-3.5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1 -mx-1 px-1"
      >
        {places.map((place) => {
          const isSaved = savedRefIds.has(place.id);
          const bookingType = inferPlaceBookingType(place);
          const bookingBadge = getBookingTypeMeta(bookingType);
          return (
            <div
              key={place.id}
              onMouseEnter={() => onHoverId(place.id)}
              onMouseLeave={() => onHoverId(null)}
              onClick={() => onSelectPlace(place)}
              className="w-[78vw] max-w-[275px] sm:w-[275px] snap-start shrink-0 rounded-[20px] bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(14,32,52,0.04)] overflow-hidden cursor-pointer group hover:border-black/[0.16] transition-all"
            >
              <div className="relative h-[185px] overflow-hidden">
                <SmartImage
                  src={place.image}
                  alt={place.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {/* Top-left Booking Requirement Pill */}
                <span
                  className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold backdrop-blur-md shadow-xs ${
                    bookingType === 'walk_in'
                      ? 'bg-white/92 text-[#2C333A]'
                      : bookingType === 'timed_ticket'
                      ? 'bg-amber-500/92 text-white'
                      : bookingType === 'reservation'
                      ? 'bg-[#0E2034]/88 text-white'
                      : 'bg-[#C85A17]/92 text-white'
                  }`}
                >
                  {bookingBadge.shortLabel}
                </span>
                {/* Top-right Add (+) / Added (✓) & Heart overlay buttons */}
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSave(place);
                    }}
                    title={isSaved ? 'Added to trip' : 'Add to trip'}
                    className={`w-8 h-8 rounded-full backdrop-blur-xs flex items-center justify-center transition-all cursor-pointer ${
                      isSaved
                        ? 'bg-[#0E2034] text-white shadow-md'
                        : 'bg-black/40 hover:bg-[#0E2034] text-white'
                    }`}
                  >
                    {isSaved ? <Check className="w-4 h-4" strokeWidth={2.4} /> : <Plus className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLike(place.id);
                    }}
                    className="w-8 h-8 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-xs flex items-center justify-center text-white transition-colors cursor-pointer"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        likedIds.has(place.id) ? 'fill-rose-500 text-rose-500' : 'text-white'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="p-3.5 space-y-1.5">
                <div className="text-[14px] font-semibold text-[#14191F] truncate">
                  {place.name}
                </div>
                <div className="flex items-center gap-1.5 text-[12px] text-[#5A626A]">
                  <Star className="w-3.5 h-3.5 fill-[#C85A17] text-[#C85A17]" />
                  <span className="font-semibold text-[#14191F]">{place.rating.toFixed(1)}</span>
                  <span>·</span>
                  <span>{place.reviews.toLocaleString()} reviews</span>
                  {place.priceTier && (
                    <>
                      <span>·</span>
                      <span>{place.priceTier}</span>
                    </>
                  )}
                </div>
                <p className="text-[12px] text-[#5A626A] line-clamp-2 leading-relaxed">
                  {place.shortDescription}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ── Hotel Search Bar + Filterable Horizontal Cards ───────────────────── */
interface HotelSearchCarouselProps {
  location: string;
  dates: string;
  guests: string;
  hotels: HotelItem[];
  isLoading?: boolean;
  likedIds: Set<string>;
  votes?: TripVote[];
  notes?: TripNote[];
  voterKey?: string;
  onVote?: (entityId: string, kind: CollabEntityKind, vote: 'up' | 'down' | 'clear') => void;
  onToggleLike: (id: string) => void;
  onOpenHotel: (hotel: HotelItem, openRooms?: boolean) => void;
  onHoverId: (id: string | null) => void;
}

type HotelStarsFilter = 'any' | '4plus' | '5only';
type HotelSortMode = 'best' | 'price' | 'rating' | 'reviews';

export const HotelSearchCarousel: React.FC<HotelSearchCarouselProps> = ({
  location,
  dates,
  guests,
  hotels,
  isLoading = false,
  likedIds,
  votes = [],
  notes = [],
  voterKey,
  onVote,
  onToggleLike,
  onOpenHotel,
  onHoverId,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [starsFilter, setStarsFilter] = useState<HotelStarsFilter>('any');
  const [maxPricePerNight, setMaxPricePerNight] = useState<number | null>(null);
  const [minRating, setMinRating] = useState<number>(0);
  const [sortBy, setSortBy] = useState<HotelSortMode>('best');
  const [openMenu, setOpenMenu] = useState<'stars' | 'price' | 'rating' | 'sort' | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (filterBarRef.current && !filterBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  const getNightlyPrice = (h: HotelItem) => h.pricePerNight || Math.round(h.priceTotal / 3);

  const voteCountFor = (hotelId: string) =>
    votes.filter((v) => v.entityId === hotelId && v.vote === 'up').length;

  const maxHotelVotes = hotels.reduce((m, h) => Math.max(m, voteCountFor(h.id)), 0);

  const filtered = [...hotels]
    .filter((h) => {
      if (starsFilter === '4plus' && h.stars < 4) return false;
      if (starsFilter === '5only' && h.stars < 5) return false;
      if (maxPricePerNight !== null && getNightlyPrice(h) > maxPricePerNight) return false;
      if (minRating > 0 && h.rating < minRating) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'price') return a.priceTotal - b.priceTotal;
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'reviews') return b.reviews - a.reviews;
      const vDiff = voteCountFor(b.id) - voteCountFor(a.id);
      if (vDiff !== 0) return vDiff;
      return b.rating - a.rating;
    });

  const hasActiveFilters =
    starsFilter !== 'any' || maxPricePerNight !== null || minRating > 0;

  const resetFilters = () => {
    setStarsFilter('any');
    setMaxPricePerNight(null);
    setMinRating(0);
  };

  const starsPillLabel =
    starsFilter === '5only' ? '5 stars' : starsFilter === '4plus' ? '4+ stars' : 'Stars';
  const pricePillLabel = maxPricePerNight !== null ? `≤ $${maxPricePerNight}/n` : 'Price';
  const ratingPillLabel = minRating > 0 ? `${minRating.toFixed(1)}+` : 'Rating';
  const sortPillLabel =
    sortBy === 'price'
      ? 'Lowest price'
      : sortBy === 'rating'
      ? 'Highest rated'
      : sortBy === 'reviews'
      ? 'Most reviewed'
      : 'Best';

  const scrollBy = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <div className="space-y-3.5">
      {/* Inline Search Bar */}
      <div className="rounded-[18px] bg-white border border-black/[0.08] grid grid-cols-2 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-black/[0.07] shadow-2xs overflow-hidden">
        <div className="px-3.5 py-2.5 col-span-2 sm:col-span-1">
          <div className="text-[10.5px] text-[#7B828A]">Where</div>
          <div className="text-[13px] font-semibold text-[#14191F] truncate">{location}</div>
        </div>
        <div className="px-3.5 py-2.5 border-r sm:border-r-0 border-black/[0.07]">
          <div className="text-[10.5px] text-[#7B828A]">When</div>
          <div className="text-[13px] font-semibold text-[#14191F] truncate">{dates}</div>
        </div>
        <div className="px-3.5 py-2.5">
          <div className="text-[10.5px] text-[#7B828A]">Guests</div>
          <div className="text-[13px] font-semibold text-[#14191F] truncate">{guests}</div>
        </div>
      </div>

      {/* Interactive Hotel Filter & Sort Dropdowns */}
      <div
        ref={filterBarRef}
        className="flex items-center justify-between gap-2 flex-wrap relative z-30"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {/* 1. Stars Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'stars' ? null : 'stars'))}
              aria-expanded={openMenu === 'stars'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border shrink-0 transition-colors cursor-pointer ${
                starsFilter !== 'any' || openMenu === 'stars'
                  ? 'bg-[#0E2034] text-white border-[#0E2034]'
                  : 'bg-white text-[#2C333A] border-black/[0.1] hover:border-black/[0.25]'
              }`}
              style={
                starsFilter !== 'any' || openMenu === 'stars' ? { color: '#FFFFFF' } : undefined
              }
            >
              <Star className="w-3 h-3" />
              <span>{starsPillLabel}</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${openMenu === 'stars' ? 'rotate-180' : ''}`}
              />
            </button>

            {openMenu === 'stars' && (
              <div className="absolute left-0 top-full mt-1.5 w-48 rounded-2xl bg-white border border-black/[0.1] shadow-xl p-2 space-y-1 z-40">
                {(
                  [
                    { id: 'any', label: 'Any stars', count: hotels.length },
                    { id: '4plus', label: '4+ stars', count: hotels.filter((h) => h.stars >= 4).length },
                    { id: '5only', label: '5 stars only', count: hotels.filter((h) => h.stars >= 5).length },
                  ] as const
                ).map((opt) => {
                  const selected = starsFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setStarsFilter(opt.id);
                        setOpenMenu(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12.5px] transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#F3F2EC] font-semibold text-[#14191F]'
                          : 'text-[#2C333A] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="font-tabular text-[11px] text-[#7B828A]">{opt.count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Price Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'price' ? null : 'price'))}
              aria-expanded={openMenu === 'price'}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium border shrink-0 transition-colors cursor-pointer ${
                maxPricePerNight !== null || openMenu === 'price'
                  ? 'bg-[#0E2034] text-white border-[#0E2034]'
                  : 'bg-white text-[#2C333A] border-black/[0.1] hover:border-black/[0.25]'
              }`}
              style={
                maxPricePerNight !== null || openMenu === 'price'
                  ? { color: '#FFFFFF' }
                  : undefined
              }
            >
              <DollarSign className="w-3 h-3" />
              <span>{pricePillLabel}</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${openMenu === 'price' ? 'rotate-180' : ''}`}
              />
            </button>

            {openMenu === 'price' && (
              <div className="absolute left-0 top-full mt-1.5 w-64 rounded-2xl bg-white border border-black/[0.1] shadow-xl p-3.5 space-y-3 z-40">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-[#14191F]">Max price / night</span>
                  <span className="font-tabular text-[#5A626A]">
                    {maxPricePerNight !== null ? `Up to $${maxPricePerNight}` : 'Any'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'Any price', val: null },
                    { label: 'Under $250/n', val: 250 },
                    { label: 'Under $350/n', val: 350 },
                    { label: 'Under $500/n', val: 500 },
                  ].map((preset) => {
                    const active = maxPricePerNight === preset.val;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setMaxPricePerNight(preset.val)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11.5px] font-medium border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#0E2034] text-white border-[#0E2034]'
                            : 'bg-[#FAF9F5] text-[#2C333A] border-black/[0.08] hover:border-black/[0.2]'
                        }`}
                        style={active ? { color: '#FFFFFF' } : undefined}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1">
                  <input
                    type="range"
                    min={120}
                    max={800}
                    step={20}
                    value={maxPricePerNight ?? 800}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMaxPricePerNight(v >= 800 ? null : v);
                    }}
                    className="w-full accent-[#0E2034] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10.5px] font-tabular text-[#7B828A]">
                    <span>$120/n</span>
                    <span>$800+/n</span>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpenMenu(null)}
                    className="px-3 py-1 rounded-full bg-[#0E2034] text-[11.5px] font-medium cursor-pointer"
                    style={{ color: '#FFFFFF' }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. Guest Rating Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'rating' ? null : 'rating'))}
              aria-expanded={openMenu === 'rating'}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium border shrink-0 transition-colors cursor-pointer ${
                minRating > 0 || openMenu === 'rating'
                  ? 'bg-[#0E2034] text-white border-[#0E2034]'
                  : 'bg-white text-[#2C333A] border-black/[0.1] hover:border-black/[0.25]'
              }`}
              style={minRating > 0 || openMenu === 'rating' ? { color: '#FFFFFF' } : undefined}
            >
              <Award className="w-3 h-3" />
              <span>{ratingPillLabel}</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform ${openMenu === 'rating' ? 'rotate-180' : ''}`}
              />
            </button>

            {openMenu === 'rating' && (
              <div className="absolute left-0 top-full mt-1.5 w-52 rounded-2xl bg-white border border-black/[0.1] shadow-xl p-2 space-y-1 z-40">
                {[
                  { val: 0, label: 'Any rating' },
                  { val: 8.5, label: '8.5+ Very good' },
                  { val: 9.0, label: '9.0+ Wonderful' },
                  { val: 9.5, label: '9.5+ Exceptional' },
                ].map((opt) => {
                  const selected = minRating === opt.val;
                  const count = hotels.filter((h) => h.rating >= opt.val).length;
                  return (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => {
                        setMinRating(opt.val);
                        setOpenMenu(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12.5px] transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#F3F2EC] font-semibold text-[#14191F]'
                          : 'text-[#2C333A] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="font-tabular text-[11px] text-[#7B828A]">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11.5px] font-medium text-[#C85A17] hover:bg-black/[0.04] cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* 4. Sort Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((m) => (m === 'sort' ? null : 'sort'))}
            aria-expanded={openMenu === 'sort'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border shrink-0 transition-colors cursor-pointer ${
              openMenu === 'sort'
                ? 'bg-[#0E2034] text-white border-[#0E2034]'
                : 'bg-white text-[#2C333A] border-black/[0.1] hover:border-black/[0.25]'
            }`}
            style={openMenu === 'sort' ? { color: '#FFFFFF' } : undefined}
          >
            <Sparkles className="w-3 h-3" />
            <span>{sortPillLabel}</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform ${openMenu === 'sort' ? 'rotate-180' : ''}`}
            />
          </button>

          {openMenu === 'sort' && (
            <div className="absolute right-0 top-full mt-1.5 w-48 rounded-2xl bg-white border border-black/[0.1] shadow-xl p-2 space-y-1 z-40">
              {(
                [
                  { id: 'best', label: 'Best match' },
                  { id: 'price', label: 'Lowest price' },
                  { id: 'rating', label: 'Highest rated' },
                  { id: 'reviews', label: 'Most reviewed' },
                ] as const
              ).map((opt) => {
                const selected = sortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSortBy(opt.id);
                      setOpenMenu(null);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12.5px] transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#F3F2EC] font-semibold text-[#14191F]'
                        : 'text-[#2C333A] hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {selected && <Check className="w-3.5 h-3.5 text-[#0E2034]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Results Header + Arrows */}
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-[#5A626A]">
          {isLoading
            ? `Finding stays in ${location}...`
            : `${filtered.length} ${filtered.length === 1 ? 'stay' : 'stays'} in ${location}`}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => scrollBy(-1)}
            aria-label="Scroll stays left"
            className="w-7 h-7 rounded-full border border-black/[0.1] bg-white hover:bg-black/[0.03] flex items-center justify-center text-[#4A535C] cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scrollBy(1)}
            aria-label="Scroll stays right"
            className="w-7 h-7 rounded-full border border-black/[0.1] bg-white hover:bg-black/[0.03] flex items-center justify-center text-[#4A535C] cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Hotel Cards (or Empty Filter State) */}
      {filtered.length === 0 ? (
        <div className="rounded-[20px] bg-white border border-black/[0.08] p-6 text-center space-y-2.5">
          <div className="text-[13.5px] font-semibold text-[#14191F]">
            No stays match your current filters
          </div>
          <p className="text-[12px] text-[#7B828A]">
            Try widening your nightly budget, star class, or minimum rating.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0E2034] text-[12px] font-medium cursor-pointer"
            style={{ color: '#FFFFFF' }}
          >
            <span>Reset filters</span>
          </button>
        </div>
      ) : (
      <div ref={scrollRef} className="flex gap-3 sm:gap-3.5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1 -mx-1 px-1">
        {filtered.map((hotel) => {
          const hotelUpvotes = votes.filter((v) => v.entityId === hotel.id && v.vote === 'up');
          const myVote = voterKey
            ? votes.find((v) => v.entityId === hotel.id && v.voterKey === voterKey)?.vote
            : undefined;
          const hotelNotesCount = notes.filter((n) => n.entityId === hotel.id).length;
          const isTopVoted = maxHotelVotes > 0 && hotelUpvotes.length === maxHotelVotes;

          return (
          <div
            key={hotel.id}
            onMouseEnter={() => onHoverId(hotel.id)}
            onMouseLeave={() => onHoverId(null)}
            className="w-[82vw] max-w-[300px] sm:w-[300px] snap-start shrink-0 rounded-[20px] bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(14,32,52,0.04)] overflow-hidden flex flex-col justify-between group"
          >
            <div>
              <div
                onClick={() => onOpenHotel(hotel, false)}
                className="relative h-[180px] overflow-hidden cursor-pointer"
              >
                <SmartImage
                  src={hotel.image}
                  alt={hotel.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  {isTopVoted && (
                    <span className="px-2.5 py-0.5 rounded-full bg-[#0E2034]/92 text-white text-[10.5px] font-semibold backdrop-blur-md shadow-xs">
                      ★ Top voted
                    </span>
                  )}
                </div>
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {onVote && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVote(hotel.id, 'hotel', myVote === 'up' ? 'clear' : 'up');
                      }}
                      title={
                        hotelUpvotes.length > 0
                          ? `Voted by ${hotelUpvotes.map((v) => v.voterName).join(', ')}`
                          : 'Vote for this stay'
                      }
                      className={`h-8 px-2.5 rounded-full backdrop-blur-xs inline-flex items-center gap-1 text-[11.5px] font-semibold transition-all cursor-pointer ${
                        myVote === 'up'
                          ? 'bg-[#0E2034] text-white shadow-md'
                          : 'bg-black/45 hover:bg-[#0E2034] text-white'
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      {hotelUpvotes.length > 0 && (
                        <span className="font-tabular">{hotelUpvotes.length}</span>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLike(hotel.id);
                    }}
                    className="w-8 h-8 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-xs flex items-center justify-center text-white cursor-pointer"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        likedIds.has(hotel.id) ? 'fill-rose-500 text-rose-500' : 'text-white'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="p-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div
                    onClick={() => onOpenHotel(hotel, false)}
                    className="text-[14px] font-semibold text-[#14191F] truncate cursor-pointer hover:underline"
                  >
                    {hotel.name}
                  </div>
                  <div className="text-right shrink-0 leading-tight">
                    <div className="font-tabular text-[14.5px] font-semibold text-[#14191F]">
                      ${hotel.priceTotal.toLocaleString()}
                    </div>
                    {hotel.pricePerNight ? (
                      <div className="font-tabular text-[10.5px] text-[#7B828A]">
                        ${hotel.pricePerNight}/night
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[12px] text-[#5A626A] flex-wrap">
                  <span className="px-1.5 py-0.2 rounded-full bg-[#B68E35]/15 text-[#8E6C1E] font-bold text-[11px]">
                    {hotel.rating.toFixed(1)}
                  </span>
                  <span>{hotel.reviews.toLocaleString()} reviews</span>
                  <span>·</span>
                  <span>{hotel.stars}-star hotel</span>
                  {hotel.freeCancellation && (
                    <span className="text-[10.5px] font-semibold text-emerald-700">
                      · Free cancel
                    </span>
                  )}
                  {hotelNotesCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#14191F]">
                      · <MessageSquare className="w-3 h-3 text-[#C85A17]" /> {hotelNotesCount}
                    </span>
                  )}
                </div>

                <p className="text-[12px] text-[#5A626A] line-clamp-2 leading-relaxed pt-0.5">
                  {hotel.shortDescription}
                </p>
              </div>
            </div>

            <div className="px-3.5 pb-3.5 pt-1 grid grid-cols-2 gap-2">
              <button
                onClick={() => onOpenHotel(hotel, true)}
                className="py-2 px-3 rounded-full border border-black/[0.1] hover:border-[#0E2034] bg-[#FAF9F5] hover:bg-white text-[12.5px] font-medium text-[#14191F] transition-all cursor-pointer"
              >
                View rooms
              </button>
              <button
                onClick={() => onOpenHotel(hotel, false)}
                className="py-2 px-3 rounded-full border border-black/[0.1] hover:border-[#0E2034] bg-[#FAF9F5] hover:bg-white text-[12.5px] font-medium text-[#14191F] flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <span>View more</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

/* ── AI Comparison Table for Curated Top Hotels ───────────────────────── */
interface HotelComparisonTableProps {
  intro: string;
  hotels: HotelItem[];
  onOpenHotel: (hotel: HotelItem) => void;
}

export const HotelComparisonTable: React.FC<HotelComparisonTableProps> = ({
  intro,
  hotels,
  onOpenHotel,
}) => {
  return (
    <div className="space-y-3">
      <p className="text-[13.5px] leading-[1.6] text-[#14191F]">{renderInlineBold(intro)}</p>

      <div className="rounded-[18px] bg-white border border-black/[0.08] overflow-hidden shadow-2xs">
        <div className="hidden sm:grid grid-cols-12 border-b border-black/[0.07] bg-[#FAF9F5] px-4 py-2.5 text-[12px] font-semibold text-[#4A535C]">
          <div className="col-span-4">Pick</div>
          <div className="col-span-8">Why I'd choose it</div>
        </div>
        <div className="divide-y divide-black/[0.06]">
          {hotels.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onOpenHotel(h)}
              className="w-full flex flex-col sm:grid sm:grid-cols-12 gap-1.5 sm:gap-3 px-4 py-3 text-left hover:bg-[#F7F6F1] transition-colors cursor-pointer"
            >
              <div className="sm:col-span-4 text-[13px] sm:text-[12.5px] leading-snug">
                <span className="font-semibold text-[#14191F]">
                  {h.pickLabel || 'Top pick'}:{' '}
                </span>
                <span className="underline decoration-black/40 font-medium text-[#0E2034]">
                  {h.name}
                </span>
                <span className="text-[#5A626A]"> — ${h.priceTotal} total</span>
              </div>
              <div className="sm:col-span-8 text-[12.5px] leading-relaxed text-[#4A535C]">
                {h.whyChoose || h.shortDescription}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
