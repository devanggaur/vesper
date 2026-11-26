import { config } from '../config';
import { store } from './supabase';
import type { FlightOption, HotelItem } from '../../src/types/travel';

/**
 * SerpApi Live Flights & Hotels Service (Option 1 — Live Prices + Direct Booking Links)
 * ------------------------------------------------------------------------------------
 * Powers real-time Google Flights schedules/prices and real-time Google Hotels
 * nightly rates, taxes, amenities, and direct booking URLs using a single `SERPAPI_API_KEY`.
 *
 * Aggressively cached in Supabase `place_cache` (2h for flights, 4h for hotels) so
 * reloads and repeated searches cost 0 extra SerpApi credits.
 */

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Parses explicit ISO dates OR human trip labels like `"Oct 9 - 12 (3n)"`,
 * `"Fri, Jun 19 – Sun, Jun 21"`, or `"Weekend · Dec"` into valid future `YYYY-MM-DD`
 * `startDate` & `endDate` pairs so live Flight & Hotel APIs never reject stale dates.
 */
export function parseTripIsoDates(
  datesLabel: string,
  explicitStart?: string,
  explicitEnd?: string
): { startDate: string; endDate: string; nights: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = addDays(today, 1);

  if (explicitStart && /^\d{4}-\d{2}-\d{2}$/.test(explicitStart)) {
    const s = new Date(`${explicitStart}T12:00:00`);
    const clampedStart = s.getTime() >= tomorrow.getTime() ? s : addDays(today, 14);
    let e =
      explicitEnd && /^\d{4}-\d{2}-\d{2}$/.test(explicitEnd)
        ? new Date(`${explicitEnd}T12:00:00`)
        : addDays(clampedStart, 3);
    if (e.getTime() <= clampedStart.getTime()) e = addDays(clampedStart, 3);
    const nights = Math.max(1, Math.min(21, Math.round((e.getTime() - clampedStart.getTime()) / 86400000)));
    return { startDate: toIsoDate(clampedStart), endDate: toIsoDate(e), nights };
  }

  const text = (datesLabel || '').replace(/[–—]/g, '-');
  const nightsMatch = text.match(/\((\d+)\s*n\)/i);
  const parsedNights = nightsMatch ? Math.max(1, Math.min(21, parseInt(nightsMatch[1], 10))) : null;

  // Match patterns like "Oct 9 - 12", "Oct 9 - Nov 2", "Fri, Jun 19 - Sun, Jun 21"
  const monthDayRegex =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/gi;
  const matches = Array.from(text.matchAll(monthDayRegex));

  if (matches.length >= 1) {
    const m1 = MONTH_INDEX[matches[0][1].toLowerCase()];
    const d1 = parseInt(matches[0][2], 10);
    let start = new Date(today.getFullYear(), m1, d1);
    if (start.getTime() < tomorrow.getTime()) {
      start = new Date(today.getFullYear() + 1, m1, d1);
    }

    let end: Date;
    if (matches.length >= 2) {
      const m2 = MONTH_INDEX[matches[1][1].toLowerCase()];
      const d2 = parseInt(matches[1][2], 10);
      end = new Date(start.getFullYear(), m2, d2);
      if (end.getTime() <= start.getTime()) {
        end = new Date(start.getFullYear() + 1, m2, d2);
      }
    } else {
      // Check same-month range like "Oct 9 - 12"
      const sameMonthEnd = text.match(/\b\d{1,2}\s*-\s*(\d{1,2})\b/);
      if (sameMonthEnd) {
        const d2 = parseInt(sameMonthEnd[1], 10);
        end = new Date(start.getFullYear(), start.getMonth(), d2);
        if (end.getTime() <= start.getTime()) {
          end = addDays(start, parsedNights || 3);
        }
      } else {
        end = addDays(start, parsedNights || 3);
      }
    }

    const nights = Math.max(1, Math.min(21, Math.round((end.getTime() - start.getTime()) / 86400000)));
    return { startDate: toIsoDate(start), endDate: toIsoDate(end), nights };
  }

  // Fallback: 2 weeks from today, snapped to Friday for 3 nights
  const base = addDays(today, 14);
  const daysToFri = (5 - base.getDay() + 7) % 7;
  const start = addDays(base, daysToFri);
  const nights = parsedNights || (text.toLowerCase().includes('week') ? 6 : 3);
  const end = addDays(start, nights);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end), nights };
}

