import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  Plane,
  BedDouble,
  Ticket,
  Sparkles,
  ExternalLink,
  CalendarPlus,
  Check,
  Award,
  Copy,
} from 'lucide-react';
import { LoyaltyProgramEntry, TripSavedItem } from '../../types/travel';
import { HandoffLinkInfo, travelApi } from '../../services/travelApi';
import { downloadItineraryIcs } from '../../utils/time';
import { BrandMark } from '../common/BrandMark';

interface BookingCheckoutModalProps {
  tripTitle: string;
  destination?: string;
  datesLabel?: string;
  travelers?: string;
  items: TripSavedItem[];
  loyaltyPrograms?: LoyaltyProgramEntry[];
  onOpenLoyaltyWallet?: (category: 'hotel' | 'airline') => void;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Phase 3 Provider Handoff Checkout Studio:
 * Lists every bookable flight, boutique stay, and guided experience with pre-filled direct
 * provider booking URLs (Google Flights, Google Hotels, Experiences) and an interactive
 * reservation checklist + one-click `.ics` calendar export — $0 Vesper fee & zero PCI overhead.
 */
export const BookingCheckoutModal: React.FC<BookingCheckoutModalProps> = ({
  tripTitle,
  destination = 'Mexico City',
  datesLabel = 'Jun 19 – 21',
  travelers = '2 adults',
  items,
  loyaltyPrograms = [],
  onOpenLoyaltyWallet,
  onClose,
  onSuccess,
}) => {
  const [handoffLinks, setHandoffLinks] = useState<Record<string, HandoffLinkInfo>>({});
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());
  const [copiedLoyaltyId, setCopiedLoyaltyId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const findLoyaltyForItem = (item: TripSavedItem): LoyaltyProgramEntry | undefined => {
    if (item.type === 'hotel') {
      const hotelPrograms = loyaltyPrograms.filter((p) => p.category === 'hotel');
      const titleLower = item.title.toLowerCase();
      return (
        hotelPrograms.find(
          (p) =>
            titleLower.includes(p.provider.toLowerCase()) ||
            (p.provider === 'Marriott' &&
              (titleLower.includes('edition') ||
                titleLower.includes('ritz') ||
                titleLower.includes('st. regis') ||
                titleLower.includes('w hotel') ||
                titleLower.includes('suiran')))
        ) || hotelPrograms[0]
      );
    }
    if (item.type === 'flight') {
      const airlinePrograms = loyaltyPrograms.filter((p) => p.category === 'airline');
      const airlineLower = (item.flightDetails?.outbound.airline || item.title).toLowerCase();
      return (
        airlinePrograms.find((p) => airlineLower.includes(p.provider.toLowerCase())) ||
        airlinePrograms[0]
      );
    }
    return undefined;
  };

  const bookableItems = items.filter((i) => i.price && i.price > 0);
  const total = bookableItems.reduce((sum, i) => sum + (i.price || 0), 0);

  useEffect(() => {
    if (bookableItems.length === 0) return;
    let cancelled = false;
    travelApi
      .getHandoffLinks({
        destination,
        datesLabel,
        items: bookableItems.map((i) => ({
          id: i.id,
          type: i.type,
          title: i.title,
          fromCode: i.flightDetails?.outbound.fromCode,
          toCode: i.flightDetails?.outbound.toCode,
        })),
      })
      .then((links) => {
        if (!cancelled) setHandoffLinks(links);
      })
      .catch(() => {
        // Fallback links constructed inline below
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, datesLabel, bookableItems.length]);

  const toggleBooked = (id: string) => {
    setBookedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getFallbackUrl = (item: TripSavedItem): HandoffLinkInfo => {
    if (handoffLinks[item.id]) return handoffLinks[item.id];
    if (item.type === 'flight') {
      return {
        label: 'Book on Google Flights',
        url: `https://www.google.com/travel/flights?q=${encodeURIComponent(
          `Flights from ${item.flightDetails?.outbound.fromCode || 'SFO'} to ${
            item.flightDetails?.outbound.toCode || destination
          } ${datesLabel}`
        )}`,
      };
    }
    if (item.type === 'hotel') {
      return {
        label: 'Book on Google Hotels',
        url: `https://www.google.com/travel/hotels?q=${encodeURIComponent(
          `${item.title} ${destination} ${datesLabel}`
        )}`,
      };
    }
    return {
      label: 'Reserve experience',
      url: `https://www.google.com/search?q=${encodeURIComponent(`${item.title} ${destination} tickets`)}`,
    };
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1150] bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 14 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[540px] rounded-[26px] bg-[#FAF9F5] border border-black/[0.08] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <span className="font-editorial text-[20px] font-medium text-[#14191F]">
              {completed ? 'Trip Ready to Go' : 'Direct Booking Handoff'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/[0.05] text-[#5A626A] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {completed ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-editorial text-[26px] font-medium text-[#14191F]">
                You’re all set for {destination}!
              </h3>
              <p className="text-[13.5px] text-[#5A626A] mt-1.5 leading-relaxed">
                Your trip summary for {datesLabel} ({travelers}) is saved to Vesper. Export your
                itinerary to your calendar below.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => downloadItineraryIcs(tripTitle, items)}
                className="flex-1 py-3 rounded-full bg-white border border-black/[0.12] hover:border-[#0E2034] text-[#14191F] text-[13.5px] font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>Export .ics calendar</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13.5px] font-medium cursor-pointer"
              >
                Back to my trip
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold text-[#14191F]">{tripTitle}</div>
                <div className="text-[12.5px] text-[#7B828A]">
                  {destination} · {datesLabel} · {travelers}
                </div>
              </div>
              {bookableItems.length > 0 && (
                <span className="font-tabular text-[11.5px] font-medium px-2.5 py-1 rounded-full bg-[#ECEAE2] text-[#2C333A] shrink-0">
                  {bookedIds.size}/{bookableItems.length} booked
                </span>
              )}
            </div>

            <div className="space-y-2.5 max-h-[290px] overflow-y-auto thin-scrollbar">
              {bookableItems.length === 0 ? (
                <div className="rounded-2xl bg-white border border-black/[0.07] p-4 text-[13px] text-[#5A626A]">
                  No paid flights, stays, or tours added yet—open the Bookings tab to compare stays
                  and flights, or export your saved itinerary for free!
                </div>
              ) : (
                bookableItems.map((item) => {
                  const link = getFallbackUrl(item);
                  const isMarked = bookedIds.has(item.id);
                  const loyaltyMatch = findLoyaltyForItem(item);
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl bg-white border border-black/[0.07] p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-[#F3F2EC] flex items-center justify-center text-[#0E2034] shrink-0">
                            {item.type === 'flight' ? (
                              <Plane className="w-4 h-4" />
                            ) : item.type === 'hotel' ? (
                              <BedDouble className="w-4 h-4" />
                            ) : (
                              <Ticket className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13.5px] font-semibold text-[#14191F] truncate">
                              {item.title}
                            </div>
                            <div className="text-[11.5px] text-[#7B828A] truncate">
                              {item.subtitle || `${item.day}${item.time ? ` · ${item.time}` : ''}`}
                            </div>
                          </div>
                        </div>
                        <span className="font-tabular text-[14px] font-semibold text-[#14191F] shrink-0">
                          ${item.price?.toLocaleString()}
                        </span>
                      </div>

                      {/* 1-Tap Loyalty Copy Row for Hotels & Flights */}
                      {(item.type === 'hotel' || item.type === 'flight') &&
                        (loyaltyMatch ? (
                          <div className="flex items-center justify-between gap-2 rounded-xl bg-[#FAF9F5] border border-black/[0.06] px-2.5 py-1.5 text-[11.5px]">
                            <span className="inline-flex items-center gap-1.5 text-[#2C333A] truncate">
                              <Award className="w-3.5 h-3.5 text-[#C85A17] shrink-0" />
                              <span className="font-medium truncate">
                                {loyaltyMatch.programName}
                              </span>
                              <span className="font-tabular text-[#7B828A]">
                                #{loyaltyMatch.memberNumber}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(loyaltyMatch.memberNumber).catch(() => {});
                                setCopiedLoyaltyId(item.id);
                                window.setTimeout(
                                  () => setCopiedLoyaltyId((c) => (c === item.id ? null : c)),
                                  1600
                                );
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-black/[0.09] text-[11px] font-medium text-[#14191F] hover:border-[#0E2034] cursor-pointer shrink-0"
                            >
                              {copiedLoyaltyId === item.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy #</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : onOpenLoyaltyWallet ? (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenLoyaltyWallet(item.type === 'hotel' ? 'hotel' : 'airline');
                            }}
                            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#5A626A] hover:text-[#14191F] cursor-pointer"
                          >
                            <Award className="w-3.5 h-3.5 text-[#C85A17]" />
                            <span>
                              Add {item.type === 'hotel' ? 'hotel loyalty' : 'frequent flyer'} # to
                              earn points →
                            </span>
                          </button>
                        ) : null)}

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/[0.06]">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => {
                            if (!bookedIds.has(item.id)) toggleBooked(item.id);
                          }}
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#14191F] hover:underline"
                        >
                          <span>{link.label}</span>
                          <ExternalLink className="w-3 h-3 text-[#C85A17]" />
                        </a>

                        <button
                          type="button"
                          onClick={() => toggleBooked(item.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                            isMarked
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                              : 'bg-[#FAF9F5] text-[#5A626A] border-black/[0.09] hover:border-black/[0.22]'
                          }`}
                        >
                          <Check className="w-3 h-3" />
                          <span>{isMarked ? 'Booked' : 'Mark booked'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="rounded-2xl bg-[#F3F2EC] p-4 flex items-center justify-between">
              <div>
                <div className="text-[12px] text-[#7B828A]">Estimated trip total</div>
                <div className="font-tabular text-[22px] font-semibold text-[#14191F]">
                  ${total.toLocaleString()}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-full">
                <Sparkles className="w-3 h-3" /> $0 Vesper fee
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11.5px] text-[#5A626A]">
              <ShieldCheck className="w-4 h-4 text-[#0E2034] shrink-0" />
              <span>Book directly with airlines & hotels—zero markup, full loyalty points.</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setCompleted(true);
                onSuccess();
              }}
              className="w-full py-3.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[14px] font-medium shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Finish & export itinerary</span>
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
