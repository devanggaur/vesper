import React, { useRef, useState } from 'react';
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
  SlidersHorizontal,
  DollarSign,
  Award,
  Sparkles,
  ThumbsUp,
  MessageSquare,
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
  likedIds: Set<string>;
  votes?: TripVote[];
  notes?: TripNote[];
  voterKey?: string;
  onVote?: (entityId: string, kind: CollabEntityKind, vote: 'up' | 'down' | 'clear') => void;
  onToggleLike: (id: string) => void;
  onOpenHotel: (hotel: HotelItem, openRooms?: boolean) => void;
  onHoverId: (id: string | null) => void;
}

export const HotelSearchCarousel: React.FC<HotelSearchCarouselProps> = ({
  location,
  dates,
  guests,
  hotels,
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
  const [fourPlusOnly, setFourPlusOnly] = useState(true);
  const [sortBy, setSortBy] = useState<'best' | 'price'>('best');

  const voteCountFor = (hotelId: string) =>
    votes.filter((v) => v.entityId === hotelId && v.vote === 'up').length;

  const maxHotelVotes = hotels.reduce((m, h) => Math.max(m, voteCountFor(h.id)), 0);

  const filtered = [...hotels]
    .filter((h) => (!fourPlusOnly ? true : h.stars >= 4))
    .sort((a, b) => {
      if (sortBy === 'price') return a.priceTotal - b.priceTotal;
      const vDiff = voteCountFor(b.id) - voteCountFor(a.id);
      if (vDiff !== 0) return vDiff;
      return b.rating - a.rating;
    });

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

      {/* Filter Pills */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFourPlusOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border shrink-0 transition-colors cursor-pointer ${
              fourPlusOnly
                ? 'bg-[#0E2034] text-white border-[#0E2034]'
                : 'bg-white text-[#2C333A] border-black/[0.1]'
            }`}
          >
            <Star className="w-3 h-3 fill-current" />
            <span>4+ stars</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          <button
            onClick={() => setSortBy((s) => (s === 'price' ? 'best' : 'price'))}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium border shrink-0 cursor-pointer ${
              sortBy === 'price'
                ? 'bg-[#0E2034] text-white border-[#0E2034]'
                : 'bg-white text-[#2C333A] border-black/[0.1]'
            }`}
          >
            <DollarSign className="w-3 h-3" />
            <span>Price</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium border bg-white text-[#2C333A] border-black/[0.1] shrink-0">
            <Award className="w-3 h-3 text-[#7B828A]" />
            <span>Rating</span>
            <ChevronDown className="w-3 h-3 text-[#7B828A]" />
          </span>

          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium border bg-white text-[#2C333A] border-black/[0.1] shrink-0">
            <SlidersHorizontal className="w-3 h-3 text-[#7B828A]" />
            <span>Filters</span>
          </span>
        </div>

        <button
          onClick={() => setSortBy((s) => (s === 'best' ? 'price' : 'best'))}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium border bg-white text-[#2C333A] border-black/[0.1] shrink-0 cursor-pointer"
        >
          <Sparkles className="w-3 h-3 text-[#7B828A]" />
          <span>{sortBy === 'best' ? 'Best' : 'Lowest'}</span>
        </button>
      </div>

      {/* Results Header + Arrows */}
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-[#5A626A]">
          Top {filtered.length} of 370 available hotels.
        </span>
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

      {/* Horizontal Hotel Cards */}
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
