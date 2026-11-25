import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronLeft,
  Plane,
  Briefcase,
  Luggage,
  Armchair,
  RefreshCw,
  RotateCcw,
  Plus,
  Loader2,
  Check,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { FareClass, FlightOption } from '../../types/travel';
import { FlightSearchResponse, travelApi } from '../../services/travelApi';

interface FlightSearchWidgetProps {
  from: string;
  to: string;
  dates: string;
  passengers: string;
  onChangeOrigin?: (origin: string) => void;
  onAddFlights: (outbound: FlightOption, inbound: FlightOption, fare: FareClass) => void;
}

const ORIGIN_PRESETS = [
  'San Francisco (SFO)',
  'New York (JFK)',
  'Los Angeles (LAX)',
  'Chicago (ORD)',
  'Seattle (SEA)',
  'Boston (BOS)',
  'Miami (MIA)',
  'London (LHR)',
];

const BADGE_PALETTES = [
  'bg-[#1C3F94] text-white',
  'bg-[#0B2343] text-white',
  'bg-[#7C2D12] text-white',
  'bg-[#14532D] text-white',
  'bg-[#4C1D95] text-white',
];

const AirlineBadge: React.FC<{ airline: string }> = ({ airline }) => {
  const initials = airline
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hash = airline.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const colorClass = BADGE_PALETTES[hash % BADGE_PALETTES.length];

  return (
    <div className="flex items-center gap-1.5 shrink-0 max-w-[140px]">
      <span
        className={`w-5 h-5 rounded-md inline-flex items-center justify-center text-[9px] font-bold shrink-0 ${colorClass}`}
      >
        {initials}
      </span>
      <span className="text-[11px] font-bold tracking-wide text-[#14191F] truncate uppercase">
        {airline}
      </span>
    </div>
  );
};

function parseAdultCount(passengers: string): number {
  const m = passengers.match(/\d+/);
  if (m) return Math.min(8, Math.max(1, parseInt(m[0], 10)));
  if (passengers.toLowerCase().includes('solo')) return 1;
  return 2;
}

/**
 * Interactive 3-step universal flight booking widget (Outbound → Return → Fare Class selection).
 * Lazy-loads live or AI-grounded routes for ANY origin/destination pair via `POST /api/bookings/flights`
 * only when the user opens the Flights tab, optimizing MVP API cost.
 */
