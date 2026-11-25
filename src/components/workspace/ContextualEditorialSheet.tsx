import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Heart,
  Share,
  Star,
  Clock,
  Check,
  Plus,
  Minus,
  Globe,
  Phone,
  Users,
  Car,
  Accessibility,
  BedDouble,
  MapPin,
  Sparkles,
  Building2,
  Trees,
  Shirt,
  Maximize2,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Ticket,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  CalendarCheck,
} from 'lucide-react';
import {
  ActivityItem,
  BookingStatus,
  HotelItem,
  HotelRoom,
  PlaceItem,
  TripDayMeta,
  TripSavedItem,
} from '../../types/travel';
import { DEFAULT_CDMX_DAYS } from '../../services/travelApi';
import {
  analyzeTripHoursAvailability,
  buildVenueBookingLinks,
  getBookingTypeMeta,
  inferActivityBookingType,
  inferPlaceBookingType,
} from '../../utils/bookingHelpers';
import { SmartImage } from '../common/SmartImage';

/**
 * Discriminated union describing which entity dossier the editorial sheet is displaying.
 */
export type EditorialSheetTarget =
  | { kind: 'place'; item: PlaceItem }
  | { kind: 'activity'; item: ActivityItem }
  | { kind: 'hotel'; item: HotelItem; focusRooms?: boolean };

interface ContextualEditorialSheetProps {
  target: EditorialSheetTarget;
  destination?: string;
  datesLabel?: string;
  days?: TripDayMeta[];
  savedItem?: TripSavedItem | null;
  isPlaceSaved: boolean;
  isLiked: boolean;
  onClose: () => void;
  onToggleLike: (id: string) => void;
  onToggleSavePlace: (place: PlaceItem) => void;
  onAddActivity: (activity: ActivityItem, day: string, time: string, endTime: string, guests: number, total: number) => void;
  onAddHotel: (hotel: HotelItem, room: HotelRoom, price: number) => void;
  onUpdateBookingStatus?: (itemId: string, status: BookingStatus, confirmationCode?: string) => void;
  onAskVesper: (question: string) => void;
  onNotify: (msg: string) => void;
}

const HighlightIcon: React.FC<{ icon: HotelItem['highlights'][0]['icon'] }> = ({ icon }) => {
  switch (icon) {
    case 'map':
      return <MapPin className="w-4 h-4 text-[#5A626A]" strokeWidth={1.7} />;
    case 'bed':
      return <BedDouble className="w-4 h-4 text-[#5A626A]" strokeWidth={1.7} />;
    case 'sparkle':
      return <Sparkles className="w-4 h-4 text-[#5A626A]" strokeWidth={1.7} />;
    case 'building':
      return <Building2 className="w-4 h-4 text-[#5A626A]" strokeWidth={1.7} />;
    case 'washer':
      return <Shirt className="w-4 h-4 text-[#5A626A]" strokeWidth={1.7} />;
    case 'tree':
      return <Trees className="w-4 h-4 text-[#5A626A]" strokeWidth={1.7} />;
  }
};

