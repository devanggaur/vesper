import React, { useEffect, useMemo, useState } from 'react';
import { BedDouble, Plane, ArrowRight, CheckCircle2, Award, X, Users, Car, MapPin } from 'lucide-react';
import {
  CollabEntityKind,
  FareClass,
  FlightOption,
  HotelItem,
  LoyaltyProgramEntry,
  RoadTripConfig,
  TripDayMeta,
  TripMode,
  TripNote,
  TripSavedItem,
  TripVote,
} from '../../types/travel';
import { LiveHotelSearchResponse, travelApi } from '../../services/travelApi';
import { HotelComparisonTable, HotelSearchCarousel } from './DiscoverCarousels';
import { FlightSearchWidget } from './FlightSearchWidget';
import { SmartImage } from '../common/SmartImage';

interface CanvasBookingsProps {
  subTab: 'stays' | 'flights';
  onChangeSubTab: (tab: 'stays' | 'flights') => void;
  homeAirport?: string;
  onChangeHomeAirport?: (airport: string) => void;
  loyaltyPrograms?: LoyaltyProgramEntry[];
  onOpenLoyaltyWallet?: (category: 'hotel' | 'airline') => void;
  destination?: string;
  datesLabel?: string;
  travelers?: string;
  days?: TripDayMeta[];
  tripMode?: TripMode;
  roadTrip?: RoadTripConfig | null;
  activeTown?: string | null;
  onChangeActiveTown?: (town: string | null) => void;
  hotels?: HotelItem[];
  items: TripSavedItem[];
  likedIds: Set<string>;
  votes?: TripVote[];
  notes?: TripNote[];
  voterKey?: string;
  readOnly?: boolean;
  onVote?: (entityId: string, kind: CollabEntityKind, vote: 'up' | 'down' | 'clear') => void;
  onOpenSharePoll?: () => void;
  onToggleLike: (id: string) => void;
  onOpenHotel: (hotel: HotelItem, openRooms?: boolean) => void;
  onAddFlights: (outbound: FlightOption, inbound: FlightOption, fare: FareClass) => void;
  onOpenCheckout: () => void;
  onHoverId: (id: string | null) => void;
}

/**
 * Bookings Studio canvas tab combining Boutique Stays comparison, Round-Trip Flight search,
 * and right-moment Loyalty Wallet nudges so users earn hotel points & frequent flyer miles.
 */
