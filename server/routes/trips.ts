import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { store } from '../services/supabase';
import {
  buildDiscoverBlueprint,
  generateCoPilotTurn,
  ItineraryMutation,
  organizeStopsWithGemini,
  parseTripPrompt,
  streamCoPilotTurn,
} from '../services/gemini';
import {
  buildPhotoProxyUrl,
  GooglePlaceLite,
  searchPlacesCached,
} from '../services/places';
import type {
  ActivityItem,
  ChatMessage,
  DiscoverSection,
  HotelItem,
  PlaceItem,
  TripSavedItem,
} from '../../src/types/travel';

export const tripsRoutes = new Hono();

/* ── Helpers converting real Google Places results into Vesper UI models ── */

function toPlaceItem(
  gp: GooglePlaceLite,
  section: PlaceItem['section'],
  destination: string,
  dayKey: string,
  idx: number
): PlaceItem {
  const gallery = gp.photoNames.map((n) => buildPhotoProxyUrl(n, 900));
  const fallbackImg = gallery[0] || '';
  const defaultHours =
    gp.weekdayDescriptions && gp.weekdayDescriptions.length > 0
      ? gp.weekdayDescriptions.slice(0, 3).join(' · ')
      : 'Open daily · Check official hours before visiting';
  const timeDefaults = ['10:00 AM', '12:30 PM', '2:30 PM', '5:00 PM', '7:30 PM'];

  return {
    id: `gp-${gp.id}`,
    name: gp.name,
    category: gp.primaryType,
    section,
    rating: gp.rating,
    reviews: gp.reviews,
    priceTier: gp.priceTier,
    shortDescription:
      gp.editorialSummary || `${gp.primaryType} in ${gp.neighborhood}, ${destination}.`,
    editorialSummary:
      gp.editorialSummary ||
      `Highly rated ${gp.primaryType.toLowerCase()} in ${gp.neighborhood} (${gp.rating.toFixed(
        1
      )}★ from ${gp.reviews.toLocaleString()} reviews). Located at ${gp.formattedAddress}.`,
    image: fallbackImg,
    gallery: gallery.length > 0 ? gallery : [fallbackImg],
    photoCredit: 'Google Places',
    coords: { lat: gp.lat, lng: gp.lng },
    hours: { openSchedule: defaultHours },
    details: {
      goodForChildren: section !== 'food',
      restroom: true,
      accessibility: 'Check venue entry details on official site',
    },
    website: gp.website || `https://www.google.com/maps/place/?q=place_id:${gp.id}`,
    phone: gp.phone || 'See website',
    neighborhood: gp.neighborhood,
    suggestedDay: dayKey,
    suggestedTime: section === 'food' ? (idx % 2 === 0 ? '1:30 PM' : '7:30 PM') : timeDefaults[idx % timeDefaults.length],
  };
}

function toActivityItem(gp: GooglePlaceLite, destination: string, idx: number): ActivityItem {
  const gallery = gp.photoNames.map((n) => buildPhotoProxyUrl(n, 900));
  const basePrice = 38 + (idx % 4) * 18;

  return {
    id: `act-${gp.id}`,
    title: gp.name,
    shortTitle: gp.name,
    rating: gp.rating,
    reviews: gp.reviews,
    duration: idx % 2 === 0 ? '2.5 hours' : '3 hours',
    pricePerPerson: basePrice,
    tagline: gp.editorialSummary || `Top-rated ${gp.primaryType.toLowerCase()} experience in ${gp.neighborhood}.`,
    description: gp.editorialSummary || `Explore ${gp.name} in ${gp.neighborhood}, ${destination}.`,
    aboutHeading: `Experience ${gp.name}`,
    aboutBody: [
      gp.editorialSummary ||
        `Discover one of ${destination}’s highest-rated highlights in ${gp.neighborhood}, backed by ${gp.reviews.toLocaleString()} traveler reviews.`,
      `Address: ${gp.formattedAddress}.`,
    ],
    highlights: [
      `Located in ${gp.neighborhood}, ${destination}`,
      `Rated ${gp.rating.toFixed(1)}★ by ${gp.reviews.toLocaleString()} travelers`,
      'Instant timeline scheduling with live neighborhood transit estimates',
    ],
    image: gallery[0] || '',
    gallery: gallery.length > 0 ? gallery : [''],
    coords: { lat: gp.lat, lng: gp.lng },
    slots: [
      { id: `${gp.id}-am`, time: '9:30 AM', endTime: '12:00 PM', spotsLeft: 6, pricePerPerson: basePrice },
      { id: `${gp.id}-pm`, time: '2:00 PM', endTime: '4:30 PM', spotsLeft: 4, pricePerPerson: basePrice + 6 },
    ],
    category: gp.primaryType,
  };
}

