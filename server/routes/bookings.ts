import { Hono } from 'hono';
import { z } from 'zod';
import {
  buildActivityBookingUrl,
  buildGoogleFlightsUrl,
  buildGoogleHotelsUrl,
  searchFlightsForRoute,
} from '../services/bookings';

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
    })
  ),
});

/**
 * POST /api/bookings/handoff-links
 * Generates pre-filled direct provider checkout URLs (Google Flights, Google Hotels, Experiences)
 * so MVP users can complete live bookings directly with airlines & hotels at $0 Vesper fee.
 */
bookingsRoutes.post('/handoff-links', async (c) => {
  const body = handoffSchema.parse(await c.req.json());
  const links: Record<string, { label: string; url: string }> = {};

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
    } else if (item.type === 'activity') {
      links[item.id] = {
        label: 'Reserve experience',
        url: buildActivityBookingUrl(item.title, body.destination),
      };
    }
  }

  return c.json({ links });
});
