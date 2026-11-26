import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  CalendarPlus,
  Copy,
  Share,
  Plane,
  BedDouble,
  Clock,
  Calendar,
  ChevronDown,
  ArrowRight,
  Sparkles,
  Ticket,
  Trash2,
  Car,
  Footprints,
  MapPin,
  CheckCircle2,
  ExternalLink,
  ThumbsUp,
  MessageSquare,
  Navigation,
  Route,
  AlertTriangle,
  Users,
} from 'lucide-react';
import {
  BookingStatus,
  CollabEntityKind,
  RoadTripConfig,
  TripDayMeta,
  TripMode,
  TripNote,
  TripSavedItem,
  TripVote,
} from '../../types/travel';
import { DEFAULT_CDMX_DAYS, RouteLegEstimate, travelApi } from '../../services/travelApi';
import {
  buildVenueBookingLinks,
  getBookingTypeMeta,
  getEffectiveBookingType,
  itemNeedsBookingAction,
} from '../../utils/bookingHelpers';
import { computeTransitEstimate } from '../../utils/geo';
import { downloadItineraryIcs, parseStartTimeMinutes } from '../../utils/time';
import { SmartImage } from '../common/SmartImage';
import {
  DateRangePicker,
  getDefaultTripDateSelection,
  TripDateSelection,
} from '../landing/DateRangePicker';

interface CanvasTimelineProps {
  tripTitle: string;
  tripSlug?: string | null;
  destination?: string;
  datesLabel?: string;
  travelers?: string;
  heroImage?: string;
  days?: TripDayMeta[];
  tripMode?: TripMode;
  roadTrip?: RoadTripConfig | null;
  items: TripSavedItem[];
  votes?: TripVote[];
  notes?: TripNote[];
  voterKey?: string;
  readOnly?: boolean;
  isOrganizing: boolean;
  onVote?: (entityId: string, kind: CollabEntityKind, vote: 'up' | 'down' | 'clear') => void;
  onOpenShareModal?: () => void;
  onUpdateDates?: (datesLabel: string) => void;
  onUpdateTravelers?: (travelers: string) => void;
  onSearchFlights: () => void;
  onSearchHotels: (town?: string) => void;
  onOrganizeItinerary: () => void;
  onExploreDiscover: () => void;
  onInspectItem: (item: TripSavedItem) => void;
  onRemoveItem: (id: string) => void;
  onUpdateItemTime: (id: string, day: TripSavedItem['day'], time: string) => void;
  onUpdateItemBookingStatus?: (id: string, status: BookingStatus, confirmationCode?: string) => void;
  onOpenBookingCheckout: () => void;
  onOpenMapDay: (day: string) => void;
  onNotify: (msg: string) => void;
}

const TIME_SLOTS = ['9:30 AM', '10:00 AM', '11:00 AM', '1:30 PM', '2:00 PM', '2:30 PM', '4:30 PM', '8:00 PM'];

