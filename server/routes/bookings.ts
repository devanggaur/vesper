import { Hono } from 'hono';
import { z } from 'zod';
import {
  buildActivityBookingUrl,
  buildGoogleFlightsUrl,
  buildGoogleHotelsUrl,
  searchFlightsForRoute,
} from '../services/bookings';
import { searchViatorOffersCached } from '../services/viator';

export const bookingsRoutes = new Hono();

const flightSearchSchema = z.object({
  fromCity: z.string().min(1).default('San Francisco'),
  toCity: z.string().min(1),
  datesLabel: z.string().default('Weekend getaway'),
  adults: z.number().int().min(1).max(8).default(2),
  preferredAirlines: z.array(z.string()).max(6).optional(),
});

/**
 * POST /api/bookings/flights
 * Lazy-loaded flight search endpoint supporting any origin/destination pair worldwide.
 * Uses Amadeus GDS when configured, or Gemini-grounded route schedules cached in Supabase.
 */
bookingsRoutes.post('/flights', async (c) => {
  const body = flightSearchSchema.parse(await c.req.json());
  const result = await searchFlightsForRoute(body);
  return c.json(result);
});

const handoffSchema = z.object({
  destination: z.string().default(''),
  datesLabel: z.string().default(''),
  items: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['activity', 'place', 'hotel', 'flight']),
      title: z.string(),
      fromCode: z.string().optional(),
      toCode: z.string().optional(),
      bookingType: z.enum(['walk_in', 'timed_ticket', 'guided_tour', 'reservation']).optional(),
      officialUrl: z.string().optional(),
    })
  ),
});

/**
 * POST /api/bookings/handoff-links
 * Generates pre-filled direct provider checkout URLs (Google Flights, Google Hotels,
 * Official Box Office + Viator/GetYourGuide Affiliate links) at $0 Vesper fee.
 */
bookingsRoutes.post('/handoff-links', async (c) => {
  const body = handoffSchema.parse(await c.req.json());
  const links: Record<
    string,
    { label: string; url: string; secondaryLabel?: string; secondaryUrl?: string }
  > = {};

  for (const item of body.items) {
    if (item.type === 'flight') {
      links[item.id] = {
        label: 'Book on Google Flights',
        url: buildGoogleFlightsUrl(
          item.fromCode || 'SFO',
          item.toCode || body.destination,
          body.datesLabel
        ),
      };
    } else if (item.type === 'hotel') {
      links[item.id] = {
        label: 'Book on Google Hotels',
        url: buildGoogleHotelsUrl(item.title, body.destination, body.datesLabel),
      };
    } else {
      const bookingType = item.bookingType || (item.type === 'activity' ? 'guided_tour' : 'timed_ticket');
      const partner = buildActivityBookingUrl(item.title, body.destination, bookingType);
      const hasOfficial =
        Boolean(item.officialUrl) &&
        /^https?:\/\//i.test(item.officialUrl!) &&
        !item.officialUrl!.includes('google.com/maps/place');

      if (hasOfficial) {
        links[item.id] = {
          label: bookingType === 'reservation' ? 'Official restaurant site' : 'Official box office',
          url: item.officialUrl!,
          secondaryLabel: partner.label,
          secondaryUrl: partner.url,
        };
      } else {
        links[item.id] = {
          label: partner.label,
          url: partner.url,
        };
      }
    }
  }

  return c.json({ links });
});

const ticketOffersSchema = z.object({
  venueName: z.string().min(1),
  destination: z.string().default(''),
  limit: z.number().int().min(1).max(6).default(3),
});

/**
 * POST /api/bookings/ticket-offers
 * Queries Viator Partner API v2 (using server-only `VIATOR_API_KEY`, cached 12h) for live
 * ticket prices & direct affiliate product URLs, gracefully returning `[]` if unavailable.
 */
bookingsRoutes.post('/ticket-offers', async (c) => {
  const body = ticketOffersSchema.parse(await c.req.json());
  const offers = await searchViatorOffersCached(body.venueName, body.destination, body.limit);
  return c.json({ offers });
});