function toHotelItem(gp: GooglePlaceLite, destination: string, idx: number): HotelItem {
  const gallery = gp.photoNames.map((n) => buildPhotoProxyUrl(n, 900));
  const tierMultiplier = gp.priceTier === '$$$$' ? 2.1 : gp.priceTier === '$$$' ? 1.55 : 1.05;
  const twoNightTotal = Math.round((340 * tierMultiplier + idx * 34) / 5) * 5;
  const scoreTen = Math.min(9.8, Math.max(8.2, Number((gp.rating * 1.94).toFixed(1))));
  const pickLabels = ['Best overall', 'Design favorite', 'Quiet sanctuary', 'Great value'];

  return {
    id: `htl-${gp.id}`,
    name: gp.name,
    neighborhood: gp.neighborhood,
    rating: scoreTen,
    reviews: gp.reviews,
    stars: gp.priceTier === '$$$$' ? 5 : 4,
    priceTotal: twoNightTotal,
    tagline: gp.editorialSummary || `${gp.neighborhood} · Rated ${gp.rating.toFixed(1)}★`,
    shortDescription:
      gp.editorialSummary ||
      `Well-reviewed stay in ${gp.neighborhood}, ${destination} with easy access to your daily route.`,
    pickLabel: pickLabels[idx % pickLabels.length],
    whyChoose:
      gp.editorialSummary ||
      `Strong ${gp.rating.toFixed(1)}★ guest rating (${gp.reviews.toLocaleString()} reviews) in ${gp.neighborhood}, well positioned for your itinerary.`,
    image: gallery[0] || '',
    gallery: gallery.length > 0 ? gallery : [''],
    coords: { lat: gp.lat, lng: gp.lng },
    highlights: [
      { icon: 'map', title: `Prime ${gp.neighborhood} base`, description: gp.formattedAddress },
      { icon: 'sparkle', title: `${scoreTen.toFixed(1)}/10 traveler score`, description: `Based on ${gp.reviews.toLocaleString()} verified guest reviews.` },
      { icon: 'bed', title: 'Thoughtful rooms & suites', description: 'Flexible cancellation rates available.' },
      { icon: 'tree', title: 'Curated by Vesper', description: `Short transit distance to top ${destination} stops.` },
    ],
    rooms: [
      {
        id: `${gp.id}-std`,
        name: 'Signature King Room',
        sqft: 340,
        beds: '1 King Bed',
        images: gallery.length > 0 ? gallery : [''],
        description: `Quiet, light-filled room at ${gp.name} in ${gp.neighborhood}.`,
        rates: [
          {
            id: `${gp.id}-r1`,
            label: 'Standard Rate',
            subtitle: 'Taxes & fees included',
            price: twoNightTotal,
          },
          {
            id: `${gp.id}-r2`,
            label: 'Free Cancellation + Breakfast',
            subtitle: 'Cancel free up to 48h before check-in',
            price: twoNightTotal + 68,
            delta: '+$68',
          },
        ],
      },
      {
        id: `${gp.id}-suite`,
        name: 'Junior Terrace Suite',
        sqft: 510,
        beds: '1 King Bed + Lounge',
        images: gallery.length > 0 ? gallery.slice().reverse() : [''],
        description: 'Expanded corner layout with seating nook and courtyard light.',
        rates: [
          {
            id: `${gp.id}-r3`,
            label: 'Suite Rate (Flexible)',
            subtitle: 'Includes late checkout & taxes',
            price: twoNightTotal + 165,
            delta: '+$165',
          },
        ],
      },
    ],
    deepDive: [
      {
        id: 'location',
        label: 'Location',
        title: `Staying in ${gp.neighborhood}`,
        items: [
          {
            heading: 'Address & neighborhood access',
            body: `${gp.formattedAddress}. Convenient jumping-off point for your ${destination} itinerary.`,
          },
        ],
      },
      {
        id: 'noise',
        label: 'Noise & Privacy',
        title: 'Noise & Sleep Quality',
        items: [
          {
            heading: 'Room request tip',
            body: `Ask ${gp.name} for an upper-floor or interior courtyard room when booking if you prefer extra-quiet nights.`,
          },
        ],
      },
    ],
  };
}

