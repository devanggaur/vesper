import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { store } from './supabase';
import { parseTripIsoDates, searchSerpApiFlights } from './serpapi';
import type { FareClass, FlightOption } from '../../src/types/travel';

/**
 * Phase 3 Bookings Service — Universal Flights + Provider Deep-Link Handoff
 * -------------------------------------------------------------------------
 * Cost-optimized dual-mode engine:
 *  1. If `AMADEUS_CLIENT_ID` + `AMADEUS_CLIENT_SECRET` are set in `.env`, queries live
 *     Amadeus Flight Offers Search v2 (cached 15 minutes in Supabase `place_cache`).
 *  2. Otherwise, uses Gemini Interactions API (cached 12 hours in Supabase `place_cache`)
 *     to resolve real IATA airport codes, real airlines serving that exact route, realistic
 *     schedules/fares, and direct pre-filled Google Flights booking handoff URLs ($0 GDS fee).
 */

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export interface LiveFlightSearchResult {
  fromCity: string;
  toCity: string;
  fromCode: string;
  toCode: string;
  outboundDate: string;
  returnDate: string;
  outbound: FlightOption[];
  inbound: FlightOption[];
  fareClasses: FareClass[];
  providerBookingUrl: string;
  source: 'serpapi' | 'amadeus' | 'estimated';
}

let cachedAmadeusToken: { token: string; expiresAt: number } | null = null;