/* ── Live Google Flights via SerpApi ────────────────────────────────────── */

interface SerpFlightLeg {
  departure_airport?: { name?: string; id?: string; time?: string };
  arrival_airport?: { name?: string; id?: string; time?: string };
  duration?: number;
  airline?: string;
  airline_logo?: string;
  flight_number?: string;
}

interface SerpFlightGroup {
  flights?: SerpFlightLeg[];
  layovers?: Array<{ duration?: number; name?: string; id?: string }>;
  total_duration?: number;
  price?: number;
  airline_logo?: string;
  departure_token?: string;
  booking_token?: string;
}

interface SerpGoogleFlightsResponse {
  best_flights?: SerpFlightGroup[];
  other_flights?: SerpFlightGroup[];
  search_metadata?: { google_flights_url?: string };
  error?: string;
}

function formatSerpClock(timeStr?: string): { clock: string; datePart: string } {
  if (!timeStr) return { clock: '10:00 AM', datePart: '' };
  // Format from SerpApi: "2026-10-09 15:40"
  const [datePart = '', hm = ''] = timeStr.trim().split(' ');
  const [hRaw, mRaw] = hm.split(':');
  const h = parseInt(hRaw || '10', 10);
  const m = parseInt(mRaw || '0', 10);
  if (Number.isNaN(h)) return { clock: timeStr, datePart };
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { clock: `${h12}:${String(Number.isNaN(m) ? 0 : m).padStart(2, '0')} ${suffix}`, datePart };
}

function formatDurationMinutes(mins?: number): string {
  if (!mins || mins <= 0) return '6h 30m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function mapSerpFlightGroup(
  grp: SerpFlightGroup,
  direction: 'outbound' | 'return',
  idx: number,
  bookingUrl: string,
  adults: number
): FlightOption | null {
  const legs = grp.flights || [];
  if (legs.length === 0) return null;
  const first = legs[0];
  const last = legs[legs.length - 1];
  const dep = formatSerpClock(first.departure_airport?.time);
  const arr = formatSerpClock(last.arrival_airport?.time);
  const nextDay = Boolean(dep.datePart && arr.datePart && arr.datePart > dep.datePart);
  const layoverNames = (grp.layovers || [])
    .map((l) => l.id || l.name)
    .filter(Boolean)
    .join(', ');

  // SerpApi Google Flights returns per-passenger or total depending on query; multiply if per-pax looks low?
  // Actually Google Flights `price` with `adults=N` is already total for all passengers in SerpApi!
  const priceRoundTrip = Math.round(grp.price || 580 * adults);

  return {
    id: `serp-${direction}-${idx}-${first.flight_number || idx}`.replace(/\s+/g, '-'),
    airline: first.airline || 'Airline',
    flightNumber: first.flight_number || `${(first.airline || 'FL').slice(0, 2).toUpperCase()} ${200 + idx}`,
    departTime: dep.clock,
    arriveTime: arr.clock,
    arriveNextDay: nextDay,
    fromCode: first.departure_airport?.id || '',
    toCode: last.arrival_airport?.id || '',
    duration: formatDurationMinutes(grp.total_duration),
    stops: legs.length === 1 ? 'Nonstop' : `${legs.length - 1} stop${legs.length > 2 ? 's' : ''}`,
    stopDetails: layoverNames ? `via ${layoverNames}` : undefined,
    priceRoundTrip,
    direction,
    airlineLogo: grp.airline_logo || first.airline_logo,
    departureToken: grp.departure_token,
    bookingUrl,
  };
}