/* ── Route Handlers ─────────────────────────────────────────────────────── */

/** GET /api/trips — Lists recent persisted trips (scoped to signed-in user when authenticated). */
tripsRoutes.get('/', async (c) => {
  const user = await store.verifyAccessToken(c.req.header('Authorization'));
  const trips = await store.listTrips(15, user?.id);
  return c.json({
    trips: trips.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
      destination: t.destination,
      country: t.country,
      datesLabel: t.dates_label,
      travelers: t.travelers,
      heroImage: t.hero_image,
      updatedAt: t.updated_at,
    })),
  });
});

/** GET /api/trips/slug/:slug — Loads a shared trip by its human-readable `/t/:slug` URL. */
tripsRoutes.get('/slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  const trip = await store.getTripBySlug(slug);
  if (!trip) return c.json({ error: 'Shared trip not found' }, 404);

  const [items, messages] = await Promise.all([
    store.getTripItems(trip.id),
    store.getMessages(trip.id),
  ]);

  return c.json({
    trip: {
      id: trip.id,
      slug: trip.slug,
      title: trip.title,
      destination: trip.destination,
      country: trip.country,
      prompt: trip.prompt,
      datesLabel: trip.dates_label,
      days: trip.day_labels,
      center: { lat: trip.center_lat, lng: trip.center_lng },
      heroImage: trip.hero_image,
      travelers: trip.travelers,
      tasteProfile: trip.taste_profile,
      catalog: trip.catalog,
    },
    items,
    messages,
  });
});

/** POST /api/trips/:id/claim — Associates an anonymous guest trip with the newly signed-in user. */
tripsRoutes.post('/:id/claim', async (c) => {
  const user = await store.verifyAccessToken(c.req.header('Authorization'));
  if (!user) return c.json({ error: 'Authentication required' }, 401);
  const claimed = await store.claimTrip(c.req.param('id'), user.id);
  return c.json({ ok: claimed });
});

/** GET /api/trips/:id — Loads a full trip with cached catalog, items, and chat history ($0 API cost). */
tripsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);

  const [items, messages] = await Promise.all([
    store.getTripItems(id),
    store.getMessages(id),
  ]);

  return c.json({
    trip: {
      id: trip.id,
      slug: trip.slug,
      title: trip.title,
      destination: trip.destination,
      country: trip.country,
      prompt: trip.prompt,
      datesLabel: trip.dates_label,
      days: trip.day_labels,
      center: { lat: trip.center_lat, lng: trip.center_lng },
      heroImage: trip.hero_image,
      travelers: trip.travelers,
      tasteProfile: trip.taste_profile,
      catalog: trip.catalog,
    },
    items,
    messages,
  });
});

const createTripSchema = z.object({
  prompt: z.string().min(1),
  datesLabel: z.string().default('Weekend getaway'),
  travelers: z.string().default('2 adults'),
});

