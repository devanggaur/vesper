import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import { TripDayMeta, TripSavedItem } from '../../types/travel';
import { DEFAULT_CDMX_DAYS, RouteLegEstimate, travelApi } from '../../services/travelApi';
import { computeTransitEstimate } from '../../utils/geo';
import { downloadItineraryIcs, parseStartTimeMinutes } from '../../utils/time';
import { SmartImage } from '../common/SmartImage';

interface CanvasTimelineProps {
  tripTitle: string;
  tripSlug?: string | null;
  destination?: string;
  datesLabel?: string;
  travelers?: string;
  heroImage?: string;
  days?: TripDayMeta[];
  items: TripSavedItem[];
  isOrganizing: boolean;
  onSearchFlights: () => void;
  onSearchHotels: () => void;
  onOrganizeItinerary: () => void;
  onExploreDiscover: () => void;
  onInspectItem: (item: TripSavedItem) => void;
  onRemoveItem: (id: string) => void;
  onUpdateItemTime: (id: string, day: TripSavedItem['day'], time: string) => void;
  onOpenBookingCheckout: () => void;
  onOpenMapDay: (day: string) => void;
  onNotify: (msg: string) => void;
}

const TIME_SLOTS = ['9:30 AM', '10:00 AM', '11:00 AM', '1:30 PM', '2:00 PM', '2:30 PM', '4:30 PM', '8:00 PM'];

/**
 * Day-by-day chronological itinerary view with live street-routed OSRM transit connectors
 * (instant Haversine preview hydrated by cached `/api/routes/estimate`), inline time/day
 * reassignment, shareable `/t/:slug` link copying, and `.ics` calendar export.
 */