function formatDriveMins(totalMins: number): string {
  const mins = Math.max(0, Math.round(totalMins));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function buildGoogleMapsDayRouteUrl(
  dayInfo: TripDayMeta,
  dayItems: TripSavedItem[],
  dayHotel?: TripSavedItem | null
): string {
  const points: string[] = [];
  if (dayInfo.legFrom) points.push(dayInfo.legFrom);
  dayItems.forEach((item) => {
    if (item.coords && item.coords.lat !== 0 && item.coords.lng !== 0) {
      points.push(`${item.coords.lat.toFixed(5)},${item.coords.lng.toFixed(5)}`);
    } else if (item.title) {
      points.push(item.title);
    }
  });
  if (dayHotel?.coords && dayHotel.coords.lat !== 0) {
    points.push(`${dayHotel.coords.lat.toFixed(5)},${dayHotel.coords.lng.toFixed(5)}`);
  } else if (dayInfo.overnightTown || dayInfo.legTo) {
    points.push(dayInfo.overnightTown || dayInfo.legTo || '');
  }
  const clean = points.filter(Boolean);
  if (clean.length < 2) {
    const q = clean[0] || dayInfo.legTo || dayInfo.themeLabel;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  const origin = clean[0];
  const dest = clean[clean.length - 1];
  const waypoints = clean.slice(1, -1).slice(0, 8);
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination: dest,
    travelmode: 'driving',
  });
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Day-by-day chronological itinerary view with live street-routed OSRM transit connectors
 * (instant Haversine preview hydrated by cached `/api/routes/estimate`), Road Trip daily
 * driving budgets + per-night stays + 1-tap Google Maps handoff, and `.ics` calendar export.
 */
export const CanvasTimeline: React.FC<CanvasTimelineProps> = ({
  tripTitle,
  tripSlug,
  destination = 'Mexico City',
  datesLabel = 'Jun 19 – 21',
  travelers = '2 adults',
  heroImage,
  days = DEFAULT_CDMX_DAYS,
  tripMode = 'city',
  roadTrip = null,
  items,
  votes = [],
  notes = [],
  voterKey,
  readOnly = false,
  isOrganizing,
  onVote,
  onOpenShareModal,
  onUpdateDates,
  onUpdateTravelers,
  onSearchFlights,
  onSearchHotels,
  onOrganizeItinerary,
  onExploreDiscover,
  onInspectItem,
  onRemoveItem,
  onUpdateItemTime,
  onUpdateItemBookingStatus,
  onOpenBookingCheckout,
  onOpenMapDay,
  onNotify,
}) => {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [confDrafts, setConfDrafts] = useState<Record<string, string>>({});
  const [liveRoutes, setLiveRoutes] = useState<Record<string, RouteLegEstimate>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [dateSelection, setDateSelection] = useState<TripDateSelection>(() => ({
    ...getDefaultTripDateSelection(),
    label: datesLabel,
  }));

  const bannerImage = heroImage || travelApi.getDestinationHeroImage();
  const isRoadTrip = tripMode === 'roadtrip';
  const isDriveFromHome = isRoadTrip && roadTrip?.transportMode !== 'fly_drive';
  const flightItem = items.find((i) => i.type === 'flight');
  const hotelItems = items.filter((i) => i.type === 'hotel');
  const hotelItem = hotelItems[0];
  const stops = items.filter((i) => i.type === 'place' || i.type === 'activity');
  const unscheduled = stops.filter((i) => !i.day || i.day === 'Any time');
  const scheduledStops = stops.filter((i) => i.day && i.day !== 'Any time');
  const showDayBuckets = isRoadTrip || scheduledStops.length > 0 || isOrganizing;
  const totalCost = items.reduce((sum, i) => sum + (i.price || 0), 0);
  const pendingTicketStops = stops.filter(
    (s) => itemNeedsBookingAction(s) && s.bookingMeta?.status !== 'booked'
  );

  // Aggregate road trip corridor summary
  const roadTripSummary = useMemo(() => {
    if (!isRoadTrip) return null;
    const totalMins = days.reduce((sum, d) => sum + (d.estDriveMinutes || 0), 0);
    const totalMiles = days.reduce((sum, d) => sum + (d.estDriveMiles || 0), 0);
    const corridorStops: string[] = [];
    const pushUnique = (town?: string) => {
      const clean = town?.trim();
      if (!clean) return;
      if (corridorStops[corridorStops.length - 1]?.toLowerCase() !== clean.toLowerCase()) {
        corridorStops.push(clean);
      }
    };
    if (roadTrip?.startCity) pushUnique(roadTrip.startCity);
    days.forEach((d) => {
      pushUnique(d.legFrom);
      pushUnique(d.overnightTown || d.legTo);
    });
    const overnightCount = new Set(
      days.map((d) => d.overnightTown?.trim().toLowerCase()).filter(Boolean)
    ).size;
    return { totalMins, totalMiles, corridorStops, overnightCount };
  }, [isRoadTrip, days, roadTrip?.startCity]);

  const maxDailyDriveMins =
    roadTrip?.maxDriveHoursPerDay === 'under_2h'
      ? 130
      : roadTrip?.maxDriveHoursPerDay === '4h_plus'
      ? 360
      : 255;

  // Build ordered consecutive coordinate pairs across all days for 1 batched OSRM route lookup
  const routeLegs = useMemo(() => {
    const legs: Array<{ id: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } }> = [];
    days.forEach((d) => {
      const dayStops = stops
        .filter((i) => i.day === d.key && i.coords)
        .sort((a, b) => parseStartTimeMinutes(a.time) - parseStartTimeMinutes(b.time));
      for (let idx = 0; idx < dayStops.length - 1; idx++) {
        const a = dayStops[idx];
        const b = dayStops[idx + 1];
        if (a.coords && b.coords) {
          legs.push({ id: `${a.id}->${b.id}`, from: a.coords, to: b.coords });
        }
      }
    });
    return legs;
  }, [days, stops]);

  const routeLegsSignature = useMemo(
    () => routeLegs.map((l) => `${l.id}:${l.from.lat.toFixed(4)},${l.to.lat.toFixed(4)}`).join('|'),
    [routeLegs]
  );

  useEffect(() => {
    if (routeLegs.length === 0) return;
    let cancelled = false;
    travelApi
      .estimateRoutes(routeLegs)
      .then((estimates) => {
        if (cancelled) return;
        const map: Record<string, RouteLegEstimate> = {};
        estimates.forEach((e) => {
          map[e.id] = e;
        });
        setLiveRoutes(map);
      })
      .catch(() => {
        // Keep instant Haversine fallback silently if offline
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLegsSignature]);

  const handleShareLink = () => {
    if (onOpenShareModal) {
      onOpenShareModal();
      return;
    }
    const shareUrl = tripSlug ? `${window.location.origin}/t/${tripSlug}` : window.location.href;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    onNotify(tripSlug ? `Copied share link: /t/${tripSlug}` : 'Copied trip link to clipboard');
  };

  const handleExportICS = () => {
    downloadItineraryIcs(tripTitle, items);
    onNotify('Exported itinerary (.ics) to calendar');
  };

  const handleCopyDoc = () => {
    const text = [
      `${tripTitle} (${datesLabel} · ${travelers})`,
      `Total: $${totalCost.toLocaleString()}`,
      '',
      ...items.map((i) => `- [${i.day}${i.time ? ` · ${i.time}` : ''}] ${i.title}${i.price ? ` ($${i.price})` : ''}`),
    ].join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
    onNotify('Copied trip itinerary to clipboard');
  };

  return (
    <LayoutGroup id="vesper-itinerary-flow">
      <div className="max-w-[820px] mx-auto w-full space-y-5 pb-20 lg:pb-12">
        {/* Editorial Hero Banner with 1-Click Editable Dates & Travelers */}
        <div className="relative h-[185px] sm:h-[210px] rounded-[24px] overflow-hidden shadow-sm border border-black/[0.06]">
          <SmartImage src={bannerImage} alt={destination} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/32 to-black/10" />

          {/* Top-Right Quick Actions */}
          <div className="absolute top-3.5 right-3.5 flex items-center gap-1.5">
            {[
              { icon: CalendarPlus, label: 'Export .ics', action: handleExportICS },
              { icon: Copy, label: 'Copy itinerary', action: handleCopyDoc },
              { icon: Share, label: 'Copy share link', action: handleShareLink },
            ].map((btn) => (
              <button
                key={btn.label}
                onClick={btn.action}
                title={btn.label}
                className="w-8 h-8 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <btn.icon className="w-4 h-4" strokeWidth={1.7} />
              </button>
            ))}
          </div>

          <div className="absolute bottom-4 left-5 right-5 flex flex-col sm:flex-row sm:items-end justify-between gap-2 text-white">
            <div className="min-w-0">
              {!readOnly && (onUpdateDates || onUpdateTravelers) ? (
                <div className="flex items-center flex-wrap gap-1.5 mb-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80 mr-1">
                    {destination}
                  </span>
                  {onUpdateDates && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowDatePicker(true);
                        setShowGuestPicker(false);
                      }}
                      title="Edit trip dates"
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-[11px] font-medium text-white transition-colors cursor-pointer"
                    >
                      <Calendar className="w-3 h-3 opacity-85" />
                      <span className="font-tabular">{datesLabel}</span>
                    </button>
                  )}
                  {onUpdateTravelers && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setShowGuestPicker((v) => !v);
                          setShowDatePicker(false);
                        }}
                        title="Edit travelers"
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 text-[11px] font-medium text-white transition-colors cursor-pointer"
                      >
                        <Users className="w-3 h-3 opacity-85" />
                        <span>{travelers}</span>
                      </button>
                      {showGuestPicker && (
                        <div className="absolute left-0 bottom-full mb-1.5 w-36 rounded-2xl bg-white border border-black/[0.1] shadow-xl p-1.5 z-50 text-[#14191F]">
                          {['Solo', '2 adults', 'Family (4)', 'Group (5+)'].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                onUpdateTravelers(opt);
                                setShowGuestPicker(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded-xl text-[12px] cursor-pointer ${
                                travelers === opt
                                  ? 'bg-[#0E2034] font-medium'
                                  : 'hover:bg-black/[0.04] text-[#14191F]'
                              }`}
                              style={travelers === opt ? { color: '#FFFFFF' } : undefined}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
                  {destination} · {datesLabel} · {travelers}
                </div>
              )}
              <h1 className="font-editorial text-[26px] sm:text-[32px] font-normal leading-tight">
                {tripTitle}
              </h1>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="text-right">
                <div className="text-[10.5px] text-white/75 uppercase tracking-wider">Trip total</div>
                <div className="font-tabular text-[20px] font-semibold leading-tight">
                  ${totalCost.toLocaleString()}
                </div>
              </div>
              {!readOnly && (
                <button
                  onClick={onOpenBookingCheckout}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-[#14191F] hover:opacity-95 text-[12.5px] font-semibold shadow cursor-pointer"
                  style={{ backgroundColor: 'var(--v-cta)', color: 'var(--v-cta-text)' }}
                >
                  <span>Book</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

      {/* Road Trip Corridor Overview Strip */}
      {isRoadTrip && roadTripSummary && (
        <div className="rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-[#F3F2EC] flex items-center justify-center text-[#C85A17]">
                <Route className="w-4 h-4" />
              </span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#C85A17]">
                  Road Trip Corridor · {isDriveFromHome ? 'Driving from home' : 'Fly & rent a car'}
                </div>
                <div className="text-[13.5px] font-semibold text-[#14191F]">
                  {roadTripSummary.corridorStops.length > 0
                    ? roadTripSummary.corridorStops.join(' → ')
                    : destination}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {roadTripSummary.totalMins > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3F2EC] font-tabular text-[12px] font-semibold text-[#14191F]">
                  <Car className="w-3.5 h-3.5 text-[#C85A17]" />
                  <span>
                    {formatDriveMins(roadTripSummary.totalMins)}
                    {roadTripSummary.totalMiles > 0 ? ` · ${roadTripSummary.totalMiles} mi` : ''}
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={() => onOpenMapDay('All')}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[12px] font-medium cursor-pointer"
                style={{ color: '#FFFFFF' }}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Full highway map</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flights & Stay Anchors Strip (Hidden for Drive-from-Home road trips since stays live per-night below) */}
      {(!isRoadTrip || !isDriveFromHome || Boolean(flightItem?.flightDetails)) &&
        (!readOnly || Boolean(flightItem?.flightDetails) || (!isRoadTrip && Boolean(hotelItem?.hotelDetails))) && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {flightItem && flightItem.flightDetails ? (
          <div className="rounded-[18px] bg-white border border-black/[0.08] p-3.5 shadow-2xs flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#C85A17]">
                <Plane className="w-3 h-3" />
                <span>{flightItem.flightDetails.outbound.airline} · {flightItem.flightDetails.fareName}</span>
              </div>
              <div className="font-tabular text-[13.5px] font-semibold text-[#14191F] mt-1">
                {flightItem.flightDetails.outbound.departTime} {flightItem.flightDetails.outbound.fromCode} →{' '}
                {flightItem.flightDetails.outbound.arriveTime} {flightItem.flightDetails.outbound.toCode}
              </div>
              <div className="font-tabular text-[11.5px] text-[#7B828A] mt-0.5">
                Ret: {flightItem.flightDetails.inbound.departTime} {flightItem.flightDetails.inbound.fromCode} →{' '}
                {flightItem.flightDetails.inbound.arriveTime} {flightItem.flightDetails.inbound.toCode}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-tabular text-[15px] font-semibold text-[#14191F]">
                ${flightItem.price?.toLocaleString()}
              </div>
              <div className="text-[10.5px] text-[#7B828A]">2 pax RT</div>
            </div>
          </div>
        ) : !readOnly && !isDriveFromHome ? (
          <button
            onClick={onSearchFlights}
            className="rounded-[18px] border border-dashed border-black/[0.2] hover:border-[#0E2034] bg-white/60 hover:bg-white p-3.5 flex items-center justify-between text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#F3F2EC] flex items-center justify-center text-[#5A626A] group-hover:text-[#14191F]">
                <Plane className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#14191F]">Add round-trip flights</div>
                <div className="text-[11.5px] text-[#7B828A]">
                  To {roadTrip?.startCity || destination} · {datesLabel}
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#7B828A] group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : null}

        {!isRoadTrip &&
          (hotelItem && hotelItem.hotelDetails ? (
            <div className="rounded-[18px] bg-white border border-black/[0.08] p-3.5 shadow-2xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <SmartImage
                  src={hotelItem.image}
                  alt={hotelItem.title}
                  className="w-12 h-12 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-[#14191F] truncate">
                    {hotelItem.title}
                  </div>
                  <div className="text-[11.5px] text-[#5A626A] truncate">
                    {hotelItem.hotelDetails.roomName}
                  </div>
                  <div className="font-tabular text-[11px] text-[#7B828A]">
                    {hotelItem.hotelDetails.checkIn} – {hotelItem.hotelDetails.checkOut}
                  </div>
                </div>
              </div>
              <div className="font-tabular text-[15px] font-semibold text-[#14191F] shrink-0">
                ${hotelItem.price}
              </div>
            </div>
          ) : !readOnly ? (
            <button
              onClick={() => onSearchHotels()}
              className="rounded-[18px] border border-dashed border-black/[0.2] hover:border-[#0E2034] bg-white/60 hover:bg-white p-3.5 flex items-center justify-between text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F3F2EC] flex items-center justify-center text-[#5A626A] group-hover:text-[#14191F]">
                  <BedDouble className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-[#14191F]">Add a boutique stay</div>
                  <div className="text-[11.5px] text-[#7B828A]">Curated stays in {destination}</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-[#7B828A] group-hover:translate-x-0.5 transition-transform" />
            </button>
          ) : null)}
      </div>
      )}

      {/* Pending Tickets & Reservations Action Strip (Organizer only) */}
      {!readOnly && pendingTicketStops.length > 0 && (
        <div className="rounded-[18px] bg-amber-50/80 border border-amber-200/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Ticket className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-amber-950">
                {pendingTicketStops.length}{' '}
                {pendingTicketStops.length === 1 ? 'stop needs a ticket or table' : 'stops need tickets or tables'}
              </div>
              <div className="text-[11.5px] text-amber-900/75 truncate">
                {pendingTicketStops.map((s) => s.title).slice(0, 3).join(' · ')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenBookingCheckout}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[12px] font-medium cursor-pointer shrink-0"
            style={{ color: '#FFFFFF' }}
          >
            <span>Open booking links</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Odessia-Style Flat Shortlist ("Any time") with inline Add Date / Add Time + Organize CTA */}
      <AnimatePresence mode="popLayout">
        {unscheduled.length > 0 && (
          <motion.div
            key="unscheduled-shortlist"
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-[22px] bg-white border border-black/[0.08] p-4 sm:p-5 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#7B828A]">
                  Any time
                </span>
                <span className="font-tabular px-2 py-0.5 rounded-full bg-[#F3F2EC] text-[11px] font-semibold text-[#2C333A]">
                  {unscheduled.length} {unscheduled.length === 1 ? 'stop' : 'stops'}
                </span>
              </div>
              {isOrganizing && (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#C85A17] thinking-shimmer">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>Clustering by neighborhood &amp; hours...</span>
                </span>
              )}
            </div>

            <div className="space-y-2">
              {unscheduled.map((item) => {
                const isEditing = editingItemId === item.id;
                const bookingType = getEffectiveBookingType(item);
                const bookingBadge = getBookingTypeMeta(bookingType);

                return (
                  <motion.div
                    key={item.id}
                    layoutId={`stop-card-${item.id}`}
                    layout
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 330, damping: 28 }}
                    className={`rounded-2xl border bg-[#FAF9F5]/85 hover:border-black/[0.16] p-3 transition-colors ${
                      isOrganizing ? 'border-[#C85A17]/30' : 'border-black/[0.07]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onInspectItem(item)}
                          className="shrink-0 cursor-pointer"
                        >
                          <SmartImage
                            src={item.image}
                            alt={item.title}
                            className="w-12 h-12 rounded-xl object-cover"
                          />
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => onInspectItem(item)}
                            className="text-[14px] font-semibold text-[#14191F] hover:underline truncate block text-left w-full cursor-pointer"
                          >
                            {item.title}
                          </button>

                          {!readOnly ? (
                            <div className="flex items-center flex-wrap gap-1.5 mt-1">
                              <button
                                type="button"
                                onClick={() => setEditingItemId(isEditing ? null : item.id)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:border-[#0E2034] border border-black/[0.09] text-[11px] font-medium text-[#4A535C] transition-colors cursor-pointer"
                              >
                                <Calendar className="w-3 h-3 text-[#7B828A]" />
                                <span>Add date</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingItemId(isEditing ? null : item.id)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white hover:border-[#0E2034] border border-black/[0.09] text-[11px] font-medium text-[#4A535C] transition-colors cursor-pointer"
                              >
                                <Clock className="w-3 h-3 text-[#7B828A]" />
                                <span>{item.time || 'Add time'}</span>
                              </button>
                              {bookingBadge.needsBooking && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10.5px] font-semibold text-amber-800">
                                  <Ticket className="w-3 h-3" />
                                  <span>{bookingBadge.label}</span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-[11.5px] text-[#7B828A] truncate mt-0.5">
                              {item.subtitle || 'Flexible timing'}
                            </div>
                          )}
                        </div>
                      </div>

                      {!readOnly && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingItemId(isEditing ? null : item.id)}
                            className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#7B828A] cursor-pointer"
                            title="Pin day & time"
                          >
                            <ChevronDown
                              className={`w-4 h-4 transition-transform ${
                                isEditing ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.id)}
                            className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#7B828A] hover:text-rose-600 cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline Pin Day & Time Drawer (locks stop as anchor during Auto-Organize!) */}
                    <AnimatePresence>
                      {isEditing && !readOnly && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2.5 pt-2.5 border-t border-black/[0.06] space-y-2 overflow-hidden"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-medium text-[#7B828A] mr-1">
                              Pin to day:
                            </span>
                            {days.map((d) => (
                              <button
                                key={d.key}
                                type="button"
                                onClick={() => {
                                  onUpdateItemTime(item.id, d.key, item.time || '11:00 AM');
                                  setEditingItemId(null);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white hover:bg-[#0E2034] hover:text-white border border-black/[0.1] text-[11px] font-medium text-[#2C333A] transition-colors cursor-pointer"
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: d.dotColor }}
                                />
                                <span>{d.short}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-medium text-[#7B828A] mr-1">
                              Time:
                            </span>
                            {TIME_SLOTS.slice(0, 6).map((slot) => (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => {
                                  onUpdateItemTime(
                                    item.id,
                                    days[0]?.key || 'Day 1',
                                    slot
                                  );
                                  setEditingItemId(null);
                                }}
                                className="px-2 py-0.5 rounded-full bg-white hover:border-[#0E2034] border border-black/[0.09] font-tabular text-[11px] text-[#4A535C] cursor-pointer"
                              >
                                {slot}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>

            {/* Odessia-Style Bottom Action Bar: Organize My Itinerary + Find More */}
            {!readOnly && (
              <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onOrganizeItinerary}
                  disabled={isOrganizing}
                  className="inline-flex items-center justify-between gap-2 px-4 py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] disabled:opacity-65 text-[12.5px] font-semibold shadow-xs transition-all cursor-pointer"
                  style={{ color: '#FFFFFF' }}
                >
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className={`w-3.5 h-3.5 ${isOrganizing ? 'animate-spin' : ''}`} />
                    <span>
                      {isOrganizing ? 'Organizing into days...' : 'Organize my itinerary'}
                    </span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onExploreDiscover}
                  className="inline-flex items-center justify-between gap-2 px-4 py-2.5 rounded-full border border-dashed border-black/[0.2] hover:border-[#0E2034] bg-[#FAF9F5] hover:bg-white text-[12.5px] font-medium text-[#2C333A] transition-all cursor-pointer"
                >
                  <span>Find more things to do</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#7B828A]" />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty Shortlist Welcome State (when user opens My Trip with 0 stops) */}
      {!showDayBuckets && unscheduled.length === 0 && !readOnly && (
        <div className="rounded-[22px] bg-white border border-dashed border-black/[0.14] p-7 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#F3F2EC] text-[#C85A17] flex items-center justify-center mx-auto">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="font-editorial text-[20px] font-medium text-[#14191F]">
              Start your {destination} shortlist
            </h3>
            <p className="text-[13px] text-[#5A626A] max-w-[360px] mx-auto">
              Tap <strong>+</strong> on any place or ask Vesper for restaurants and sights—items
              appear right here, then Vesper can auto-organize them into days.
            </p>
          </div>
          <button
            type="button"
            onClick={onExploreDiscover}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[12.5px] font-medium cursor-pointer"
            style={{ color: '#FFFFFF' }}
          >
            <span>Explore {destination}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Day-by-Day Routed Timeline (Hidden on City Trips until stops are organized or manually pinned!) */}
      <AnimatePresence>
        {showDayBuckets && (
          <motion.div
            key="day-by-day-buckets"
            layout
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            {days.map((dayInfo) => {
          const dayItems = stops
            .filter((i) => i.day === dayInfo.key)
            .sort((a, b) => parseStartTimeMinutes(a.time) - parseStartTimeMinutes(b.time));

          const dayHotel = isRoadTrip
            ? hotelItems.find(
                (h) =>
                  h.day === dayInfo.key ||
                  (dayInfo.overnightTown &&
                    h.hotelDetails?.overnightTown?.toLowerCase() ===
                      dayInfo.overnightTown.toLowerCase())
              ) || null
            : null;

          // Compute live driving total across consecutive stops on this day, falling back to Gemini leg estimate
          let liveDayMins = 0;
          let liveDayKm = 0;
          for (let i = 0; i < dayItems.length - 1; i++) {
            const est = liveRoutes[`${dayItems[i].id}->${dayItems[i + 1].id}`];
            if (est && est.mode === 'drive') {
              liveDayMins += est.minutes;
              liveDayKm += est.distanceKm;
            }
          }
          const displayDriveMins = Math.max(liveDayMins, dayInfo.estDriveMinutes || 0);
          const displayDriveMiles = Math.max(
            Math.round(liveDayKm * 0.621371),
            dayInfo.estDriveMiles || 0
          );
          const isOverDriveBudget = isRoadTrip && displayDriveMins > maxDailyDriveMins;
          const googleMapsDayUrl = isRoadTrip
            ? buildGoogleMapsDayRouteUrl(dayInfo, dayItems, dayHotel)
            : null;

          return (
            <section
              key={dayInfo.key}
              className="rounded-[22px] bg-white border border-black/[0.08] p-4 sm:p-5 shadow-2xs space-y-3"
            >
              {/* Day Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-black/[0.06]">
                <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: dayInfo.dotColor }}
                  />
                  <h3 className="font-editorial text-[21px] font-medium text-[#14191F] leading-none">
                    {dayInfo.key}
                  </h3>
                  {isRoadTrip && dayInfo.legFrom && dayInfo.legTo ? (
                    <span className="text-[12.5px] font-semibold text-[#2C333A]">
                      {dayInfo.legFrom} → {dayInfo.legTo}
                    </span>
                  ) : (
                    <span className="text-[12px] text-[#7B828A] hidden sm:inline">
                      · {dayInfo.themeLabel}
                    </span>
                  )}

                  {isRoadTrip && displayDriveMins > 0 && (
                    <span
                      title={
                        isOverDriveBudget
                          ? 'Exceeds your daily driving target — consider trimming a detour'
                          : 'Estimated total driving time for this day'
                      }
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-tabular text-[11px] font-semibold border ${
                        isOverDriveBudget
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-[#F3F2EC] border-black/[0.06] text-[#2C333A]'
                      }`}
                    >
                      {isOverDriveBudget ? (
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                      ) : (
                        <Car className="w-3 h-3 text-[#C85A17]" />
                      )}
                      <span>
                        {formatDriveMins(displayDriveMins)}
                        {displayDriveMiles > 0 ? ` · ${displayDriveMiles} mi` : ''}
                      </span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {googleMapsDayUrl && (dayItems.length > 0 || (dayInfo.legFrom && dayInfo.legTo)) && (
                    <a
                      href={googleMapsDayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[11.5px] font-medium transition-colors"
                      style={{ color: '#FFFFFF' }}
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Drive in Maps</span>
                    </a>
                  )}
                  {dayItems.length > 0 && (
                    <button
                      onClick={() => onOpenMapDay(dayInfo.key)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F3F2EC] hover:bg-[#ECEAE2] text-[11.5px] font-medium text-[#2C333A] transition-colors cursor-pointer"
                    >
                      <MapPin className="w-3 h-3" style={{ color: dayInfo.dotColor }} />
                      <span>View route</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Day Items + Live Transit Connectors */}
              {dayItems.length === 0 ? (
                <div
                  className={`rounded-2xl border border-dashed border-black/[0.14] px-4 py-4 flex items-center justify-between text-[13px] text-[#7B828A] ${
                    isOrganizing ? 'skeleton-pulse bg-[#FAF9F5]' : ''
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Ticket className="w-4 h-4 opacity-50" />
                    <span>
                      {isOrganizing ? 'Vesper is placing stops here...' : 'No stops scheduled yet'}
                    </span>
                  </span>
                  {!isOrganizing && (
                    <button
                      onClick={onExploreDiscover}
                      className="text-[12px] font-semibold text-[#14191F] hover:underline cursor-pointer"
                    >
                      + Browse Discover
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-0">
                  {dayItems.map((item, idx) => {
                    const nextItem = dayItems[idx + 1];
                    const legId = nextItem ? `${item.id}->${nextItem.id}` : '';
                    const transit = nextItem
                      ? liveRoutes[legId] || computeTransitEstimate(item.coords, nextItem.coords)
                      : null;
                    const bookingType = getEffectiveBookingType(item);
                    const bookingBadge = getBookingTypeMeta(bookingType);
                    const isBooked = item.bookingMeta?.status === 'booked';
                    const venueLinks = bookingBadge.needsBooking
                      ? buildVenueBookingLinks({
                          title: item.title,
                          destination,
                          bookingType,
                          officialUrl: item.bookingMeta?.officialUrl,
                          datesLabel,
                        })
                      : null;

                    return (
                      <div key={item.id}>
                        <motion.div
                          layoutId={`stop-card-${item.id}`}
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                          className="rounded-2xl border border-black/[0.07] bg-[#FAF9F5]/80 hover:border-black/[0.16] p-3 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <button
                              onClick={() => onInspectItem(item)}
                              className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <div className="relative shrink-0">
                                <SmartImage
                                  src={item.image}
                                  alt={item.title}
                                  className="w-12 h-12 rounded-xl object-cover"
                                />
                                <span
                                  className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full text-white font-tabular text-[10.5px] font-bold flex items-center justify-center shadow-xs"
                                  style={{ backgroundColor: dayInfo.dotColor }}
                                >
                                  {idx + 1}
                                </span>
                              </div>

                              <div className="min-w-0">
                                <div className="text-[14px] font-semibold text-[#14191F] truncate">
                                  {item.title}
                                </div>
                                <div className="flex items-center flex-wrap gap-1.5 mt-1">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-black/[0.07] font-tabular text-[11px] font-medium text-[#2C333A]">
                                    <Clock className="w-3 h-3 text-[#7B828A]" />
                                    <span>{item.time || 'Flexible'}</span>
                                  </span>
                                  {bookingBadge.needsBooking ? (
                                    isBooked ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10.5px] font-semibold text-emerald-700">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>
                                          Confirmed
                                          {item.bookingMeta?.confirmationCode
                                            ? ` · #${item.bookingMeta.confirmationCode}`
                                            : ''}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10.5px] font-semibold text-amber-800">
                                        <Ticket className="w-3 h-3" />
                                        <span>{bookingBadge.label}</span>
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#ECEAE2]/70 text-[10.5px] font-medium text-[#5A626A]">
                                      Walk-in
                                    </span>
                                  )}
                                  {item.subtitle && (
                                    <span className="text-[11.5px] text-[#7B828A] truncate">
                                      {item.subtitle}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {onVote && (item.type === 'place' || item.type === 'activity') && (() => {
                                const entityId = item.refId;
                                const entityKind: CollabEntityKind =
                                  item.type === 'activity' ? 'activity' : 'place';
                                const upVotes = votes.filter(
                                  (v) => v.entityId === entityId && v.vote === 'up'
                                );
                                const myVote = voterKey
                                  ? votes.find(
                                      (v) => v.entityId === entityId && v.voterKey === voterKey
                                    )?.vote
                                  : undefined;
                                const noteCount = notes.filter(
                                  (n) => n.entityId === entityId
                                ).length;

                                return (
                                  <div className="flex items-center gap-1">
                                    {noteCount > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => onInspectItem(item)}
                                        title={`${noteCount} group note${noteCount > 1 ? 's' : ''}`}
                                        className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full bg-white border border-black/[0.08] text-[11px] font-medium text-[#5A626A] hover:border-[#0E2034] cursor-pointer"
                                      >
                                        <MessageSquare className="w-3 h-3 text-[#C85A17]" />
                                        <span className="font-tabular">{noteCount}</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onVote(
                                          entityId,
                                          entityKind,
                                          myVote === 'up' ? 'clear' : 'up'
                                        )
                                      }
                                      title={
                                        upVotes.length > 0
                                          ? `Voted by ${upVotes.map((v) => v.voterName).join(', ')}`
                                          : 'Vote for this stop'
                                      }
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-semibold transition-colors cursor-pointer ${
                                        myVote === 'up'
                                          ? 'bg-[#0E2034] text-white border-[#0E2034]'
                                          : 'bg-white text-[#5A626A] border-black/[0.08] hover:border-[#0E2034] hover:text-[#14191F]'
                                      }`}
                                      style={myVote === 'up' ? { color: '#FFFFFF' } : undefined}
                                    >
                                      <ThumbsUp className="w-3 h-3" />
                                      {upVotes.length > 0 && (
                                        <span className="font-tabular">{upVotes.length}</span>
                                      )}
                                    </button>
                                  </div>
                                );
                              })()}
                              {item.price ? (
                                <span className="font-tabular text-[14px] font-semibold text-[#14191F]">
                                  ${item.price}
                                </span>
                              ) : null}
                              {!readOnly && (
                                <button
                                  onClick={() =>
                                    setEditingItemId(editingItemId === item.id ? null : item.id)
                                  }
                                  className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#7B828A] cursor-pointer"
                                  title="Edit time, ticket status, or remove"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          <AnimatePresence>
                            {editingItemId === item.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-3 pt-2.5 border-t border-black/[0.06] space-y-2.5 overflow-hidden"
                              >
                                {bookingBadge.needsBooking && venueLinks && onUpdateItemBookingStatus && (
                                  <div className="rounded-xl bg-white border border-black/[0.07] p-2.5 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {venueLinks.official && (
                                        <a
                                          href={venueLinks.official.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0E2034] text-[11px] font-medium"
                                          style={{ color: '#FFFFFF' }}
                                        >
                                          <span>{venueLinks.official.label}</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      )}
                                      <a
                                        href={venueLinks.partner.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF9F5] border border-black/[0.1] text-[11px] font-medium text-[#14191F] hover:border-[#0E2034]"
                                      >
                                        <span>{venueLinks.partner.label}</span>
                                        <ExternalLink className="w-2.5 h-2.5 text-[#C85A17]" />
                                      </a>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        value={
                                          confDrafts[item.id] ??
                                          item.bookingMeta?.confirmationCode ??
                                          ''
                                        }
                                        onChange={(e) =>
                                          setConfDrafts((prev) => ({
                                            ...prev,
                                            [item.id]: e.target.value,
                                          }))
                                        }
                                        placeholder="Conf # (optional)"
                                        className="w-28 rounded-full border border-black/[0.1] bg-[#FAF9F5] px-2.5 py-1 text-[11px] text-[#14191F] focus:outline-none focus:border-[#0E2034]"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const code = (
                                            confDrafts[item.id] ??
                                            item.bookingMeta?.confirmationCode ??
                                            ''
                                          ).trim();
                                          onUpdateItemBookingStatus(
                                            item.id,
                                            isBooked ? 'needed' : 'booked',
                                            code || undefined
                                          );
                                        }}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer ${
                                          isBooked
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                            : 'bg-white text-[#14191F] border-black/[0.14] hover:border-[#0E2034]'
                                        }`}
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>{isBooked ? 'Confirmed' : 'Mark booked'}</span>
                                      </button>
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap gap-1.5 items-center">
                                    <Calendar className="w-3.5 h-3.5 text-[#7B828A]" />
                                    {days.map((d) => (
                                      <button
                                        key={d.key}
                                        onClick={() => onUpdateItemTime(item.id, d.key, item.time || '11:00 AM')}
                                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium cursor-pointer ${
                                          item.day === d.key
                                            ? 'bg-[#0E2034]'
                                            : 'bg-white border border-black/[0.08] text-[#4A535C]'
                                        }`}
                                      >
                                        {d.short}
                                      </button>
                                    ))}
                                    <span className="mx-1 text-black/20">|</span>
                                    {TIME_SLOTS.slice(0, 5).map((slot) => (
                                      <button
                                        key={slot}
                                        onClick={() => {
                                          onUpdateItemTime(item.id, dayInfo.key, slot);
                                          setEditingItemId(null);
                                        }}
                                        className={`px-2 py-0.5 rounded-full font-tabular text-[11px] cursor-pointer ${
                                          item.time === slot
                                            ? 'bg-[#0E2034]'
                                            : 'bg-white border border-black/[0.08] text-[#4A535C]'
                                        }`}
                                      >
                                        {slot}
                                      </button>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => onRemoveItem(item.id)}
                                    className="inline-flex items-center gap-1 text-[11.5px] text-rose-600 hover:underline cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Remove
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>

                        {/* SIGNATURE VESPER LIVE TRANSIT CONNECTOR */}
                        {transit && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.28, delay: 0.14 }}
                            className="flex items-center gap-2.5 pl-8 py-2"
                          >
                            <div
                              className="h-6 border-l-2 border-dashed opacity-50"
                              style={{ borderColor: dayInfo.dotColor }}
                            />
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F3F2EC] border border-black/[0.06] text-[11px] font-medium text-[#5A626A]">
                              {transit.mode === 'walk' ? (
                                <Footprints className="w-3 h-3 text-[#C85A17]" />
                              ) : (
                                <Car className="w-3 h-3 text-[#C85A17]" />
                              )}
                              <span className="font-tabular">{transit.label}</span>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Per-Night Overnight Stay Slot (Road Trip Mode) */}
              {isRoadTrip && dayInfo.overnightTown && (dayHotel || !readOnly) && (
                <div className="pt-2 border-t border-black/[0.06]">
                  {dayHotel ? (
                    <div className="rounded-[16px] bg-[#FAF9F5] border border-black/[0.08] p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <SmartImage
                          src={dayHotel.image}
                          alt={dayHotel.title}
                          className="w-10 h-10 rounded-xl object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#C85A17]">
                            Overnight · {dayInfo.overnightTown}
                          </div>
                          <div className="text-[13px] font-semibold text-[#14191F] truncate">
                            {dayHotel.title}
                            {dayHotel.hotelDetails?.roomName ? ` · ${dayHotel.hotelDetails.roomName}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {dayHotel.price ? (
                          <span className="font-tabular text-[13.5px] font-semibold text-[#14191F]">
                            ${dayHotel.price}
                          </span>
                        ) : null}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => onSearchHotels(dayInfo.overnightTown)}
                            className="text-[11.5px] font-medium text-[#5A626A] hover:text-[#14191F] underline cursor-pointer"
                          >
                            Swap
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSearchHotels(dayInfo.overnightTown)}
                      className="w-full rounded-[16px] border border-dashed border-black/[0.18] hover:border-[#0E2034] bg-[#FAF9F5]/70 hover:bg-white px-3.5 py-2.5 flex items-center justify-between text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BedDouble className="w-4 h-4 text-[#C85A17] shrink-0" />
                        <span className="text-[12.5px] font-medium text-[#2C333A] truncate">
                          Overnight in <strong className="text-[#14191F]">{dayInfo.overnightTown}</strong> · Pick stay
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#7B828A] group-hover:translate-x-0.5 transition-transform shrink-0" />
                    </button>
                  )}
                </div>
              )}
            </section>
          );
        })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Date Picker Modal for 1-Click Editable Trip Dates */}
      <AnimatePresence>
        {showDatePicker && onUpdateDates && (
          <DateRangePicker
            value={dateSelection}
            onChange={(nextSel) => {
              setDateSelection(nextSel);
              onUpdateDates(nextSel.label);
            }}
            onClose={() => setShowDatePicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
    </LayoutGroup>
  );
};