/**
 * POST /api/trips
 * Fast-path trip creation called the moment the user submits the Horizon composer:
 * 1. Gemini parses the destination, title, day labels & search queries.
 * 2. Google Places fetches the destination center & hero landmark photo (cached).
 * 3. Persists to Supabase `trips` + initial Co-Pilot welcome message.
 */
tripsRoutes.post('/', async (c) => {
  const body = createTripSchema.parse(await c.req.json());
  const user = await store.verifyAccessToken(c.req.header('Authorization'));

  const parsed = await parseTripPrompt(body.prompt, body.datesLabel, body.travelers);

  // Resolve real destination coordinates & hero photo via cached Google Places lookup
  const heroPlaces = await searchPlacesCached(parsed.searchQueries.hero, 2, parsed.destination);
  const anchor = heroPlaces[0];
  const center = anchor ? { lat: anchor.lat, lng: anchor.lng } : { lat: 19.426, lng: -99.172 };
  const heroImage = anchor?.photoNames[0] ? buildPhotoProxyUrl(anchor.photoNames[0], 1400) : '';

  const trip = await store.createTrip(
    {
      title: parsed.tripTitle,
      destination: parsed.destination,
      country: parsed.country,
      prompt: body.prompt,
      dates_label: body.datesLabel,
      day_labels: parsed.days,
      center_lat: center.lat,
      center_lng: center.lng,
      hero_image: heroImage,
      travelers: body.travelers,
      taste_profile: null,
      catalog: null,
      last_interaction_id: null,
    },
    user?.id
  );

  const initialMessages: ChatMessage[] = [
    { id: 'init-u', role: 'user', text: body.prompt },
    {
      id: 'init-a',
      role: 'assistant',
      blocks: [{ type: 'text', content: parsed.welcomeSummary }],
    },
  ];
  await store.appendMessages(trip.id, initialMessages);

  return c.json({
    trip: {
      id: trip.id,
      slug: trip.slug,
      title: trip.title,
      destination: trip.destination,
      country: trip.country,
      prompt: trip.prompt,
      datesLabel: trip.dates_label,
      days: trip.day_labels,
      center,
      heroImage,
      travelers: trip.travelers,
    },
    messages: initialMessages,
  });
});

const composeSchema = z.object({
  travelers: z.string(),
  vibes: z.array(z.string()).min(1),
  pace: z.enum(['Unhurried', 'Balanced', 'Packed']),
  splurge: z.enum(['Smart', 'Elevated', 'Iconic']),
});

/**
 * POST /api/trips/:id/compose
 * Called when the user submits the 5-Second TasteCard:
 * 1. Gemini generates tailored section queries & editorial intros for this destination + taste.
 * 2. Parallel cached Google Places (New) Text Searches fetch real activities, places, and boutique stays.
 * 3. Caches the full catalog on `trips.catalog` in Supabase so reloads cost $0.
 */