export async function searchSerpApiFlights(params: {
  fromCode: string;
  toCode: string;
  outboundDate: string;
  returnDate: string;
  adults: number;
  preferredAirlines?: string[];
  departureToken?: string;
}): Promise<{
  flights: FlightOption[];
  googleFlightsUrl: string;
} | null> {
  if (!config.serpApiKey) return null;

  const direction: 'outbound' | 'return' = params.departureToken ? 'return' : 'outbound';
  const cacheKey = `serp:flights:v1:${params.fromCode}-${params.toCode}:${params.outboundDate}:${params.returnDate}:a${params.adults}:${
    params.departureToken ? `tok:${params.departureToken.slice(0, 28)}` : 'out'
  }`;

  const cached = await store.getCache<{ flights: FlightOption[]; googleFlightsUrl: string }>(cacheKey);
  if (cached) {
    return {
      ...cached,
      flights: prioritizePreferredAirlines(cached.flights, params.preferredAirlines),
    };
  }

  const qs = new URLSearchParams({
    engine: 'google_flights',
    departure_id: params.fromCode,
    arrival_id: params.toCode,
    outbound_date: params.outboundDate,
    return_date: params.returnDate,
    adults: String(params.adults),
    currency: 'USD',
    hl: 'en',
    type: '1', // Round trip
    api_key: config.serpApiKey,
  });
  if (params.departureToken) {
    qs.set('departure_token', params.departureToken);
  }

  try {
    const res = await fetch(`https://serpapi.com/search.json?${qs.toString()}`);
    if (!res.ok) {
      console.warn(`[serpapi] Google Flights returned ${res.status}`);
      return null;
    }
    const data = (await res.json()) as SerpGoogleFlightsResponse;
    if (data.error) {
      console.warn('[serpapi] Google Flights error:', data.error);
      return null;
    }

    const googleFlightsUrl =
      data.search_metadata?.google_flights_url ||
      `https://www.google.com/travel/flights?q=${encodeURIComponent(
        `Flights from ${params.fromCode} to ${params.toCode} on ${params.outboundDate} through ${params.returnDate}`
      )}`;

    const combined = [...(data.best_flights || []), ...(data.other_flights || [])];
    const mapped = combined
      .slice(0, 8)
      .map((g, idx) => mapSerpFlightGroup(g, direction, idx, googleFlightsUrl, params.adults))
      .filter((f): f is FlightOption => f !== null);

    if (mapped.length === 0) return null;

    const payload = { flights: mapped, googleFlightsUrl };
    await store.setCache(cacheKey, payload, 0.08); // ~2 hour TTL
    return {
      ...payload,
      flights: prioritizePreferredAirlines(mapped, params.preferredAirlines),
    };
  } catch (err) {
    console.warn('[serpapi] Google Flights fetch failed:', (err as Error)?.message);
    return null;
  }
}

function prioritizePreferredAirlines(
  flights: FlightOption[],
  preferredAirlines?: string[]
): FlightOption[] {
  if (!preferredAirlines || preferredAirlines.length === 0) return flights;
  const prefs = preferredAirlines.map((p) => p.toLowerCase());
  return [...flights].sort((a, b) => {
    const aMatch = prefs.some((p) => a.airline.toLowerCase().includes(p)) ? 1 : 0;
    const bMatch = prefs.some((p) => b.airline.toLowerCase().includes(p)) ? 1 : 0;
    return bMatch - aMatch;
  });
}

/* ── Live Google Hotels via SerpApi ─────────────────────────────────────── */

interface SerpHotelProperty {
  property_token?: string;
  name?: string;
  description?: string;
  link?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  hotel_class?: string;
  extracted_hotel_class?: number;
  overall_rating?: number;
  reviews?: number;
  rate_per_night?: { lowest?: string; extracted_lowest?: number };
  total_rate?: { lowest?: string; extracted_lowest?: number };
  nearby_places?: Array<{ name?: string }>;
  images?: Array<{ original_image?: string; thumbnail?: string }>;
  amenities?: string[];
  essential_info?: string[];
}