export const CanvasBookings: React.FC<CanvasBookingsProps> = ({
  subTab,
  onChangeSubTab,
  homeAirport = 'San Francisco (SFO)',
  onChangeHomeAirport,
  loyaltyPrograms = [],
  onOpenLoyaltyWallet,
  destination = 'Mexico City',
  datesLabel = 'Jun 19 – 21',
  travelers = '2 adults',
  days = [],
  tripMode = 'city',
  roadTrip = null,
  activeTown = null,
  onChangeActiveTown,
  hotels: liveHotels,
  items,
  likedIds,
  votes = [],
  notes = [],
  voterKey,
  readOnly = false,
  onVote,
  onOpenSharePoll,
  onToggleLike,
  onOpenHotel,
  onAddFlights,
  onOpenCheckout,
  onHoverId,
}) => {
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const [liveHotelRes, setLiveHotelRes] = useState<LiveHotelSearchResponse | null>(null);
  const [isLoadingHotels, setIsLoadingHotels] = useState(false);

  const isRoadTrip = tripMode === 'roadtrip';
  const isDriveFromHome = isRoadTrip && roadTrip?.transportMode !== 'fly_drive';
  const overnightTowns = useMemo(() => {
    if (!isRoadTrip) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const d of days) {
      const t = (d.overnightTown || d.legTo || '').trim();
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        list.push(t);
      }
    }
    return list;
  }, [isRoadTrip, days]);

  const effectiveStayDestination = isRoadTrip && activeTown ? activeTown : destination;

  const curatedHotels = liveHotels && liveHotels.length > 0 ? liveHotels : travelApi.getHotels();
  const preferredChains = useMemo(
    () => loyaltyPrograms.filter((p) => p.category === 'hotel').map((p) => p.provider),
    [loyaltyPrograms]
  );
  const preferredChainsKey = preferredChains.join(',');

  const parsedAdults = useMemo(() => {
    const m = travelers.match(/\d+/);
    if (m) return Math.min(8, Math.max(1, parseInt(m[0], 10)));
    if (travelers.toLowerCase().includes('solo')) return 1;
    return 2;
  }, [travelers]);

  useEffect(() => {
    if (subTab !== 'stays' || !effectiveStayDestination) return;
    let cancelled = false;
    setIsLoadingHotels(true);
    travelApi
      .searchHotels({
        destination: effectiveStayDestination,
        datesLabel,
        adults: parsedAdults,
        preferredChains: preferredChains.length > 0 ? preferredChains : undefined,
      })
      .then((res) => {
        if (!cancelled) {
          setLiveHotelRes(res);
          setIsLoadingHotels(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingHotels(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, effectiveStayDestination, datesLabel, parsedAdults, preferredChainsKey]);

  // Merge live SerpApi hotel rates with curated stays (preserving curated insider sleep tips & overnightTown tags)
  const hotels = useMemo(() => {
    const townScopedCurated =
      isRoadTrip && activeTown
        ? curatedHotels.filter(
            (h) =>
              h.overnightTown?.toLowerCase() === activeTown.toLowerCase() ||
              h.neighborhood.toLowerCase().includes(activeTown.toLowerCase().split(',')[0])
          )
        : curatedHotels;
    const baseCurated = townScopedCurated.length > 0 ? townScopedCurated : curatedHotels;

    const liveList = (liveHotelRes?.hotels || []).map((lh) =>
      isRoadTrip && activeTown ? { ...lh, overnightTown: activeTown } : lh
    );
    if (liveList.length === 0) return baseCurated;
    const seenNames = new Set<string>();
    const merged: HotelItem[] = [];
    for (const lh of liveList) {
      const key = lh.name.toLowerCase().trim();
      seenNames.add(key);
      const match = baseCurated.find(
        (ch) =>
          ch.name.toLowerCase().includes(key.slice(0, 14)) ||
          key.includes(ch.name.toLowerCase().slice(0, 14))
      );
      merged.push(
        match
          ? {
              ...lh,
              overnightTown: lh.overnightTown || match.overnightTown,
              whyChoose: match.whyChoose || lh.whyChoose,
              pickLabel: match.pickLabel || lh.pickLabel,
              deepDive: match.deepDive.length > 0 ? match.deepDive : lh.deepDive,
              coords:
                lh.coords.lat !== 0 && lh.coords.lng !== 0 ? lh.coords : match.coords,
            }
          : lh
      );
    }
    for (const ch of baseCurated) {
      const key = ch.name.toLowerCase().trim();
      if (!seenNames.has(key) && merged.length < 10) {
        merged.push(ch);
      }
    }
    return merged;
  }, [curatedHotels, liveHotelRes, isRoadTrip, activeTown]);

  const bookedHotels = items.filter((i) => i.type === 'hotel');
  const bookedHotel =
    isRoadTrip && activeTown
      ? bookedHotels.find(
          (h) => h.hotelDetails?.overnightTown?.toLowerCase() === activeTown.toLowerCase()
        )
      : bookedHotels[0];
  const bookedFlight = items.find((i) => i.type === 'flight');
  const bookedTours = items.filter((i) => i.type === 'activity');
  const totalCost = items.reduce((s, i) => s + (i.price || 0), 0);

  const topPicks = hotels.slice(0, 4);
  const activeCategory: 'hotel' | 'airline' = subTab === 'stays' ? 'hotel' : 'airline';
  const relevantLoyalty = loyaltyPrograms.filter((p) => p.category === activeCategory);
  const preferredAirlines = loyaltyPrograms
    .filter((p) => p.category === 'airline')
    .map((p) => p.provider);

  return (
    <div className="max-w-[860px] mx-auto w-full space-y-6 pb-20 lg:pb-12">
      {/* Bookings Overview Banner */}
      <div className="rounded-[22px] bg-white border border-black/[0.08] p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7B828A]">
            Booking Studio · {destination} · {datesLabel} · {travelers}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[13px] font-medium text-[#2C333A]">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2
                className={`w-4 h-4 ${bookedHotels.length > 0 ? 'text-emerald-600' : 'text-[#8A9097] opacity-40'}`}
              />
              <span>
                {isRoadTrip
                  ? `Stays: ${bookedHotels.length}${overnightTowns.length > 0 ? `/${overnightTowns.length} stops` : ' selected'}`
                  : `Stay: ${bookedHotel ? bookedHotel.title : 'Not selected'}`}
              </span>
            </span>
            <span className="text-black/15">·</span>
            {isDriveFromHome ? (
              <span className="inline-flex items-center gap-1.5 text-[#2C333A]">
                <Car className="w-4 h-4 text-[#C85A17]" />
                <span>Driving from {roadTrip?.startCity || 'home'}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2
                  className={`w-4 h-4 ${bookedFlight ? 'text-emerald-600' : 'text-[#8A9097] opacity-40'}`}
                />
                <span>Flights: {bookedFlight ? bookedFlight.flightDetails?.outbound.airline : 'Not selected'}</span>
              </span>
            )}
            {bookedTours.length > 0 && (
              <>
                <span className="text-black/15">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{bookedTours.length} tour</span>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <div className="text-left sm:text-right">
            <div className="text-[11px] text-[#7B828A]">Trip total</div>
            <div className="font-tabular text-[20px] font-semibold text-[#14191F] leading-tight">
              ${totalCost.toLocaleString()}
            </div>
          </div>
          {!readOnly && (
            <button
              onClick={onOpenCheckout}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13px] font-medium shadow-xs transition-all cursor-pointer"
            >
              <span>Continue to book</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab Switcher: Boutique Stays | Round-Trip Flights (+ right-aligned Poll Group) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeSubTab('stays')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium border transition-all cursor-pointer ${
              subTab === 'stays'
                ? 'bg-[#0E2034] border-[#0E2034] shadow-xs'
                : 'bg-white text-[#2C333A] border-black/[0.09] hover:border-black/[0.22]'
            }`}
          >
            <BedDouble className="w-4 h-4" />
            <span>{isRoadTrip ? 'Overnight Stays' : 'Boutique Stays'}</span>
            {bookedHotels.length > 0 && <span className="text-[11px] opacity-80">✓</span>}
          </button>

          {!isDriveFromHome && (
            <button
              type="button"
              onClick={() => onChangeSubTab('flights')}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium border transition-all cursor-pointer ${
                subTab === 'flights'
                  ? 'bg-[#0E2034] border-[#0E2034] shadow-xs'
                  : 'bg-white text-[#2C333A] border-black/[0.09] hover:border-black/[0.22]'
              }`}
            >
              <Plane className="w-4 h-4" />
              <span>Flights · {isRoadTrip && roadTrip?.startCity ? roadTrip.startCity : destination}</span>
              {bookedFlight && <span className="text-[11px] opacity-80">✓</span>}
            </button>
          )}
        </div>

        {onOpenSharePoll && (
          <button
            type="button"
            onClick={onOpenSharePoll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-[#FAF9F5] border border-black/[0.1] text-[12.5px] font-medium text-[#14191F] transition-colors cursor-pointer shrink-0"
          >
            <Users className="w-3.5 h-3.5 text-[#C85A17]" />
            <span>Poll group</span>
          </button>
        )}
      </div>

      {/* Strategic Right-Moment Loyalty Banner (Organizer only) */}
      {!readOnly && onOpenLoyaltyWallet &&
        (relevantLoyalty.length > 0 ? (
          <div className="rounded-[18px] bg-[#FAF9F5] border border-black/[0.07] px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap text-[12px] text-[#2C333A]">
              <Award className="w-4 h-4 text-[#C85A17] shrink-0" />
              <span className="font-semibold text-[#14191F]">Active loyalty:</span>
              {relevantLoyalty.map((entry) => (
                <span
                  key={entry.id}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white border border-black/[0.08] text-[11.5px] font-medium text-[#14191F]"
                >
                  <span>{entry.programName}</span>
                  {entry.tier && <span className="text-[#8E6C1E]">· {entry.tier}</span>}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onOpenLoyaltyWallet(activeCategory)}
              className="text-[12px] font-semibold text-[#14191F] hover:underline cursor-pointer shrink-0"
            >
              Manage
            </button>
          </div>
        ) : !dismissedPrompt ? (
          <div className="rounded-[18px] bg-[#FAF9F5] border border-black/[0.08] px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#ECEAE2] flex items-center justify-center text-[#C85A17] shrink-0">
                <Award className="w-4 h-4" />
              </div>
              <p className="text-[12.5px] text-[#2C333A] leading-snug">
                {subTab === 'stays' ? (
                  <>
                    <strong className="text-[#14191F]">Earn hotel points?</strong> Save Marriott
                    Bonvoy, World of Hyatt, or Hilton Honors to prioritize points-eligible stays.
                  </>
                ) : (
                  <>
                    <strong className="text-[#14191F]">Earn frequent flyer miles?</strong> Add
                    United, Delta, or AAdvantage to prioritize your preferred airline alliance.
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onOpenLoyaltyWallet(activeCategory)}
                className="px-3 py-1.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[12px] font-medium cursor-pointer"
              >
                Add loyalty
              </button>
              <button
                type="button"
                onClick={() => setDismissedPrompt(true)}
                className="p-1.5 rounded-full hover:bg-black/[0.05] text-[#7B828A] cursor-pointer"
                aria-label="Dismiss loyalty prompt"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : null)}

      {subTab === 'stays' ? (
        <div className="space-y-6">
          {/* Road Trip Overnight Town Switcher */}
          {isRoadTrip && overnightTowns.length > 0 && onChangeActiveTown && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7B828A] mr-1">
                Overnight stop:
              </span>
              <button
                type="button"
                onClick={() => onChangeActiveTown(null)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all cursor-pointer ${
                  !activeTown
                    ? 'bg-[#0E2034] text-white border-[#0E2034]'
                    : 'bg-white text-[#2C333A] border-black/[0.09] hover:border-black/[0.22]'
                }`}
                style={!activeTown ? { color: '#FFFFFF' } : undefined}
              >
                All stops
              </button>
              {overnightTowns.map((town) => {
                const isSelected = activeTown?.toLowerCase() === town.toLowerCase();
                const hasBooked = bookedHotels.some(
                  (h) => h.hotelDetails?.overnightTown?.toLowerCase() === town.toLowerCase()
                );
                return (
                  <button
                    key={town}
                    type="button"
                    onClick={() => onChangeActiveTown(town)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0E2034] text-white border-[#0E2034]'
                        : 'bg-white text-[#2C333A] border-black/[0.09] hover:border-black/[0.22]'
                    }`}
                    style={isSelected ? { color: '#FFFFFF' } : undefined}
                  >
                    <MapPin className="w-3 h-3" />
                    <span>{town}</span>
                    {hasBooked && <span className="text-emerald-500 font-bold">✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          {bookedHotel && bookedHotel.hotelDetails && (
            <div className="rounded-[18px] bg-[#ECEAE2] p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <SmartImage
                  src={bookedHotel.image}
                  alt={bookedHotel.title}
                  className="w-12 h-12 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[#C85A17]">
                    {bookedHotel.hotelDetails.overnightTown
                      ? `Selected Stay · ${bookedHotel.hotelDetails.overnightTown}`
                      : 'Selected Stay'}
                  </div>
                  <div className="text-[14px] font-semibold text-[#14191F] truncate">
                    {bookedHotel.title} · {bookedHotel.hotelDetails.roomName}
                  </div>
                </div>
              </div>
              <span className="font-tabular text-[15px] font-semibold text-[#14191F] shrink-0">
                ${bookedHotel.price}
              </span>
            </div>
          )}

          <HotelSearchCarousel
            location={effectiveStayDestination}
            dates={datesLabel}
            guests={`1 room, ${travelers}`}
            hotels={hotels}
            isLoading={isLoadingHotels && hotels.length === 0}
            likedIds={likedIds}
            votes={votes}
            notes={notes}
            voterKey={voterKey}
            onVote={onVote}
            onToggleLike={onToggleLike}
            onOpenHotel={onOpenHotel}
            onHoverId={onHoverId}
          />

          <HotelComparisonTable
            intro={`Vesper compared guest ratings, sleep quality, and neighborhood proximity for **${destination} (${datesLabel})**:`}
            hotels={topPicks}
            onOpenHotel={(h) => onOpenHotel(h, false)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <FlightSearchWidget
            from={homeAirport}
            to={destination}
            dates={datesLabel}
            passengers={travelers}
            preferredAirlines={preferredAirlines}
            readOnly={readOnly}
            onChangeOrigin={onChangeHomeAirport}
            onAddFlights={onAddFlights}
          />
        </div>
      )}
    </div>
  );
};
