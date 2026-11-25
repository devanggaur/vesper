import React from 'react';
import { BedDouble, Plane, ArrowRight, CheckCircle2 } from 'lucide-react';
import { FareClass, FlightOption, HotelItem, TripSavedItem } from '../../types/travel';
import { travelApi } from '../../services/travelApi';
import { HotelComparisonTable, HotelSearchCarousel } from './DiscoverCarousels';
import { FlightSearchWidget } from './FlightSearchWidget';
import { SmartImage } from '../common/SmartImage';

interface CanvasBookingsProps {
  subTab: 'stays' | 'flights';
  onChangeSubTab: (tab: 'stays' | 'flights') => void;
  homeAirport?: string;
  onChangeHomeAirport?: (airport: string) => void;
  destination?: string;
  datesLabel?: string;
  travelers?: string;
  hotels?: HotelItem[];
  items: TripSavedItem[];
  likedIds: Set<string>;
  onToggleLike: (id: string) => void;
  onOpenHotel: (hotel: HotelItem, openRooms?: boolean) => void;
  onAddFlights: (outbound: FlightOption, inbound: FlightOption, fare: FareClass) => void;
  onOpenCheckout: () => void;
  onHoverId: (id: string | null) => void;
}

/**
 * Bookings Studio canvas tab combining Boutique Stays comparison and Round-Trip Flight search.
 */
export const CanvasBookings: React.FC<CanvasBookingsProps> = ({
  subTab,
  onChangeSubTab,
  homeAirport = 'San Francisco (SFO)',
  onChangeHomeAirport,
  destination = 'Mexico City',
  datesLabel = 'Jun 19 – 21',
  travelers = '2 adults',
  hotels: liveHotels,
  items,
  likedIds,
  onToggleLike,
  onOpenHotel,
  onAddFlights,
  onOpenCheckout,
  onHoverId,
}) => {
  const hotels = liveHotels && liveHotels.length > 0 ? liveHotels : travelApi.getHotels();
  const bookedHotel = items.find((i) => i.type === 'hotel');
  const bookedFlight = items.find((i) => i.type === 'flight');
  const bookedTours = items.filter((i) => i.type === 'activity');
  const totalCost = items.reduce((s, i) => s + (i.price || 0), 0);

  const topPicks = hotels.slice(0, 4);

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
                className={`w-4 h-4 ${bookedHotel ? 'text-emerald-600' : 'text-[#8A9097] opacity-40'}`}
              />
              <span>Stay: {bookedHotel ? bookedHotel.title : 'Not selected'}</span>
            </span>
            <span className="text-black/15">·</span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2
                className={`w-4 h-4 ${bookedFlight ? 'text-emerald-600' : 'text-[#8A9097] opacity-40'}`}
              />
              <span>Flights: {bookedFlight ? bookedFlight.flightDetails?.outbound.airline : 'Not selected'}</span>
            </span>
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
          <button
            onClick={onOpenCheckout}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[13px] font-medium shadow-xs transition-all cursor-pointer"
          >
            <span>Continue to book</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sub-tab Switcher: Boutique Stays | Round-Trip Flights */}
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
          <span>Boutique Stays</span>
          {bookedHotel && <span className="text-[11px] opacity-80">✓</span>}
        </button>

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
          <span>Flights · {destination}</span>
          {bookedFlight && <span className="text-[11px] opacity-80">✓</span>}
        </button>
      </div>

      {subTab === 'stays' ? (
        <div className="space-y-7">
          {bookedHotel && bookedHotel.hotelDetails && (
            <div className="rounded-[18px] bg-[#ECEAE2] p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <SmartImage
                  src={bookedHotel.image}
                  alt={bookedHotel.title}
                  className="w-12 h-12 rounded-xl object-cover shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-[#C85A17]">Selected Stay</div>
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
            location={destination}
            dates={datesLabel}
            guests={`1 room, ${travelers}`}
            hotels={hotels}
            likedIds={likedIds}
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
            onChangeOrigin={onChangeHomeAirport}
            onAddFlights={onAddFlights}
          />
        </div>
      )}
    </div>
  );
};