tripsRoutes.post('/:id/compose', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);

  const taste = composeSchema.parse(await c.req.json());

  const blueprint = await buildDiscoverBlueprint(
    trip.destination,
    trip.country,
    trip.dates_label,
    taste
  );

  // Run Google Places Text Searches in parallel (all 14-day cached in Supabase `place_cache`)
  const [rawActivities, rawHotels, ...rawSections] = await Promise.all([
    searchPlacesCached(blueprint.activitiesQuery, 5, trip.destination),
    searchPlacesCached(blueprint.hotelsQuery, 6, trip.destination),
    ...blueprint.sections.map((sec) => searchPlacesCached(sec.placesQuery, 6, trip.destination)),
  ]);

  const seenPlaceIds = new Set<string>();
  const discoverSections: DiscoverSection[] = blueprint.sections.map((sec, sIdx) => {
    const dayKey = trip.day_labels[sIdx % trip.day_labels.length]?.key || 'Day 1';
    const rawList = rawSections[sIdx] || [];
    const places: PlaceItem[] = [];
    for (const gp of rawList) {
      if (seenPlaceIds.has(gp.id)) continue;
      seenPlaceIds.add(gp.id);
      places.push(toPlaceItem(gp, sec.key, trip.destination, dayKey, places.length));
    }
    return {
      key: sec.key,
      title: sec.title,
      intro: sec.intro,
      places,
    };
  });

  const allPlaces = discoverSections.flatMap((s) => s.places);
  const activities: ActivityItem[] = rawActivities.map((gp, idx) =>
    toActivityItem(gp, trip.destination, idx)
  );
  const hotels: HotelItem[] = rawHotels.map((gp, idx) =>
    toHotelItem(gp, trip.destination, idx)
  );

  // Refine map center to the mean of discovered places if available
  let center = { lat: trip.center_lat, lng: trip.center_lng };
  if (allPlaces.length > 0) {
    const avgLat = allPlaces.reduce((s, p) => s + p.coords.lat, 0) / allPlaces.length;
    const avgLng = allPlaces.reduce((s, p) => s + p.coords.lng, 0) / allPlaces.length;
    center = { lat: avgLat, lng: avgLng };
  }

  const heroImage = trip.hero_image || allPlaces[0]?.image || activities[0]?.image || '';

  const catalog = {
    activitiesTitle: blueprint.activitiesTitle,
    activities,
    places: allPlaces,
    sections: discoverSections,
    hotels,
  };

  await store.updateTrip(trip.id, {
    taste_profile: taste,
    catalog,
    center_lat: center.lat,
    center_lng: center.lng,
    hero_image: heroImage,
  });

  const assistantMsg: ChatMessage = {
    id: `taste-a-${Date.now()}`,
    role: 'assistant',
    blocks: [
      { type: 'text', content: blueprint.copilotMessage },
      { type: 'suggestions', items: blueprint.suggestions.slice(0, 3) },
    ],
  };

  await store.appendMessages(trip.id, [
    {
      id: `taste-u-${Date.now()}`,
      role: 'user',
      text: `${taste.travelers} · ${taste.vibes.join(', ')} · ${taste.pace} pace · ${taste.splurge} style`,
    },
    assistantMsg,
  ]);

  return c.json({
    catalog,
    center,
    heroImage,
    assistantMessage: assistantMsg,
  });
});

/** PUT /api/trips/:id/items — Persists saved places, activities, hotels, and flights. */
tripsRoutes.put('/:id/items', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as { items: TripSavedItem[] };
  const saved = await store.replaceTripItems(id, body.items || []);
  return c.json({ items: saved });
});

/**
 * POST /api/trips/:id/organize
 * Uses Gemini to cluster the user's saved stops spatially across days & chronological times.
 */
tripsRoutes.post('/:id/organize', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);

  const body = (await c.req.json()) as { items: TripSavedItem[] };
  const workingItems = body.items || [];

  const result = await organizeStopsWithGemini(trip.destination, trip.day_labels, workingItems);

  const assignmentMap = new Map(result.assignments.map((a) => [a.itemId, a]));
  const updatedItems: TripSavedItem[] = workingItems.map((item) => {
    const hit = assignmentMap.get(item.id);
    if (!hit) return item;
    return { ...item, day: hit.day, time: hit.time };
  });

  await store.replaceTripItems(trip.id, updatedItems);

  const assistantMsg: ChatMessage = {
    id: `org-done-${Date.now()}`,
    role: 'assistant',
    blocks: [
      {
        type: 'bullets',
        intro: result.summaryIntro,
        items: result.summaryBullets,
        outro: result.summaryOutro,
      },
      { type: 'suggestions', items: result.suggestions.slice(0, 3) },
    ],
  };
  await store.appendMessages(trip.id, [assistantMsg]);

  return c.json({
    items: updatedItems,
    assistantMessage: assistantMsg,
  });
});

/**
 * POST /api/trips/:id/chat
 * Context-aware Vesper Co-Pilot endpoint aware of the destination, saved stops,
 * active canvas tab, and whichever Place / Activity / Hotel sheet is currently open.
 */