export const CanvasTimeline: React.FC<CanvasTimelineProps> = ({
  tripTitle,
  tripSlug,
  destination = 'Mexico City',
  datesLabel = 'Jun 19 – 21',
  travelers = '2 adults',
  heroImage,
  days = DEFAULT_CDMX_DAYS,
  items,
  isOrganizing,
  onSearchFlights,
  onSearchHotels,
  onOrganizeItinerary,
  onExploreDiscover,
  onInspectItem,
  onRemoveItem,
  onUpdateItemTime,
  onOpenBookingCheckout,
  onOpenMapDay,
  onNotify,
}) => {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [liveRoutes, setLiveRoutes] = useState<Record<string, RouteLegEstimate>>({});

  const bannerImage = heroImage || travelApi.getDestinationHeroImage();
  const flightItem = items.find((i) => i.type === 'flight');
  const hotelItem = items.find((i) => i.type === 'hotel');
  const stops = items.filter((i) => i.type === 'place' || i.type === 'activity');
  const unscheduled = stops.filter((i) => i.day === 'Any time');
  const totalCost = items.reduce((sum, i) => sum + (i.price || 0), 0);

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
    <div className="max-w-[820px] mx-auto w-full space-y-6 pb-20 lg:pb-12">
      {/* Editorial Hero Banner */}
      <div className="relative h-[185px] sm:h-[210px] rounded-[24px] overflow-hidden shadow-sm border border-black/[0.06]">
        <SmartImage src={bannerImage} alt={destination} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

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
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">
              {destination} · {datesLabel} · {travelers}
            </div>
            <h1 className="font-editorial text-[28px] sm:text-[34px] font-normal leading-tight mt-0.5">
              {tripTitle}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="text-right">
              <div className="text-[10.5px] text-white/75 uppercase tracking-wider">Trip total</div>
              <div className="font-tabular text-[20px] font-semibold leading-tight">
                ${totalCost.toLocaleString()}
              </div>
            </div>
            <button
              onClick={onOpenBookingCheckout}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-[#14191F] hover:opacity-95 text-[12.5px] font-semibold shadow cursor-pointer"
              style={{ backgroundColor: 'var(--v-cta)', color: 'var(--v-cta-text)' }}
            >
              <span>Book</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Flights & Stay Anchors Strip */}
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
        ) : (
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
                <div className="text-[11.5px] text-[#7B828A]">To {destination} · {datesLabel}</div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#7B828A] group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {hotelItem && hotelItem.hotelDetails ? (
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
        ) : (
          <button
            onClick={onSearchHotels}
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
        )}
      </div>

      {/* Unscheduled / Holding Tray with One-Click Organize */}
      {unscheduled.length > 0 && (
        <div className="rounded-[22px] bg-[#FAF9F5] border border-black/[0.08] p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="text-[14px] font-semibold text-[#14191F]">
                Saved places waiting to be routed ({unscheduled.length})
              </h3>
              <p className="text-[12px] text-[#7B828A]">
                Let Vesper group them by neighborhood and assign realistic times.
              </p>
            </div>
            <button
              onClick={onOrganizeItinerary}
              disabled={isOrganizing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-[#0E2034] hover:bg-[#17304D] disabled:opacity-60 text-[12.5px] font-medium shadow-xs transition-all cursor-pointer shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isOrganizing ? 'Routing stops...' : 'Organize into days'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <AnimatePresence>
              {unscheduled.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, y: -8 }}
                  className="rounded-2xl bg-white border border-black/[0.07] p-2.5 flex items-center justify-between gap-2.5"
                >
                  <button
                    onClick={() => onInspectItem(item)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <SmartImage
                      src={item.image}
                      alt={item.title}
                      className="w-10 h-10 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#14191F] truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[#7B828A] truncate">
                        {item.subtitle || 'Any time'}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => onRemoveItem(item.id)}
                    className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#7B828A] cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Day-by-Day Routed Timeline with Live Spatial Transit Connectors */}
      <div className="space-y-5">
        {days.map((dayInfo) => {
          const dayItems = stops
            .filter((i) => i.day === dayInfo.key)
            .sort((a, b) => parseStartTimeMinutes(a.time) - parseStartTimeMinutes(b.time));

          return (
            <section
              key={dayInfo.key}
              className="rounded-[22px] bg-white border border-black/[0.08] p-4 sm:p-5 shadow-2xs space-y-3"
            >
              {/* Day Header */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-black/[0.06]">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: dayInfo.dotColor }}
                  />
                  <h3 className="font-editorial text-[21px] font-medium text-[#14191F] leading-none">
                    {dayInfo.key}
                  </h3>
                  <span className="text-[12px] text-[#7B828A] hidden sm:inline">
                    · {dayInfo.themeLabel}
                  </span>
                </div>

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

                    return (
                      <div key={item.id}>
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                          className="rounded-2xl border border-black/[0.07] bg-[#FAF9F5]/80 hover:border-black/[0.16] p-3 transition-all"
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
                                <div className="flex items-center flex-wrap gap-2 mt-1">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-black/[0.07] font-tabular text-[11px] font-medium text-[#2C333A]">
                                    <Clock className="w-3 h-3 text-[#7B828A]" />
                                    <span>{item.time || 'Flexible'}</span>
                                  </span>
                                  {item.subtitle && (
                                    <span className="text-[11.5px] text-[#7B828A] truncate">
                                      {item.subtitle}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>

                            <div className="flex items-center gap-2 shrink-0">
                              {item.price ? (
                                <span className="font-tabular text-[14px] font-semibold text-[#14191F]">
                                  ${item.price}
                                </span>
                              ) : null}
                              <button
                                onClick={() =>
                                  setEditingItemId(editingItemId === item.id ? null : item.id)
                                }
                                className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#7B828A] cursor-pointer"
                                title="Edit time or remove"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <AnimatePresence>
                            {editingItemId === item.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-3 pt-2.5 border-t border-black/[0.06] flex flex-wrap items-center justify-between gap-2 overflow-hidden"
                              >
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
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>

                        {/* SIGNATURE VESPER LIVE TRANSIT CONNECTOR */}
                        {transit && (
                          <div className="flex items-center gap-2.5 pl-8 py-2">
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
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