async function getAmadeusAccessToken(): Promise<string | null> {
  if (!config.amadeusClientId || !config.amadeusClientSecret) return null;
  if (cachedAmadeusToken && cachedAmadeusToken.expiresAt > Date.now() + 60_000) {
    return cachedAmadeusToken.token;
  }
  try {
    const res = await fetch(`${config.amadeusBaseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.amadeusClientId,
        client_secret: config.amadeusClientSecret,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    cachedAmadeusToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 1700) * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

export function buildGoogleFlightsUrl(from: string, to: string, datesLabel: string): string {
  const q = `Flights from ${from} to ${to} ${datesLabel}`.trim();
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

export function buildGoogleHotelsUrl(hotelName: string, destination: string, datesLabel: string): string {
  const q = `${hotelName} ${destination} ${datesLabel}`.trim();
  return `https://www.google.com/travel/hotels?q=${encodeURIComponent(q)}`;
}

export function buildActivityBookingUrl(
  activityTitle: string,
  destination: string,
  bookingType: 'walk_in' | 'timed_ticket' | 'guided_tour' | 'reservation' = 'guided_tour'
): { label: string; url: string; partnerName: string } {
  const query = `${activityTitle} ${destination}`.trim();

  if (bookingType === 'reservation') {
    return {
      label: 'Find table on OpenTable / Resy',
      url: `https://www.google.com/search?q=${encodeURIComponent(`${query} reservation OpenTable Resy`)}`,
      partnerName: 'Dining Reservations',
    };
  }

  if (config.viatorPartnerId) {
    return {
      label:
        bookingType === 'guided_tour'
          ? 'Check tour availability on Viator'
          : 'Skip-the-line & tours on Viator',
      url: `https://www.viator.com/searchResults/all?text=${encodeURIComponent(query)}&pid=${encodeURIComponent(config.viatorPartnerId)}`,
      partnerName: 'Viator',
    };
  }

  const gygParams = new URLSearchParams({ q: query });
  if (config.gygPartnerId) gygParams.set('partner_id', config.gygPartnerId);

  return {
    label:
      bookingType === 'guided_tour'
        ? 'Check availability on GetYourGuide'
        : 'Skip-the-line & tours (GetYourGuide)',
    url: `https://www.getyourguide.com/s/?${gygParams.toString()}`,
    partnerName: 'GetYourGuide',
  };
}

/** Well-known city -> IATA lookup for instant zero-latency fallback */
const KNOWN_AIRPORTS: Record<string, string> = {
  'san francisco': 'SFO',
  'san jose': 'SJC',
  'oakland': 'OAK',
  'new york': 'JFK',
  'newark': 'EWR',
  'los angeles': 'LAX',
  'chicago': 'ORD',
  'seattle': 'SEA',
  'boston': 'BOS',
  'miami': 'MIA',
  'austin': 'AUS',
  'dallas': 'DFW',
  'denver': 'DEN',
  'atlanta': 'ATL',
  'washington': 'IAD',
  'toronto': 'YYZ',
  'vancouver': 'YVR',
  'montreal': 'YUL',
  'london': 'LHR',
  'paris': 'CDG',
  'lisbon': 'LIS',
  'porto': 'OPO',
  'madrid': 'MAD',
  'barcelona': 'BCN',
  'rome': 'FCO',
  'milan': 'MXP',
  'florence': 'FLR',
  'venice': 'VCE',
  'amsterdam': 'AMS',
  'zurich': 'ZRH',
  'dublin': 'DUB',
  'frankfurt': 'FRA',
  'munich': 'MUC',
  'athens': 'ATH',
  'istanbul': 'IST',
  'dubai': 'DXB',
  'delhi': 'DEL',
  'new delhi': 'DEL',
  'mumbai': 'BOM',
  'bengaluru': 'BLR',
  'bangalore': 'BLR',
  'singapore': 'SIN',
  'hong kong': 'HKG',
  'bangkok': 'BKK',
  'seoul': 'ICN',
  'kyoto': 'KIX',
  'osaka': 'KIX',
  'tokyo': 'HND',
  'mexico city': 'MEX',
  'cancun': 'CUN',
  'banff': 'YYC',
  'calgary': 'YYC',
  'amalfi': 'NAP',
  'amalfi coast': 'NAP',
  'naples': 'NAP',
  'oaxaca': 'OAX',
  'sedona': 'PHX',
  'phoenix': 'PHX',
  'bali': 'DPS',
  'sydney': 'SYD',
  'melbourne': 'MEL',
  'reykjavik': 'KEF',
};

export function guessIata(city: string): string {
  const clean = city.trim();
  const parenMatch = clean.match(/\(([A-Z]{3})\)/);
  if (parenMatch) return parenMatch[1];
  if (/^[A-Z]{3}$/.test(clean)) return clean;
  const lower = clean.toLowerCase();
  for (const [k, code] of Object.entries(KNOWN_AIRPORTS)) {
    if (lower.includes(k)) return code;
  }
  return clean.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'INT';
}

function buildFallbackFlightSchedule(
  fromCity: string,
  toCity: string,
  datesLabel: string,
  adults: number
): LiveFlightSearchResult {
  const fromCode = guessIata(fromCity);
  const toCode = guessIata(toCity);
  const isLongHaul = !['MEX', 'YYC', 'PHX', 'LAX', 'ORD', 'JFK', 'SEA', 'BOS', 'MIA', 'OAX'].includes(
    toCode
  );
  const perPaxBase = isLongHaul ? 780 : 390;
  const rtBase = perPaxBase * Math.max(1, adults);
  const airlines =
    toCode === 'LIS'
      ? ['TAP Air Portugal', 'United', 'Lufthansa']
      : toCode === 'KIX' || toCode === 'HND'
      ? ['ANA', 'Japan Airlines', 'United']
      : toCode === 'CDG'
      ? ['Air France', 'United', 'Delta']
      : toCode === 'YYC'
      ? ['Air Canada', 'United', 'WestJet']
      : toCode === 'MEX'
      ? ['United', 'Aeroméxico', 'Alaska Airlines']
      : ['United', 'Delta', 'American Airlines'];

  const dur = isLongHaul ? '10h 45m' : '4h 15m';
  const durOneStop = isLongHaul ? '13h 20m' : '6h 35m';

  const outbound: FlightOption[] = [
    {
      id: `out-${fromCode}-${toCode}-1`,
      airline: airlines[0],
      flightNumber: `${airlines[0].slice(0, 2).toUpperCase()} 214`,
      departTime: '10:35 AM',
      arriveTime: isLongHaul ? '6:20 AM' : '4:50 PM',
      arriveNextDay: isLongHaul,
      fromCode,
      toCode,
      duration: dur,
      stops: 'Nonstop',
      priceRoundTrip: rtBase,
      direction: 'outbound',
    },
    {
      id: `out-${fromCode}-${toCode}-2`,
      airline: airlines[1],
      flightNumber: `${airlines[1].slice(0, 2).toUpperCase()} 842`,
      departTime: '1:50 PM',
      arriveTime: isLongHaul ? '10:15 AM' : '8:05 PM',
      arriveNextDay: isLongHaul,
      fromCode,
      toCode,
      duration: dur,
      stops: 'Nonstop',
      priceRoundTrip: rtBase + 90 * adults,
      direction: 'outbound',
    },
    {
      id: `out-${fromCode}-${toCode}-3`,
      airline: airlines[2],
      flightNumber: `${airlines[2].slice(0, 2).toUpperCase()} 519`,
      departTime: '7:40 AM',
      arriveTime: isLongHaul ? '6:00 AM' : '4:15 PM',
      arriveNextDay: isLongHaul,
      fromCode,
      toCode,
      duration: durOneStop,
      stops: '1 stop',
      priceRoundTrip: Math.max(220 * adults, rtBase - 110 * adults),
      direction: 'outbound',
    },
  ];

  const inbound: FlightOption[] = [
    {
      id: `ret-${toCode}-${fromCode}-1`,
      airline: airlines[0],
      flightNumber: `${airlines[0].slice(0, 2).toUpperCase()} 215`,
      departTime: '4:45 PM',
      arriveTime: isLongHaul ? '8:10 PM' : '8:55 PM',
      fromCode: toCode,
      toCode: fromCode,
      duration: dur,
      stops: 'Nonstop',
      priceRoundTrip: rtBase,
      direction: 'return',
    },
    {
      id: `ret-${toCode}-${fromCode}-2`,
      airline: airlines[1],
      flightNumber: `${airlines[1].slice(0, 2).toUpperCase()} 843`,
      departTime: '11:20 AM',
      arriveTime: isLongHaul ? '2:55 PM' : '3:35 PM',
      fromCode: toCode,
      toCode: fromCode,
      duration: dur,
      stops: 'Nonstop',
      priceRoundTrip: rtBase + 75 * adults,
      direction: 'return',
    },
    {
      id: `ret-${toCode}-${fromCode}-3`,
      airline: airlines[2],
      flightNumber: `${airlines[2].slice(0, 2).toUpperCase()} 520`,
      departTime: '8:30 AM',
      arriveTime: isLongHaul ? '2:45 PM' : '3:10 PM',
      fromCode: toCode,
      toCode: fromCode,
      duration: durOneStop,
      stops: '1 stop',
      priceRoundTrip: Math.max(220 * adults, rtBase - 95 * adults),
      direction: 'return',
    },
  ];

  const fareClasses: FareClass[] = [
    {
      id: 'fare-basic',
      name: 'Basic Economy',
      price: Math.max(200 * adults, rtBase - 120 * adults),
      delta: 0,
      features: [
        { label: 'Personal item included', included: true },
        { label: 'Carry-on bag', included: false },
        { label: 'Standard seat selection', included: false },
        { label: 'Changes permitted', included: false },
      ],
    },
    {
      id: 'fare-main',
      name: 'Main Economy',
      price: rtBase,
      delta: 120 * adults,
      features: [
        { label: 'Personal item + carry-on bag', included: true },
        { label: 'Standard seat selection', included: true },
        { label: 'No change fees', included: true },
        { label: 'Refundable to original card', included: false },
      ],
    },
    {
      id: 'fare-flex',
      name: 'Economy Flex',
      price: rtBase + 240 * adults,
      delta: 360 * adults,
      features: [
        { label: 'Carry-on + 1 checked bag', included: true },
        { label: 'Preferred / extra legroom seat', included: true },
        { label: 'Free changes & priority boarding', included: true },
        { label: 'Fully refundable before departure', included: true },
      ],
    },
  ];

  const { startDate: outboundDate, endDate: returnDate } = parseTripIsoDates(datesLabel);

  return {
    fromCity,
    toCity,
    fromCode,
    toCode,
    outboundDate,
    returnDate,
    outbound,
    inbound,
    fareClasses,
    providerBookingUrl: buildGoogleFlightsUrl(fromCode, toCode, `${outboundDate} to ${returnDate}`),
    source: 'estimated',
  };
}

/**
 * Generates destination-aware round-trip flights & fare tiers for ANY origin/destination pair:
 *  1. Live Google Flights via SerpApi when `SERPAPI_API_KEY` is configured (2h cached).
 *  2. Live Amadeus GDS when `AMADEUS_*` keys are configured (30m cached).
 *  3. Gemini-grounded real-world route schedules cached 12h in Supabase.
 */
export async function searchFlightsForRoute(params: {
  fromCity: string;
  toCity: string;
  datesLabel: string;
  startDate?: string;
  endDate?: string;
  adults: number;
  preferredAirlines?: string[];
}): Promise<LiveFlightSearchResult> {
  const fromNorm = params.fromCity.trim() || 'San Francisco';
  const toNorm = params.toCity.trim() || 'Mexico City';
  const adults = Math.min(8, Math.max(1, params.adults || 2));
  const { startDate: outboundDate, endDate: returnDate } = parseTripIsoDates(
    params.datesLabel,
    params.startDate,
    params.endDate
  );
  const prefKey = (params.preferredAirlines || []).map((a) => a.toLowerCase()).sort().join(',');
  const modeTag = config.serpApiKey ? 'serp' : 'est';
  const cacheKey = `flights:v2:${modeTag}:${fromNorm.toLowerCase()}->${toNorm.toLowerCase()}:${outboundDate}:${returnDate}:p${adults}${
    prefKey ? `:l=${prefKey}` : ''
  }`;

  const cached = await store.getCache<LiveFlightSearchResult>(cacheKey);
  if (cached) {
    return cached;
  }

  // 1. Live Google Flights via SerpApi (real airline schedules, flight numbers, prices & direct links)
  if (config.serpApiKey) {
    const originCode = guessIata(fromNorm);
    const destCode = guessIata(toNorm);
    const liveOutbound = await searchSerpApiFlights({
      fromCode: originCode,
      toCode: destCode,
      outboundDate,
      returnDate,
      adults,
      preferredAirlines: params.preferredAirlines,
    });
    if (liveOutbound && liveOutbound.flights.length > 0) {
      const topToken = liveOutbound.flights[0].departureToken;
      const liveReturn = topToken
        ? await searchSerpApiFlights({
            fromCode: originCode,
            toCode: destCode,
            outboundDate,
            returnDate,
            adults,
            preferredAirlines: params.preferredAirlines,
            departureToken: topToken,
          })
        : null;

      const template = buildFallbackFlightSchedule(fromNorm, toNorm, params.datesLabel, adults);
      const base = liveOutbound.flights[0].priceRoundTrip;
      const liveResult: LiveFlightSearchResult = {
        fromCity: fromNorm,
        toCity: toNorm,
        fromCode: originCode,
        toCode: destCode,
        outboundDate,
        returnDate,
        outbound: liveOutbound.flights,
        inbound:
          liveReturn && liveReturn.flights.length > 0
            ? liveReturn.flights
            : template.inbound.map((f, idx) => ({
                ...f,
                airline: liveOutbound.flights[idx % liveOutbound.flights.length].airline,
                airlineLogo: liveOutbound.flights[idx % liveOutbound.flights.length].airlineLogo,
                priceRoundTrip: liveOutbound.flights[idx % liveOutbound.flights.length].priceRoundTrip,
                bookingUrl: liveOutbound.googleFlightsUrl,
              })),
        fareClasses: template.fareClasses.map((f, i) => ({
          ...f,
          price: i === 0 ? base : base + i * 110 * adults,
          delta: i * 110 * adults,
        })),
        providerBookingUrl: liveOutbound.googleFlightsUrl,
        source: 'serpapi',
      };
      await store.setCache(cacheKey, liveResult, 0.08); // ~2 hour TTL
      return liveResult;
    }
  }

  // 1. Live Amadeus GDS path (activates automatically once AMADEUS_* env vars are added)
  const amadeusToken = await getAmadeusAccessToken();
  if (amadeusToken) {
    const originCode = guessIata(fromNorm);
    const destCode = guessIata(toNorm);
    try {
      const departDate = new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10);
      const returnDate = new Date(Date.now() + 25 * 86400_000).toISOString().slice(0, 10);
      const url = `${config.amadeusBaseUrl}/v2/shopping/flight-offers?originLocationCode=${originCode}&destinationLocationCode=${destCode}&departureDate=${departDate}&returnDate=${returnDate}&adults=${adults}&max=5&currencyCode=USD`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${amadeusToken}` },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{
            id: string;
            price?: { grandTotal?: string };
            itineraries?: Array<{
              duration?: string;
              segments?: Array<{
                carrierCode?: string;
                number?: string;
                departure?: { iataCode?: string; at?: string };
                arrival?: { iataCode?: string; at?: string };
              }>;
            }>;
          }>;
          dictionaries?: { carriers?: Record<string, string> };
        };
        if (json.data && json.data.length > 0) {
          const carriers = json.dictionaries?.carriers || {};
          const formatTime = (iso?: string) => {
            if (!iso) return '10:00 AM';
            const d = new Date(iso);
            return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          };
          const formatDur = (iso = 'PT5H') =>
            iso.replace('PT', '').replace('H', 'h ').replace('M', 'm').toLowerCase().trim();

          const outbound: FlightOption[] = [];
          const inbound: FlightOption[] = [];
          json.data.slice(0, 4).forEach((offer, idx) => {
            const total = Math.round(Number(offer.price?.grandTotal || 900));
            const outItin = offer.itineraries?.[0];
            const retItin = offer.itineraries?.[1];
            const outSegs = outItin?.segments || [];
            const retSegs = retItin?.segments || [];
            if (outSegs.length > 0) {
              const first = outSegs[0];
              const last = outSegs[outSegs.length - 1];
              const carrier = carriers[first.carrierCode || ''] || first.carrierCode || 'Airline';
              outbound.push({
                id: `am-out-${offer.id}-${idx}`,
                airline: carrier,
                flightNumber: `${first.carrierCode || ''} ${first.number || ''}`.trim(),
                departTime: formatTime(first.departure?.at),
                arriveTime: formatTime(last.arrival?.at),
                fromCode: first.departure?.iataCode || originCode,
                toCode: last.arrival?.iataCode || destCode,
                duration: formatDur(outItin?.duration),
                stops: outSegs.length === 1 ? 'Nonstop' : `${outSegs.length - 1} stop`,
                priceRoundTrip: total,
                direction: 'outbound',
              });
            }
            if (retSegs.length > 0) {
              const first = retSegs[0];
              const last = retSegs[retSegs.length - 1];
              const carrier = carriers[first.carrierCode || ''] || first.carrierCode || 'Airline';
              inbound.push({
                id: `am-ret-${offer.id}-${idx}`,
                airline: carrier,
                flightNumber: `${first.carrierCode || ''} ${first.number || ''}`.trim(),
                departTime: formatTime(first.departure?.at),
                arriveTime: formatTime(last.arrival?.at),
                fromCode: first.departure?.iataCode || destCode,
                toCode: last.arrival?.iataCode || originCode,
                duration: formatDur(retItin?.duration),
                stops: retSegs.length === 1 ? 'Nonstop' : `${retSegs.length - 1} stop`,
                priceRoundTrip: total,
                direction: 'return',
              });
            }
          });

          if (outbound.length > 0 && inbound.length > 0) {
            const base = outbound[0].priceRoundTrip;
            const liveRes: LiveFlightSearchResult = {
              fromCity: fromNorm,
              toCity: toNorm,
              fromCode: originCode,
              toCode: destCode,
              outboundDate,
              returnDate,
              outbound,
              inbound,
              fareClasses: buildFallbackFlightSchedule(fromNorm, toNorm, params.datesLabel, adults)
                .fareClasses.map((f, i) => ({
                  ...f,
                  price: i === 0 ? base : base + i * 140 * adults,
                  delta: i * 140 * adults,
                })),
              providerBookingUrl: buildGoogleFlightsUrl(originCode, destCode, params.datesLabel),
              source: 'amadeus',
            };
            await store.setCache(cacheKey, liveRes, 0.02); // ~30 min TTL for live GDS fares
            return liveRes;
          }
        }
      }
    } catch (err) {
      console.warn('[bookings] Amadeus lookup failed, falling back:', (err as Error)?.message);
    }
  }

  // 2. Gemini-grounded real-world route & carrier resolver (cached 12h in Supabase -> ~$0 cost)
  try {
    const schema = {
      type: 'object',
      properties: {
        fromCode: { type: 'string', description: '3-letter IATA airport code for origin' },
        toCode: { type: 'string', description: '3-letter IATA airport code nearest destination (e.g. KIX for Kyoto, YYC for Banff, LIS for Lisbon)' },
        airlines: {
          type: 'array',
          items: { type: 'string' },
          description: '3 real airlines that serve this exact route',
        },
        nonstopDuration: { type: 'string', description: 'Typical flight duration like "11h 10m" or "4h 30m"' },
        oneStopDuration: { type: 'string', description: 'Typical 1-stop duration like "14h 15m"' },
        overnightOutbound: { type: 'boolean' },
        estimatedRoundTripPerAdultUsd: { type: 'number', description: 'Realistic economy round-trip USD fare per adult' },
      },
      required: [
        'fromCode',
        'toCode',
        'airlines',
        'nonstopDuration',
        'oneStopDuration',
        'overnightOutbound',
        'estimatedRoundTripPerAdultUsd',
      ],
    };

    const controller = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Gemini flight route lookup timeout')), 9000)
    );

    const interaction = await Promise.race([
      ai.interactions.create({
        model: config.geminiModels[0],
        system_instruction:
          'You are an aviation route planner. Return accurate IATA codes, real carriers operating the route, realistic durations, and typical round-trip economy USD fares per adult.',
        input: `Origin: ${fromNorm}\nDestination: ${toNorm}\nDates: ${params.datesLabel}${
          params.preferredAirlines?.length
            ? `\nTraveler's Preferred Frequent Flyer Airlines: ${params.preferredAirlines.join(', ')} (prioritize these carriers or their alliance partners first if they fly this route)`
            : ''
        }`,
        response_format: { type: 'text', mime_type: 'application/json', schema },
        store: false,
      }),
      controller,
    ]);

    const parsed = JSON.parse((interaction.output_text || '').trim()) as {
      fromCode: string;
      toCode: string;
      airlines: string[];
      nonstopDuration: string;
      oneStopDuration: string;
      overnightOutbound: boolean;
      estimatedRoundTripPerAdultUsd: number;
    };

    const fromCode = (parsed.fromCode || guessIata(fromNorm)).toUpperCase().slice(0, 3);
    const toCode = (parsed.toCode || guessIata(toNorm)).toUpperCase().slice(0, 3);
    const base = Math.max(180, Math.round(parsed.estimatedRoundTripPerAdultUsd || 620)) * adults;
    const airlines =
      parsed.airlines && parsed.airlines.length >= 2
        ? parsed.airlines
        : ['United', 'Delta', 'Air France'];

    const template = buildFallbackFlightSchedule(fromNorm, toNorm, params.datesLabel, adults);
    const result: LiveFlightSearchResult = {
      ...template,
      fromCode,
      toCode,
      providerBookingUrl: buildGoogleFlightsUrl(fromCode, toCode, params.datesLabel),
      outbound: [
        {
          ...template.outbound[0],
          airline: airlines[0],
          fromCode,
          toCode,
          duration: parsed.nonstopDuration || template.outbound[0].duration,
          arriveNextDay: parsed.overnightOutbound,
          priceRoundTrip: base,
        },
        {
          ...template.outbound[1],
          airline: airlines[1] || airlines[0],
          fromCode,
          toCode,
          duration: parsed.nonstopDuration || template.outbound[1].duration,
          arriveNextDay: parsed.overnightOutbound,
          priceRoundTrip: base + 85 * adults,
        },
        {
          ...template.outbound[2],
          airline: airlines[2] || airlines[0],
          fromCode,
          toCode,
          duration: parsed.oneStopDuration || template.outbound[2].duration,
          arriveNextDay: parsed.overnightOutbound,
          priceRoundTrip: Math.max(180 * adults, base - 110 * adults),
        },
      ],
      inbound: [
        {
          ...template.inbound[0],
          airline: airlines[0],
          fromCode: toCode,
          toCode: fromCode,
          duration: parsed.nonstopDuration || template.inbound[0].duration,
          priceRoundTrip: base,
        },
        {
          ...template.inbound[1],
          airline: airlines[1] || airlines[0],
          fromCode: toCode,
          toCode: fromCode,
          duration: parsed.nonstopDuration || template.inbound[1].duration,
          priceRoundTrip: base + 75 * adults,
        },
        {
          ...template.inbound[2],
          airline: airlines[2] || airlines[0],
          fromCode: toCode,
          toCode: fromCode,
          duration: parsed.oneStopDuration || template.inbound[2].duration,
          priceRoundTrip: Math.max(180 * adults, base - 95 * adults),
        },
      ],
      fareClasses: [
        { ...template.fareClasses[0], price: Math.max(180 * adults, base - 110 * adults), delta: 0 },
        { ...template.fareClasses[1], price: base, delta: 110 * adults },
        { ...template.fareClasses[2], price: base + 240 * adults, delta: 350 * adults },
      ],
    };

    await store.setCache(cacheKey, result, 0.5); // 12h cache
    return result;
  } catch (err) {
    console.warn('[bookings] Gemini flight route fallback:', (err as Error)?.message);
    return buildFallbackFlightSchedule(fromNorm, toNorm, params.datesLabel, adults);
  }
}