export const FlightSearchWidget: React.FC<FlightSearchWidgetProps> = ({
  from,
  to,
  dates,
  passengers,
  onChangeOrigin,
  onAddFlights,
}) => {
  const [originCity, setOriginCity] = useState(
    ORIGIN_PRESETS.find((p) => p.toLowerCase().includes(from.toLowerCase())) || from || 'San Francisco (SFO)'
  );
  const [flightData, setFlightData] = useState<FlightSearchResponse | null>(null);
  const [isFetchingRoute, setIsFetchingRoute] = useState(true);

  const [step, setStep] = useState<'outbound' | 'return' | 'fare' | 'booked'>('outbound');
  const [isLoadingStep, setIsLoadingStep] = useState(false);
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [airlineFilter, setAirlineFilter] = useState<string>('all');
  const [selectedOutbound, setSelectedOutbound] = useState<FlightOption | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<FlightOption | null>(null);
  const [addingFareId, setAddingFareId] = useState<string | null>(null);

  const adults = useMemo(() => parseAdultCount(passengers), [passengers]);

  useEffect(() => {
    let cancelled = false;
    setIsFetchingRoute(true);
    setStep('outbound');
    setSelectedOutbound(null);
    setSelectedReturn(null);
    setAirlineFilter('all');

    travelApi
      .searchFlights({
        fromCity: originCity,
        toCity: to,
        datesLabel: dates,
        adults,
      })
      .then((res) => {
        if (!cancelled) {
          setFlightData(res);
          setIsFetchingRoute(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFlightData(travelApi.getFlights());
          setIsFetchingRoute(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [originCity, to, dates, adults]);

  const outboundFlights = flightData?.outbound || [];
  const returnFlights = flightData?.inbound || [];
  const fareClasses = flightData?.fareClasses || [];

  const uniqueAirlines = useMemo(
    () => Array.from(new Set(outboundFlights.map((f) => f.airline))),
    [outboundFlights]
  );

  const filteredOutbound = outboundFlights.filter((f) => {
    if (nonstopOnly && f.stops !== 'Nonstop') return false;
    if (airlineFilter !== 'all' && f.airline !== airlineFilter) return false;
    return true;
  });

  const filteredReturn = returnFlights.filter((f) => {
    if (nonstopOnly && f.stops !== 'Nonstop') return false;
    return true;
  });

  const handleSelectOutbound = (flight: FlightOption) => {
    setSelectedOutbound(flight);
    setIsLoadingStep(true);
    setStep('return');
    setTimeout(() => setIsLoadingStep(false), 350);
  };

  const handleSelectReturn = (flight: FlightOption) => {
    setSelectedReturn(flight);
    setIsLoadingStep(true);
    setStep('fare');
    setTimeout(() => setIsLoadingStep(false), 350);
  };

  const handleBookFare = (fare: FareClass) => {
    if (!selectedOutbound || !selectedReturn) return;
    setAddingFareId(fare.id);
    setTimeout(() => {
      setAddingFareId(null);
      setStep('booked');
      onAddFlights(selectedOutbound, selectedReturn, fare);
    }, 450);
  };

  if (step === 'booked') {
    return (
      <div className="rounded-[18px] bg-[#ECEAE2]/75 border border-black/[0.07] px-4 py-3 text-[13px] text-[#4A535C] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-[#0E2034]" />
          <span>
            Round-trip flights ({flightData?.fromCode || 'SFO'} ⇄ {flightData?.toCode || to}) added
            to your trip.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setStep('outbound')}
          className="text-[12px] font-semibold text-[#14191F] underline cursor-pointer"
        >
          Change flights
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Top Search Parameters Bar (with editable Origin selector) */}
      <div className="rounded-[18px] bg-white border border-black/[0.08] grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-black/[0.07] shadow-2xs overflow-hidden">
        <div className="px-3.5 py-2 border-r sm:border-r-0 border-black/[0.07] relative">
          <label className="block text-[10.5px] text-[#7B828A]">From</label>
          <div className="flex items-center justify-between">
            <select
              value={originCity}
              onChange={(e) => {
                setOriginCity(e.target.value);
                onChangeOrigin?.(e.target.value);
              }}
              className="w-full appearance-none [-webkit-appearance:none] bg-transparent text-[13px] font-semibold text-[#14191F] focus:outline-none cursor-pointer pr-4 truncate"
              aria-label="Departure airport"
            >
              {ORIGIN_PRESETS.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#7B828A] pointer-events-none shrink-0 -ml-4" />
          </div>
        </div>
        <div className="px-3.5 py-2">
          <div className="text-[10.5px] text-[#7B828A]">To</div>
          <div className="text-[13px] font-semibold text-[#14191F] truncate">
            {to} {flightData?.toCode ? `(${flightData.toCode})` : ''}
          </div>
        </div>
        <div className="px-3.5 py-2 border-r sm:border-r-0 border-black/[0.07]">
          <div className="text-[10.5px] text-[#7B828A]">When</div>
          <div className="text-[13px] font-medium text-[#14191F] truncate">{dates}</div>
        </div>
        <div className="px-3.5 py-2">
          <div className="text-[10.5px] text-[#7B828A]">Passengers</div>
          <div className="text-[13px] font-medium text-[#14191F] truncate">{passengers}</div>
        </div>
      </div>

      {/* Filter Pills + Direct Provider Link Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => setNonstopOnly((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border shrink-0 transition-colors cursor-pointer ${
              nonstopOnly
                ? 'bg-[#0E2034] border-[#0E2034]'
                : 'bg-white text-[#2C333A] border-black/[0.1] hover:border-black/[0.25]'
            }`}
          >
            <span>{nonstopOnly ? 'Nonstop only' : 'Any stops'}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {uniqueAirlines.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const cycle = ['all', ...uniqueAirlines];
                const idx = cycle.indexOf(airlineFilter);
                setAirlineFilter(cycle[(idx + 1) % cycle.length]);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border shrink-0 transition-colors cursor-pointer ${
                airlineFilter !== 'all'
                  ? 'bg-[#0E2034] border-[#0E2034]'
                  : 'bg-white text-[#2C333A] border-black/[0.1] hover:border-black/[0.25]'
              }`}
            >
              <Plane className="w-3 h-3" />
              <span>{airlineFilter === 'all' ? 'All airlines' : airlineFilter}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          )}

          {flightData?.source && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#ECEAE2] text-[11px] font-medium text-[#5A626A] shrink-0">
              <Sparkles className="w-3 h-3 text-[#C85A17]" />
              <span>{flightData.source === 'amadeus' ? 'Live GDS fares' : 'Route estimate'}</span>
            </span>
          )}
        </div>

        {flightData?.providerBookingUrl && (
          <a
            href={flightData.providerBookingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#14191F] hover:underline shrink-0"
          >
            <span>Live Google Flights</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Step Content Container */}
      <div className="rounded-[22px] bg-[#F3F2EC]/90 border border-black/[0.06] p-3.5 space-y-3">
        {/* Step Header */}
        <div className="flex items-center justify-between gap-2">
          {step !== 'outbound' ? (
            <button
              type="button"
              onClick={() => setStep(step === 'fare' ? 'return' : 'outbound')}
              className="w-9 h-9 rounded-full bg-white border border-black/[0.08] hover:bg-black/[0.03] flex items-center justify-center text-[#14191F] cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : null}

          <div className="flex-1 rounded-2xl bg-white border border-black/[0.07] py-2 px-4 text-center">
            {step === 'outbound' && (
              <>
                <div className="text-[13px] font-semibold text-[#14191F]">
                  {originCity.split(' (')[0]} → {to}
                </div>
                <div className="text-[11px] text-[#7B828A]">Outbound · {dates}</div>
              </>
            )}
            {step === 'return' && (
              <>
                <div className="text-[13px] font-semibold text-[#14191F]">
                  {to} → {originCity.split(' (')[0]}
                </div>
                <div className="text-[11px] text-[#7B828A]">Return · {dates}</div>
              </>
            )}
            {step === 'fare' && (
              <>
                <div className="text-[13px] font-semibold text-[#14191F]">Select Fare</div>
                <div className="text-[11px] text-[#7B828A]">Total for {passengers}</div>
              </>
            )}
          </div>
        </div>

        {/* Loading Skeleton */}
        {isFetchingRoute || isLoadingStep ? (
          <div className="space-y-2.5 py-1">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-[72px] rounded-2xl bg-white/80 border border-black/[0.05] skeleton-pulse"
              />
            ))}
          </div>
        ) : step === 'outbound' || step === 'return' ? (
          /* Flight Option Rows */
          <div className="space-y-2">
            {(step === 'outbound' ? filteredOutbound : filteredReturn).map((flt) => (
              <motion.button
                key={flt.id}
                type="button"
                whileHover={{ y: -1 }}
                onClick={() =>
                  step === 'outbound' ? handleSelectOutbound(flt) : handleSelectReturn(flt)
                }
                className="w-full rounded-2xl bg-white hover:border-[#0E2034]/35 border border-black/[0.07] px-3.5 sm:px-4 py-3 sm:py-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 transition-all cursor-pointer text-left"
              >
                {/* Mobile Top Row: Airline + Price */}
                <div className="flex sm:hidden items-center justify-between w-full">
                  <AirlineBadge airline={flt.airline} />
                  <div className="flex items-baseline gap-1">
                    <span className="font-tabular text-[15px] font-semibold text-[#14191F]">
                      ${flt.priceRoundTrip.toLocaleString()}
                    </span>
                    <span className="text-[10.5px] text-[#7B828A]">RT</span>
                  </div>
                </div>

                {/* Desktop Airline Column */}
                <div className="hidden sm:block w-[135px] shrink-0">
                  <AirlineBadge airline={flt.airline} />
                </div>

                <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 w-full">
                  <div>
                    <div className="font-tabular text-[14px] font-semibold text-[#14191F]">
                      {flt.departTime}
                    </div>
                    <div className="text-[11px] text-[#7B828A]">{flt.fromCode}</div>
                  </div>

                  <div className="flex-1 flex flex-col items-center px-1.5 sm:px-2">
                    <span className="text-[10.5px] text-[#7B828A]">{flt.duration}</span>
                    <div className="w-full h-[1px] bg-black/15 my-1 relative">
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-black/25" />
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-black/25" />
                    </div>
                    <span className="text-[10.5px] text-[#5A626A]">{flt.stops}</span>
                  </div>

                  <div>
                    <div className="font-tabular text-[14px] font-semibold text-[#14191F]">
                      {flt.arriveTime}
                      {flt.arriveNextDay && (
                        <sup className="text-[9.5px] font-semibold text-[#7B828A] ml-0.5">+1</sup>
                      )}
                    </div>
                    <div className="text-[11px] text-[#7B828A]">{flt.toCode}</div>
                  </div>
                </div>

                {/* Desktop Price Column */}
                <div className="hidden sm:flex text-right shrink-0 items-center gap-2">
                  <div>
                    <div className="font-tabular text-[15px] font-semibold text-[#14191F]">
                      ${flt.priceRoundTrip.toLocaleString()}
                    </div>
                    <div className="text-[10.5px] text-[#7B828A]">Round trip</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#8A9097]" />
                </div>
              </motion.button>
            ))}
          </div>
        ) : (
          /* Step 3: Fare Class Selection */
          <div className="space-y-4">
            {selectedOutbound && (
              <div>
                <div className="text-[12.5px] font-semibold text-[#14191F] mb-1.5">
                  Outbound · {selectedOutbound.fromCode} → {selectedOutbound.toCode}
                </div>
                <div className="rounded-2xl bg-white border border-black/[0.07] px-4 py-3 flex items-center gap-4">
                  <div className="w-[125px] shrink-0">
                    <AirlineBadge airline={selectedOutbound.airline} />
                    <div className="text-[10.5px] text-[#7B828A] mt-0.5">
                      {selectedOutbound.flightNumber}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-1">
                    <div>
                      <div className="font-tabular text-[14px] font-semibold text-[#14191F]">
                        {selectedOutbound.departTime}
                      </div>
                      <div className="text-[11px] text-[#7B828A]">{selectedOutbound.fromCode}</div>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[10.5px] text-[#7B828A]">{selectedOutbound.duration}</span>
                      <div className="w-full h-[1px] bg-black/15 my-1" />
                      <span className="text-[10.5px] text-[#5A626A]">{selectedOutbound.stops}</span>
                    </div>
                    <div>
                      <div className="font-tabular text-[14px] font-semibold text-[#14191F]">
                        {selectedOutbound.arriveTime}
                      </div>
                      <div className="text-[11px] text-[#7B828A]">{selectedOutbound.toCode}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedReturn && (
              <div>
                <div className="text-[12.5px] font-semibold text-[#14191F] mb-1.5">
                  Return · {selectedReturn.fromCode} → {selectedReturn.toCode}
                </div>
                <div className="rounded-2xl bg-white border border-black/[0.07] px-4 py-3 flex items-center gap-4">
                  <div className="w-[125px] shrink-0">
                    <AirlineBadge airline={selectedReturn.airline} />
                    <div className="text-[10.5px] text-[#7B828A] mt-0.5">
                      {selectedReturn.flightNumber}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-1">
                    <div>
                      <div className="font-tabular text-[14px] font-semibold text-[#14191F]">
                        {selectedReturn.departTime}
                      </div>
                      <div className="text-[11px] text-[#7B828A]">{selectedReturn.fromCode}</div>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                      <span className="text-[10.5px] text-[#7B828A]">{selectedReturn.duration}</span>
                      <div className="w-full h-[1px] bg-black/15 my-1" />
                      <span className="text-[10.5px] text-[#5A626A]">{selectedReturn.stops}</span>
                    </div>
                    <div>
                      <div className="font-tabular text-[14px] font-semibold text-[#14191F]">
                        {selectedReturn.arriveTime}
                      </div>
                      <div className="text-[11px] text-[#7B828A]">{selectedReturn.toCode}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Choose Your Fare Horizontal Cards */}
            <div>
              <div className="text-[14px] font-semibold text-[#14191F] mb-2.5">Choose Your Fare</div>
              <div className="flex gap-3 overflow-x-auto thin-scrollbar pb-2">
                {fareClasses.map((fare) => {
                  const isAddingThis = addingFareId === fare.id;
                  const icons = [Briefcase, Luggage, Armchair, Sparkles, RefreshCw, RotateCcw];
                  return (
                    <div
                      key={fare.id}
                      className="w-[235px] shrink-0 rounded-[20px] bg-white border border-black/[0.08] p-4 shadow-xs flex flex-col justify-between space-y-4"
                    >
                      <div className="space-y-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[14px] font-semibold text-[#14191F]">
                            {fare.name}
                          </span>
                          <div className="text-right">
                            <div className="font-tabular text-[15.5px] font-semibold text-[#14191F]">
                              ${fare.price.toLocaleString()}
                            </div>
                            {fare.delta > 0 && (
                              <div className="font-tabular text-[10.5px] text-[#7B828A]">
                                +${fare.delta}
                              </div>
                            )}
                          </div>
                        </div>

                        <ul className="space-y-2 text-[12.5px]">
                          {fare.features.map((feat, idx) => {
                            const IconComp = icons[idx % icons.length];
                            return (
                              <li
                                key={feat.label}
                                className={`flex items-center gap-2 ${
                                  feat.included
                                    ? 'text-[#14191F]'
                                    : 'text-[#8A9097] line-through decoration-black/30'
                                }`}
                              >
                                <IconComp className="w-3.5 h-3.5 shrink-0 opacity-75" />
                                <span>{feat.label}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        <button
                          type="button"
                          disabled={addingFareId !== null}
                          onClick={() => handleBookFare(fare)}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] disabled:opacity-60 text-[13px] font-medium transition-all cursor-pointer"
                        >
                          {isAddingThis ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Adding...</span>
                            </>
                          ) : (
                            <>
                              <span>Add to trip</span>
                              <Plus className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                        <div className="text-center text-[10.5px] text-[#7B828A]">
                          Direct handoff · {selectedOutbound?.airline}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