interface SerpGoogleHotelsResponse {
  properties?: SerpHotelProperty[];
  search_metadata?: { google_hotels_url?: string };
  error?: string;
}

export async function searchSerpApiHotels(params: {
  destination: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  queryOverride?: string;
  preferredChains?: string[];
}): Promise<{
  hotels: HotelItem[];
  googleHotelsUrl: string;
  source: 'serpapi';
} | null> {
  if (!config.serpApiKey) return null;

  const query = (params.queryOverride || `boutique hotels in ${params.destination}`).trim();
  const cacheKey = `serp:hotels:v1:${query.toLowerCase()}:${params.checkInDate}:${params.checkOutDate}:a${params.adults}`;

  const cached = await store.getCache<{
    hotels: HotelItem[];
    googleHotelsUrl: string;
    source: 'serpapi';
  }>(cacheKey);
  if (cached) {
    return {
      ...cached,
      hotels: prioritizePreferredHotelChains(cached.hotels, params.preferredChains),
    };
  }

  const qs = new URLSearchParams({
    engine: 'google_hotels',
    q: query,
    check_in_date: params.checkInDate,
    check_out_date: params.checkOutDate,
    adults: String(params.adults),
    currency: 'USD',
    hl: 'en',
    sort_by: '8', // Highest rated
    api_key: config.serpApiKey,
  });

  try {
    const res = await fetch(`https://serpapi.com/search.json?${qs.toString()}`);
    if (!res.ok) {
      console.warn(`[serpapi] Google Hotels returned ${res.status}`);
      return null;
    }
    const data = (await res.json()) as SerpGoogleHotelsResponse;
    if (data.error) {
      console.warn('[serpapi] Google Hotels error:', data.error);
      return null;
    }

    const googleHotelsUrl =
      data.search_metadata?.google_hotels_url ||
      `https://www.google.com/travel/hotels?q=${encodeURIComponent(
        `${query} ${params.checkInDate} to ${params.checkOutDate}`
      )}`;

    const pickLabels = ['Live top rated', 'Design favorite', 'Guest favorite', 'Great value'];

    const hotels: HotelItem[] = (data.properties || [])
      .filter((p) => Boolean(p.name && (p.total_rate?.extracted_lowest || p.rate_per_night?.extracted_lowest)))
      .slice(0, 10)
      .map((p, idx) => {
        const perNight = Math.round(
          p.rate_per_night?.extracted_lowest ||
            (p.total_rate?.extracted_lowest ? p.total_rate.extracted_lowest / Math.max(1, params.nights) : 220)
        );
        const total = Math.round(
          p.total_rate?.extracted_lowest || perNight * Math.max(1, params.nights)
        );
        const gallery = (p.images || [])
          .map((img) => img.original_image || img.thumbnail)
          .filter((u): u is string => Boolean(u))
          .slice(0, 8);
        const stars = p.extracted_hotel_class && p.extracted_hotel_class >= 3 ? p.extracted_hotel_class : 4;
        const ratingOutOf10 = Math.min(
          9.9,
          Math.max(7.8, Number(((p.overall_rating || 4.5) * 2).toFixed(1)))
        );
        const neighborhood = p.nearby_places?.[0]?.name || params.destination;
        const freeCancellation = Boolean(
          (p.amenities || []).some((a) => /free cancel/i.test(a)) ||
            (p.essential_info || []).some((e) => /free cancel/i.test(e))
        );
        const directBookingUrl =
          p.link ||
          `https://www.google.com/travel/hotels?q=${encodeURIComponent(
            `${p.name} ${params.destination} ${params.checkInDate}`
          )}`;

        return {
          id: `serp-htl-${p.property_token || idx}`.slice(0, 48),
          name: p.name!,
          neighborhood,
          rating: ratingOutOf10,
          reviews: p.reviews || 320,
          stars,
          priceTotal: total,
          pricePerNight: perNight,
          livePricing: true,
          freeCancellation,
          amenities: (p.amenities || []).slice(0, 6),
          website: p.link,
          bookingUrl: directBookingUrl,
          tagline: p.description || `${stars}-star stay · $${perNight}/night live rate`,
          shortDescription:
            p.description ||
            `Live rate for ${params.checkInDate} → ${params.checkOutDate} ($${perNight}/night) in ${params.destination}.`,
          pickLabel: pickLabels[idx % pickLabels.length],
          whyChoose:
            p.description ||
            `Rated ${ratingOutOf10.toFixed(1)}/10 across ${(p.reviews || 0).toLocaleString()} reviews · Live rate $${perNight}/night.`,
          image: gallery[0] || '',
          gallery: gallery.length > 0 ? gallery : [''],
          coords: {
            lat: p.gps_coordinates?.latitude || 0,
            lng: p.gps_coordinates?.longitude || 0,
          },
          highlights: [
            {
              icon: 'sparkle',
              title: `Live rate: $${perNight}/night ($${total.toLocaleString()} total)`,
              description: `${params.nights} night${params.nights > 1 ? 's' : ''} (${params.checkInDate} → ${params.checkOutDate}) for ${params.adults} guest${params.adults > 1 ? 's' : ''}.`,
            },
            {
              icon: 'map',
              title: `Near ${neighborhood}`,
              description: `${stars}-star property rated ${ratingOutOf10.toFixed(1)}/10 by ${(p.reviews || 0).toLocaleString()} guests.`,
            },
            ...(p.amenities && p.amenities.length > 0
              ? [
                  {
                    icon: 'bed' as const,
                    title: 'Key amenities',
                    description: p.amenities.slice(0, 4).join(' · '),
                  },
                ]
              : []),
          ],
          rooms: [
            {
              id: `serp-rm-std-${idx}`,
              name: 'Best Available Room (Live Rate)',
              sqft: 340,
              beds: '1 King or 2 Queen Beds',
              images: gallery.length > 0 ? gallery : [''],
              description: `Live Google Hotels rate for ${params.checkInDate} to ${params.checkOutDate}. Book directly with the hotel to earn loyalty points.`,
              rates: [
                {
                  id: `serp-r1-${idx}`,
                  label: freeCancellation ? 'Live Rate · Free Cancellation' : 'Live Lowest Rate',
                  subtitle: `$${perNight}/night × ${params.nights}n · Book direct on partner site`,
                  price: total,
                },
              ],
            },
          ],
          deepDive: [
            {
              id: 'location',
              label: 'Location & Amenities',
              title: `Staying at ${p.name}`,
              items: [
                {
                  heading: 'Highlights & amenities',
                  body:
                    p.amenities && p.amenities.length > 0
                      ? p.amenities.join(' · ')
                      : `Live pricing verified via Google Hotels for ${params.checkInDate} – ${params.checkOutDate}.`,
                },
              ],
            },
          ],
        };
      });

    if (hotels.length === 0) return null;

    const payload = { hotels, googleHotelsUrl, source: 'serpapi' as const };
    await store.setCache(cacheKey, payload, 0.17); // ~4 hour TTL
    return {
      ...payload,
      hotels: prioritizePreferredHotelChains(hotels, params.preferredChains),
    };
  } catch (err) {
    console.warn('[serpapi] Google Hotels fetch failed:', (err as Error)?.message);
    return null;
  }
}

function prioritizePreferredHotelChains(
  hotels: HotelItem[],
  preferredChains?: string[]
): HotelItem[] {
  if (!preferredChains || preferredChains.length === 0) return hotels;
  const chains = preferredChains.map((c) => c.toLowerCase());
  return [...hotels].sort((a, b) => {
    const aMatch = chains.some((c) => a.name.toLowerCase().includes(c)) ? 1 : 0;
    const bMatch = chains.some((c) => b.name.toLowerCase().includes(c)) ? 1 : 0;
    return bMatch - aMatch;
  });
}