tripsRoutes.post('/:id/chat', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);

  const body = (await c.req.json()) as {
    message: string;
    activeTab: string;
    savedItems: TripSavedItem[];
    inspectingEntity?: { kind: string; name: string; details?: string } | null;
  };

  const priorMessages = await store.getMessages(id);
  const recentHistory = priorMessages.slice(-8).map((m) => ({
    role: m.role,
    text:
      m.text ||
      (m.blocks || [])
        .map((b) => (b.type === 'text' ? b.content : b.type === 'bullets' ? b.intro || '' : ''))
        .join(' '),
  }));

  const turn = await generateCoPilotTurn({
    destination: trip.destination,
    datesLabel: trip.dates_label,
    userMessage: body.message,
    savedItems: body.savedItems || [],
    activeTab: body.activeTab || 'discover',
    inspectingEntity: body.inspectingEntity,
    recentHistory,
  });

  const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: body.message };
  const assistantMsg: ChatMessage = {
    id: `a-${Date.now() + 1}`,
    role: 'assistant',
    blocks: turn.blocks,
  };
  await store.appendMessages(trip.id, [userMsg, assistantMsg]);

  return c.json({
    assistantMessage: assistantMsg,
    action: turn.action,
  });
});

/**
 * Resolves a valid day key for a mutation against the trip's actual `day_labels`.
 */
function resolveDayKey(requested: string | undefined, validDays: string[]): string {
  if (!requested) return validDays[0] || 'Day 1';
  if (requested === 'Any time') return 'Any time';
  const exact = validDays.find((d) => d.toLowerCase() === requested.toLowerCase());
  if (exact) return exact;
  const partial = validDays.find((d) => d.toLowerCase().includes(requested.toLowerCase()));
  if (partial) return partial;
  const numMatch = requested.match(/\d+/);
  if (numMatch) {
    const idx = parseInt(numMatch[0], 10) - 1;
    if (idx >= 0 && idx < validDays.length) return validDays[idx];
  }
  return validDays[0] || 'Day 1';
}

/**
 * POST /api/trips/:id/chat/stream
 * Real-time Server-Sent Events (SSE) Co-Pilot endpoint:
 *  - `event: delta`     -> word-by-word Gemini response tokens (`{ text }`)
 *  - `event: status`    -> live tool status (`{ label }`) while resolving Places mutations
 *  - `event: mutation`  -> updated `items`, newly resolved `addedPlaces`, and `toast`
 *  - `event: done`      -> final persisted `assistantMessage` + UI `action`
 */