export const ContextualEditorialSheet: React.FC<ContextualEditorialSheetProps> = ({
  target,
  destination = 'Mexico City',
  datesLabel,
  days = DEFAULT_CDMX_DAYS,
  savedItem,
  isPlaceSaved,
  isLiked,
  onClose,
  onToggleLike,
  onToggleSavePlace,
  onAddActivity,
  onAddHotel,
  onUpdateBookingStatus,
  onAskVesper,
  onNotify,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Place state
  const [photoIdx, setPhotoIdx] = useState(0);

  // Activity state
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(
    target.kind === 'activity' ? target.item.slots[0]?.id || null : null
  );
  const [actDate, setActDate] = useState(days[0]?.key || 'Day 1');
  const [actGuests, setActGuests] = useState(2);

  // Hotel state
  const [hotelSection, setHotelSection] = useState(target.kind === 'hotel' && target.focusRooms ? 'rooms' : 'highlights');
  const [selectedRoomIdx, setSelectedRoomIdx] = useState(0);
  const [selectedRateIdx, setSelectedRateIdx] = useState(0);
  const [roomQty, setRoomQty] = useState(1);
  const [roomPhotoIdx, setRoomPhotoIdx] = useState(0);

  const [isAdding, setIsAdding] = useState(false);

  const itemId = target.item.id;
  const itemName = target.kind === 'activity' ? target.item.title : target.item.name;

  const jumpToHotelSection = (secId: string) => {
    setHotelSection(secId);
    const el = document.getElementById(`sheet-hotel-${secId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 14 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-0 z-30 flex flex-col bg-[#F7F6F1] overflow-hidden"
    >
      {/* Clean Contextual Sheet Top Header */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-black/[0.07] bg-[#F7F6F1]">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hover:bg-[#FAF9F5] border border-black/[0.09] text-[12.5px] font-medium text-[#14191F] transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <div className="text-[13.5px] font-semibold text-[#14191F] truncate px-2">
          {itemName}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleLike(itemId)}
            className="p-2 rounded-full hover:bg-black/[0.05] cursor-pointer"
            title="Save favorite"
          >
            <Heart
              className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-[#4A535C]'}`}
            />
          </button>
          <button
            onClick={() => onNotify(`Copied link to ${itemName}`)}
            className="p-2 rounded-full hover:bg-black/[0.05] text-[#4A535C] cursor-pointer"
            title="Share"
          >
            <Share className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hotel Quick-Jump Section Bar (keeps Noise & Privacy, Rooms, Reviews 1 tap away) */}
      {target.kind === 'hotel' && (
        <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar px-4 sm:px-6 py-2 bg-[#FAF9F5] border-b border-black/[0.06]">
          {[
            { id: 'highlights', label: 'Highlights' },
            { id: 'rooms', label: 'Rooms & Rates' },
            ...target.item.deepDive.map((s) => ({ id: s.id, label: s.label })),
          ].map((sec) => (
            <button
              key={sec.id}
              onClick={() => jumpToHotelSection(sec.id)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium shrink-0 transition-colors cursor-pointer ${
                hotelSection === sec.id
                  ? 'bg-[#0E2034]'
                  : 'bg-white text-[#4A535C] border border-black/[0.08] hover:border-black/[0.2]'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable Sheet Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto thin-scrollbar px-4 sm:px-7 py-5">
        <div className="max-w-[780px] mx-auto space-y-6 pb-8">
          {/* ── PLACE DOSSIER ──────────────────────────────────────────── */}
          {target.kind === 'place' && (() => {
            const place = target.item;
            const bookingType = inferPlaceBookingType(place);
            const badge = getBookingTypeMeta(bookingType);
            const hoursReport = analyzeTripHoursAvailability(
              place.hours.weekdayDescriptions,
              days,
              place.hours.closedDay
            );
            const bookingLinks = buildVenueBookingLinks({
              title: place.name,
              destination,
              bookingType,
              officialUrl: place.website,
              datesLabel,
            });
            const isMarkedBooked = savedItem?.bookingMeta?.status === 'booked';

            return (
              <>
                <div className="relative h-[240px] sm:h-[290px] rounded-[20px] overflow-hidden">
                  <SmartImage
                    src={place.gallery[photoIdx % place.gallery.length] || place.image}
                    alt={place.name}
                    className="w-full h-full object-cover"
                  />
                  {place.gallery.length > 1 && (
                    <button
                      onClick={() => setPhotoIdx((i) => (i + 1) % place.gallery.length)}
                      className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-[12px] font-medium backdrop-blur-xs cursor-pointer"
                    >
                      Photo {(photoIdx % place.gallery.length) + 1} / {place.gallery.length} →
                    </button>
                  )}
                </div>

                <div>
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#C85A17]">
                      {place.neighborhood} · {place.category}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        bookingType === 'walk_in'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                          : bookingType === 'timed_ticket'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : bookingType === 'reservation'
                          ? 'bg-[#ECEAE2] text-[#14191F] border border-black/[0.08]'
                          : 'bg-orange-50 text-[#C85A17] border border-orange-200'
                      }`}
                    >
                      <Ticket className="w-3 h-3" />
                      <span>{badge.label}</span>
                      {place.estimatedCostUsd && place.estimatedCostUsd > 0 ? (
                        <span className="font-tabular">· ~${place.estimatedCostUsd}</span>
                      ) : null}
                    </span>
                  </div>
                  <h2 className="font-editorial text-[30px] sm:text-[34px] font-normal text-[#14191F] leading-tight mt-0.5">
                    {place.name}
                  </h2>
                  <div className="flex items-center gap-1.5 text-[13px] mt-1.5 text-[#5A626A]">
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
                </div>

                {/* Tickets / Reservations & Trip-Date Hours Availability Panel */}
                <div className="rounded-[20px] bg-white border border-black/[0.08] p-4 space-y-3 shadow-2xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {hoursReport.hasClosureConflict ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <CalendarCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div
                          className={`text-[13px] font-semibold ${
                            hoursReport.hasClosureConflict ? 'text-amber-800' : 'text-[#14191F]'
                          }`}
                        >
                          {hoursReport.headline}
                        </div>
                        <div className="text-[12px] text-[#5A626A] mt-0.5">
                          {hoursReport.detail}
                          {place.advanceLeadTime ? ` · ${place.advanceLeadTime}` : ''}
                        </div>
                      </div>
                    </div>

                    {savedItem && badge.needsBooking && onUpdateBookingStatus && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateBookingStatus(
                            savedItem.id,
                            isMarkedBooked ? 'needed' : 'booked',
                            savedItem.bookingMeta?.confirmationCode
                          )
                        }
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-semibold border transition-colors cursor-pointer shrink-0 ${
                          isMarkedBooked
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-[#FAF9F5] text-[#2C333A] border-black/[0.1] hover:border-[#0E2034]'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isMarkedBooked ? 'Confirmed' : 'Mark booked'}</span>
                      </button>
                    )}
                  </div>

                  {badge.needsBooking ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {bookingLinks.official && (
                        <a
                          href={bookingLinks.official.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[12px] font-medium transition-colors"
                          style={{ color: '#FFFFFF' }}
                        >
                          <span>{bookingLinks.official.label}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <a
                        href={bookingLinks.partner.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FAF9F5] hover:bg-[#ECEAE2] border border-black/[0.1] text-[12px] font-medium text-[#14191F] transition-colors"
                      >
                        <span>{bookingLinks.partner.label}</span>
                        <ExternalLink className="w-3 h-3 text-[#C85A17]" />
                      </a>
                      {bookingLinks.altPartner && (
                        <a
                          href={bookingLinks.altPartner.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#FAF9F5] hover:bg-[#ECEAE2] border border-black/[0.1] text-[12px] font-medium text-[#14191F] transition-colors"
                        >
                          <span>{bookingLinks.altPartner.label}</span>
                          <ExternalLink className="w-3 h-3 text-[#C85A17]" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="text-[12px] text-emerald-700 bg-emerald-50/70 border border-emerald-200/70 rounded-xl px-3 py-2">
                      No advance ticket required — add it straight to your timeline at the ideal time.
                    </div>
                  )}
                </div>

                <div className="space-y-3 text-[14px] leading-[1.65] text-[#2C333A]">
                  <p>{place.shortDescription}</p>
                  {place.editorialSummary && place.editorialSummary !== place.shortDescription && (
                    <p>{place.editorialSummary}</p>
                  )}
                </div>

                {place.details.reservationNote && (
                  <div className="rounded-[18px] bg-[#ECEAE2] border border-black/[0.07] p-4 flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-[#C85A17] shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#C85A17]">
                        Vesper Insider Tip
                      </div>
                      <p className="text-[13px] text-[#14191F] leading-relaxed">
                        {place.details.reservationNote}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="rounded-[18px] bg-white border border-black/[0.07] p-4 space-y-2">
                    <h3 className="text-[13px] font-semibold text-[#14191F]">Hours</h3>
                    {place.hours.closedDay && (
                      <div className="text-[12.5px] text-[#7B828A]">
                        Closed: <strong className="text-[#14191F]">{place.hours.closedDay}</strong>
                      </div>
                    )}
                    <div className="text-[12.5px] text-[#4A535C]">{place.hours.openSchedule}</div>
                  </div>

                  <div className="rounded-[18px] bg-white border border-black/[0.07] p-4 space-y-2">
                    <h3 className="text-[13px] font-semibold text-[#14191F]">Practical Info</h3>
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-[12.5px] text-[#14191F] hover:underline"
                    >
                      <Globe className="w-3.5 h-3.5 text-[#7B828A]" />
                      <span>Official website</span>
                    </a>
                    <div className="flex items-center gap-2 text-[12.5px] text-[#4A535C]">
                      <Phone className="w-3.5 h-3.5 text-[#7B828A]" />
                      <span className="font-tabular">{place.phone}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-[18px] bg-white border border-black/[0.07] p-4 space-y-2.5 text-[12.5px] text-[#4A535C]">
                  <h3 className="text-[13px] font-semibold text-[#14191F]">Details</h3>
                  {place.details.goodForChildren !== undefined && (
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-[#7B828A]" />
                      <span>{place.details.goodForChildren ? 'Good for children' : 'Best for adults'} · Restroom</span>
                    </div>
                  )}
                  {place.details.parking && (
                    <div className="flex items-center gap-2">
                      <Car className="w-3.5 h-3.5 text-[#7B828A]" />
                      <span>{place.details.parking}</span>
                    </div>
                  )}
                  {place.details.accessibility && (
                    <div className="flex items-center gap-2">
                      <Accessibility className="w-3.5 h-3.5 text-[#7B828A]" />
                      <span>{place.details.accessibility}</span>
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* ── ACTIVITY DOSSIER ───────────────────────────────────────── */}
          {target.kind === 'activity' && (() => {
            const act = target.item;
            const activeSlot = act.slots.find((s) => s.id === selectedSlotId) || act.slots[0];
            const subtotal = activeSlot ? activeSlot.pricePerPerson * actGuests : 0;
            const actBookingType = inferActivityBookingType(act);
            const actHours = analyzeTripHoursAvailability(act.weekdayDescriptions, days);
            const actLinks = buildVenueBookingLinks({
              title: act.title,
              destination,
              bookingType: actBookingType,
              officialUrl: act.website,
              datesLabel,
            });

            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 h-[220px] sm:h-[260px] rounded-[20px] overflow-hidden">
                  <div className="sm:col-span-7 h-full overflow-hidden">
                    <SmartImage src={act.gallery[0] || act.image} alt={act.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="hidden sm:grid sm:col-span-5 grid-rows-2 gap-2 h-full">
                    {[1, 2].map((idx) => (
                      <div key={idx} className="overflow-hidden">
                        <SmartImage
                          src={act.gallery[idx % act.gallery.length] || act.image}
                          alt={`${act.title} ${idx}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#C85A17]">
                    {act.category} · {act.duration}
                  </div>
                  <h2 className="font-editorial text-[28px] sm:text-[32px] font-normal text-[#14191F] leading-tight mt-0.5">
                    {act.title}
                  </h2>
                  <div className="flex items-center gap-2 text-[13px] mt-1.5 text-[#5A626A]">
                    <Star className="w-3.5 h-3.5 fill-[#C85A17] text-[#C85A17]" />
                    <span className="font-semibold text-[#14191F]">{act.rating.toFixed(1)}</span>
                    <span>({act.reviews.toLocaleString()} reviews)</span>
                    <span>·</span>
                    <span className="font-tabular font-semibold text-[#14191F]">${act.pricePerPerson}/person</span>
                  </div>
                </div>

                {/* Inline Slot Booking Card */}
                <div className="rounded-[22px] bg-white border border-black/[0.08] p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-[#14191F]">Select date & time</h3>
                    <span className="font-tabular text-[16px] font-semibold text-[#14191F]">
                      ${subtotal} total
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-black/[0.12] px-3 py-2 relative">
                      <label className="block text-[10.5px] text-[#7B828A] mb-0.5">Date</label>
                      <div className="flex items-center justify-between">
                        <select
                          value={actDate}
                          onChange={(e) => setActDate(e.target.value)}
                          className="w-full appearance-none [-webkit-appearance:none] bg-transparent text-[13px] font-medium text-[#14191F] focus:outline-none cursor-pointer pr-4"
                        >
                          {days.map((d) => (
                            <option key={d.key} value={d.key}>
                              {d.key}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[#7B828A] pointer-events-none shrink-0 -ml-4" />
                      </div>
                    </div>

                    <div className="rounded-xl border border-black/[0.12] px-3 py-2 relative">
                      <label className="block text-[10.5px] text-[#7B828A] mb-0.5">Guests</label>
                      <div className="flex items-center justify-between">
                        <select
                          value={actGuests}
                          onChange={(e) => setActGuests(Number(e.target.value))}
                          className="w-full appearance-none [-webkit-appearance:none] bg-transparent text-[13px] font-medium text-[#14191F] focus:outline-none cursor-pointer pr-4"
                        >
                          <option value={1}>1 adult</option>
                          <option value={2}>2 adults</option>
                          <option value={3}>3 adults</option>
                          <option value={4}>4 adults</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[#7B828A] pointer-events-none shrink-0 -ml-4" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {act.slots.map((slot) => {
                      const active = activeSlot?.id === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setSelectedSlotId(slot.id)}
                          className={`flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all cursor-pointer ${
                            active
                              ? 'border-[#0E2034] bg-[#F7F6F1] ring-1 ring-[#0E2034]'
                              : 'border-black/[0.08] hover:border-black/[0.2] bg-white'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5 font-tabular text-[13px] font-semibold text-[#14191F]">
                              <Clock className="w-3.5 h-3.5 text-[#5A626A]" />
                              <span>{slot.time}</span>
                            </div>
                            <div className="text-[11px] text-[#7B828A] pl-5 mt-0.5">
                              {slot.spotsLeft} spots left
                            </div>
                          </div>
                          <span className="font-tabular text-[13.5px] font-semibold text-[#14191F]">
                            ${slot.pricePerPerson}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={isAdding || !activeSlot}
                    onClick={() => {
                      if (!activeSlot) return;
                      setIsAdding(true);
                      setTimeout(() => {
                        setIsAdding(false);
                        onAddActivity(act, actDate, activeSlot.time, activeSlot.endTime, actGuests, subtotal + 1);
                        onClose();
                      }, 550);
                    }}
                    className="w-full py-3 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13.5px] font-medium flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    {isAdding ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Adding to timeline...</span>
                      </>
                    ) : (
                      <>
                        <span>Add to timeline · est. ${subtotal}</span>
                        <Plus className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {/* Live Partner Availability & Official Box Office Links */}
                  <div className="pt-2 border-t border-black/[0.06] space-y-2.5">
                    <div className="flex items-start gap-2 text-[12px] text-[#5A626A]">
                      {actHours.hasClosureConflict ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <CalendarCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                      <span>
                        <strong className="text-[#14191F]">{actHours.headline}</strong>
                        {act.advanceLeadTime ? ` · ${act.advanceLeadTime}` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {actLinks.official && (
                        <a
                          href={actLinks.official.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FAF9F5] hover:bg-[#ECEAE2] border border-black/[0.1] text-[12px] font-medium text-[#14191F] transition-colors"
                        >
                          <span>{actLinks.official.label}</span>
                          <ExternalLink className="w-3 h-3 text-[#C85A17]" />
                        </a>
                      )}
                      <a
                        href={actLinks.partner.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FAF9F5] hover:bg-[#ECEAE2] border border-black/[0.1] text-[12px] font-medium text-[#14191F] transition-colors"
                      >
                        <span>{actLinks.partner.label}</span>
                        <ExternalLink className="w-3 h-3 text-[#C85A17]" />
                      </a>
                      {actLinks.altPartner && (
                        <a
                          href={actLinks.altPartner.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FAF9F5] hover:bg-[#ECEAE2] border border-black/[0.1] text-[12px] font-medium text-[#14191F] transition-colors"
                        >
                          <span>{actLinks.altPartner.label}</span>
                          <ExternalLink className="w-3 h-3 text-[#C85A17]" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Highlights & About */}
                <div className="space-y-4">
                  <h3 className="text-[15px] font-semibold text-[#14191F]">Highlights</h3>
                  <ul className="space-y-2 text-[13.5px] text-[#2C333A]">
                    {act.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C85A17] mt-2 shrink-0" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-2.5 text-[13.5px] leading-[1.65] text-[#4A535C] pt-2">
                    <p className="font-semibold text-[#14191F]">{act.aboutHeading}</p>
                    {act.aboutBody.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}

          {/* ── HOTEL DOSSIER + INLINE ROOM SELECTOR + DEEP-DIVE ──────── */}
          {target.kind === 'hotel' && (() => {
            const hotel = target.item;
            const activeRoom = hotel.rooms[selectedRoomIdx] || hotel.rooms[0];
            const activeRate = activeRoom.rates[selectedRateIdx] || activeRoom.rates[0];

            return (
              <>
                <div id="sheet-hotel-highlights" className="scroll-mt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 h-[220px] sm:h-[270px] rounded-[20px] overflow-hidden">
                    <div className="sm:col-span-7 h-full overflow-hidden">
                      <SmartImage src={hotel.gallery[0] || hotel.image} alt={hotel.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="hidden sm:grid sm:col-span-5 grid-rows-2 gap-2 h-full">
                      {[1, 2].map((idx) => (
                        <div key={idx} className="overflow-hidden">
                          <SmartImage
                            src={hotel.gallery[idx % hotel.gallery.length] || hotel.image}
                            alt={`${hotel.name} ${idx}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#C85A17]">
                        {hotel.neighborhood}, {destination} · {hotel.stars}-Star Stay
                      </div>
                      <h2 className="font-editorial text-[30px] sm:text-[34px] font-normal text-[#14191F] leading-tight mt-0.5">
                        {hotel.name}
                      </h2>
                      <div className="flex items-center gap-2 text-[13px] text-[#5A626A] mt-1">
                        <span className="px-2 py-0.5 rounded-full bg-[#B68E35]/15 text-[#8E6C1E] font-bold text-[12px]">
                          {hotel.rating.toFixed(1)}
                        </span>
                        <span>{hotel.reviews} reviews</span>
                        <span>·</span>
                        <span>{hotel.tagline}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => jumpToHotelSection('rooms')}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13px] font-medium cursor-pointer shrink-0"
                    >
                      <BedDouble className="w-4 h-4" />
                      <span>Select room · ${hotel.priceTotal}</span>
                    </button>
                  </div>

                  {/* Property Highlights */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {hotel.highlights.map((hl, i) => (
                      <div key={i} className="rounded-[16px] bg-white border border-black/[0.07] p-3.5 flex items-start gap-3">
                        <div className="p-1.5 rounded-lg bg-[#F3F2EC] shrink-0">
                          <HighlightIcon icon={hl.icon} />
                        </div>
                        <div>
                          <div className="text-[13.5px] font-semibold text-[#14191F]">{hl.title}</div>
                          <p className="text-[12px] text-[#5A626A] leading-relaxed mt-0.5">{hl.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inline Room & Rate Selector Studio */}
                <section
                  id="sheet-hotel-rooms"
                  className="scroll-mt-4 rounded-[22px] bg-white border border-black/[0.08] p-5 shadow-xs space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-editorial text-[24px] font-medium text-[#14191F] leading-none">
                        Rooms & Rates
                      </h3>
                      <p className="text-[12px] text-[#7B828A] mt-1">
                        Jun 19 – Jun 21 · 2 nights · All taxes & fees included
                      </p>
                    </div>
                    <span className="font-tabular text-[12px] text-[#5A626A]">
                      Room {selectedRoomIdx + 1} of {hotel.rooms.length}
                    </span>
                  </div>

                  {/* Room Tier Pills */}
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                    {hotel.rooms.map((rm, idx) => (
                      <button
                        key={rm.id}
                        type="button"
                        onClick={() => {
                          setSelectedRoomIdx(idx);
                          setSelectedRateIdx(0);
                          setRoomPhotoIdx(0);
                        }}
                        className={`px-3.5 py-2 rounded-full text-[12.5px] font-medium shrink-0 border transition-all cursor-pointer ${
                          idx === selectedRoomIdx
                            ? 'bg-[#0E2034] border-[#0E2034] shadow-2xs'
                            : 'bg-[#FAF9F5] text-[#2C333A] border-black/[0.09] hover:border-black/[0.22]'
                        }`}
                      >
                        <span>{rm.name}</span>
                        <span className="font-tabular ml-1.5 opacity-85">${rm.rates[0].price}</span>
                      </button>
                    ))}
                  </div>

                  {/* Active Room Details + Rate Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                    <div className="sm:col-span-5 space-y-2">
                      <div className="relative h-[185px] rounded-[16px] overflow-hidden bg-black/5">
                        <SmartImage
                          src={activeRoom.images[roomPhotoIdx % activeRoom.images.length] || hotel.image}
                          alt={activeRoom.name}
                          className="w-full h-full object-cover"
                        />
                        {activeRoom.images.length > 1 && (
                          <>
                            <button
                              onClick={() =>
                                setRoomPhotoIdx((p) => (p - 1 + activeRoom.images.length) % activeRoom.images.length)
                              }
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer"
                            >
                              <ChevronLeft className="w-3.5 h-3.5 text-[#14191F]" />
                            </button>
                            <button
                              onClick={() => setRoomPhotoIdx((p) => (p + 1) % activeRoom.images.length)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer"
                            >
                              <ChevronRight className="w-3.5 h-3.5 text-[#14191F]" />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[12px] text-[#5A626A]">
                        <span className="flex items-center gap-1 font-tabular">
                          <Maximize2 className="w-3 h-3" /> {activeRoom.sqft} sq ft
                        </span>
                        <span className="flex items-center gap-1">
                          <BedDouble className="w-3.5 h-3.5" /> {activeRoom.beds}
                        </span>
                      </div>
                      <p className="text-[12px] text-[#5A626A] leading-relaxed">{activeRoom.description}</p>
                    </div>

                    <div className="sm:col-span-7 space-y-3">
                      {activeRoom.rates.map((rate, rIdx) => {
                        const checked = rIdx === selectedRateIdx;
                        return (
                          <button
                            key={rate.id}
                            type="button"
                            onClick={() => setSelectedRateIdx(rIdx)}
                            className={`w-full flex items-start justify-between gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              checked
                                ? 'border-[#0E2034] bg-[#F7F6F1]'
                                : 'border-black/[0.08] hover:border-black/[0.2]'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span
                                className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                  checked ? 'border-[#0E2034]' : 'border-black/25'
                                }`}
                              >
                                {checked && <span className="w-2 h-2 rounded-full bg-[#0E2034]" />}
                              </span>
                              <div>
                                <div className="text-[13.5px] font-semibold text-[#14191F]">{rate.label}</div>
                                <div className="text-[11.5px] text-[#7B828A] mt-0.5">{rate.subtitle}</div>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-tabular text-[14px] font-semibold text-[#14191F]">
                                ${rate.price}
                              </div>
                              {rate.delta && <div className="font-tabular text-[11px] text-[#7B828A]">{rate.delta}</div>}
                            </div>
                          </button>
                        );
                      })}

                      <div className="flex items-center justify-between pt-2 border-t border-black/[0.07]">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setRoomQty((q) => Math.max(1, q - 1))}
                            className="w-7 h-7 rounded-full border border-black/[0.12] flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-tabular text-[13.5px] font-semibold w-5 text-center">
                            {roomQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRoomQty((q) => Math.min(4, q + 1))}
                            className="w-7 h-7 rounded-full border border-black/[0.12] flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isAdding}
                          onClick={() => {
                            setIsAdding(true);
                            setTimeout(() => {
                              setIsAdding(false);
                              onAddHotel(hotel, activeRoom, activeRate.price * roomQty);
                              onClose();
                            }, 550);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13.5px] font-medium shadow-sm cursor-pointer"
                        >
                          {isAdding ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Adding...</span>
                            </>
                          ) : (
                            <>
                              <span>Add room · ${(activeRate.price * roomQty).toLocaleString()}</span>
                              <Plus className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Editorial Deep-Dive Sections (including Noise & Privacy!) */}
                <div className="space-y-7 pt-2">
                  {hotel.deepDive.map((sec) => (
                    <section key={sec.id} id={`sheet-hotel-${sec.id}`} className="scroll-mt-4 space-y-3">
                      <h3 className="font-editorial text-[23px] font-medium text-[#14191F]">
                        {sec.title}
                      </h3>
                      <div className="space-y-3">
                        {sec.items.map((it, idx) => (
                          <div key={idx} className="rounded-[16px] bg-white border border-black/[0.06] p-4">
                            <div className="text-[13.5px] font-semibold text-[#14191F]">{it.heading}</div>
                            <p className="text-[13px] text-[#4A535C] leading-relaxed mt-1">{it.body}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Sticky Sheet Footer for Place mode */}
      {target.kind === 'place' && (
        <div className="shrink-0 bg-[#F7F6F1] border-t border-black/[0.08] px-5 pt-3 pb-safe grid grid-cols-2 gap-3">
          <button
            onClick={() => onAskVesper(`Tell me the best time to visit ${target.item.name} and any tips`)}
            className="flex items-center justify-center gap-2 py-2.5 rounded-full bg-white border border-black/[0.1] text-[13px] font-medium text-[#14191F] hover:bg-[#FAF9F5] cursor-pointer"
          >
            <MessageSquare className="w-4 h-4 text-[#5A626A]" />
            <span>Ask Vesper</span>
          </button>

          <button
            onClick={() => onToggleSavePlace(target.item)}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-full text-[13px] font-medium cursor-pointer transition-all ${
              isPlaceSaved ? 'bg-[#ECEAE2] text-[#2C333A]' : 'bg-[#0E2034] hover:bg-[#17304D]'
            }`}
          >
            {isPlaceSaved ? (
              <>
                <span>Added to trip</span>
                <Check className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Add to trip</span>
                <Plus className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}
    </motion.div>
  );
};