tripsRoutes.post('/:id/chat/stream', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);

  const body = (await c.req.json()) as {
    message: string;
    activeTab: string;
    savedItems: TripSavedItem[];
    inspectingEntity?: { kind: string; name: string; details?: string } | null;
  };

  const priorMessages = await store.getMessages(id);
  const recentHistory = priorMessages.slice(-8).map((m) => ({
    role: m.role,
    text:
      m.text ||
      (m.blocks || [])
        .map((b) => (b.type === 'text' ? b.content : b.type === 'bullets' ? b.intro || '' : ''))
        .join(' '),
  }));

  return streamSSE(c, async (stream) => {
    try {
      const { fullText, meta } = await streamCoPilotTurn({
        destination: trip.destination,
        datesLabel: trip.dates_label,
        days: trip.day_labels,
        userMessage: body.message,
        savedItems: body.savedItems || [],
        activeTab: body.activeTab || 'discover',
        inspectingEntity: body.inspectingEntity,
        recentHistory,
        onTextDelta: (text) => {
          stream.writeSSE({ event: 'delta', data: JSON.stringify({ text }) }).catch(() => {});
        },
      });

      // Execute any structured itinerary mutations (add_place / remove_item / move_item)
      let workingItems: TripSavedItem[] = [...(body.savedItems || [])];
      const addedPlaces: PlaceItem[] = [];
      const mutationSummaries: string[] = [];
      const validDayKeys = trip.day_labels.map((d) => d.key);

      if (meta.mutations && meta.mutations.length > 0) {
        await stream.writeSSE({
          event: 'status',
          data: JSON.stringify({ label: 'Updating your itinerary...' }),
        });

        for (const mut of meta.mutations as ItineraryMutation[]) {
          if (mut.op === 'remove_item' && mut.titleQuery) {
            const q = mut.titleQuery.toLowerCase();
            const removed = workingItems.find((it) => it.title.toLowerCase().includes(q));
            if (removed) {
              workingItems = workingItems.filter((it) => it.id !== removed.id);
              mutationSummaries.push(`Removed ${removed.title}`);
            }
          } else if (mut.op === 'move_item' && mut.titleQuery) {
            const q = mut.titleQuery.toLowerCase();
            const targetDay = resolveDayKey(mut.day, validDayKeys);
            const target = workingItems.find((it) => it.title.toLowerCase().includes(q));
            if (target) {
              workingItems = workingItems.map((it) =>
                it.id === target.id
                  ? { ...it, day: targetDay, time: mut.time || it.time || '2:00 PM' }
                  : it
              );
              mutationSummaries.push(
                `Moved ${target.title} to ${targetDay}${mut.time ? ` (${mut.time})` : ''}`
              );
            }
          } else if (mut.op === 'add_place' && mut.query) {
            const targetDay = resolveDayKey(mut.day, validDayKeys);
            await stream.writeSSE({
              event: 'status',
              data: JSON.stringify({ label: `Finding ${mut.query} in ${trip.destination}...` }),
            });
            const hits = await searchPlacesCached(
              `${mut.query} ${trip.destination}`,
              1,
              trip.destination
            );
            const gp = hits[0];
            if (gp) {
              const placeItem = toPlaceItem(gp, 'landmarks', trip.destination, targetDay, 0);
              addedPlaces.push(placeItem);
              const newItem: TripSavedItem = {
                id: `saved-${placeItem.id}`,
                refId: placeItem.id,
                type: 'place',
                title: placeItem.name,
                subtitle: placeItem.neighborhood,
                image: placeItem.image,
                day: targetDay,
                time: mut.time || placeItem.suggestedTime || '11:00 AM',
                coords: placeItem.coords,
              };
              workingItems = [...workingItems.filter((it) => it.refId !== placeItem.id), newItem];
              mutationSummaries.push(
                `Added ${placeItem.name} to ${targetDay}${newItem.time ? ` (${newItem.time})` : ''}`
              );
            }
          }
        }

        if (mutationSummaries.length > 0) {
          await store.replaceTripItems(trip.id, workingItems);

          // Persist newly discovered places into the trip's cached catalog so clicking them opens their dossier
          if (addedPlaces.length > 0 && trip.catalog) {
            const cat = trip.catalog as { places?: PlaceItem[] };
            const existingIds = new Set((cat.places || []).map((p) => p.id));
            const mergedPlaces = [
              ...(cat.places || []),
              ...addedPlaces.filter((p) => !existingIds.has(p.id)),
            ];
            await store.updateTrip(trip.id, {
              catalog: { ...trip.catalog, places: mergedPlaces },
            });
          }

          await stream.writeSSE({
            event: 'mutation',
            data: JSON.stringify({
              items: workingItems,
              addedPlaces,
              toast: mutationSummaries.join(' · '),
            }),
          });
        }
      }

      const blocks: ChatMessage['blocks'] = [{ type: 'text', content: fullText }];
      if (meta.suggestions.length > 0) {
        blocks.push({ type: 'suggestions', items: meta.suggestions });
      }

      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text: body.message };
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now() + 1}`,
        role: 'assistant',
        blocks,
      };
      await store.appendMessages(trip.id, [userMsg, assistantMsg]);

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({
          assistantMessage: assistantMsg,
          action: meta.action,
        }),
      });
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: (err as Error)?.message || 'Stream error' }),
      });
    }
  });
});
