import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { store } from '../services/supabase';
import {
  buildDiscoverBlueprint,
  CuratedHotelPick,
  CuratedNamedPick,
  detectRoadTripPrompt,
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
  verifyNamedPlaceCached,
} from '../services/places';
import { parseTripIsoDates, searchSerpApiHotels } from '../services/serpapi';
import type {
  ActivityItem,
  ChatMessage,
  DiscoverSection,
  HotelItem,
  PlaceItem,
  TripSavedItem,
} from '../../src/types/travel';

export const tripsRoutes = new Hono();

/**
 * Checks whether the current request belongs to the organizer of `trip`.
 * - Signed-in owned trips (`trip.user_id` set): strictly requires matching authenticated user.
 * - Unclaimed guest trips (`trip.user_id` null): allows organizer session on server while
 *   frontend distinguishes creator vs. shared viewer via `vesper-owned-trips` localStorage.
 */
async function resolveTripOwnership(
  trip: { user_id?: string | null },
  authHeader?: string
): Promise<{ isOwner: boolean; authedUser: Awaited<ReturnType<typeof store.verifyAccessToken>> }> {
  const authedUser = await store.verifyAccessToken(authHeader);
  if (!trip.user_id) {
    return { isOwner: true, authedUser };
  }
  return {
    isOwner: Boolean(authedUser && authedUser.id === trip.user_id),
    authedUser,
  };
}

/* ── Helpers converting real Google Places results into Vesper UI models ── */

function toPlaceItem(
  gp: GooglePlaceLite,
  section: PlaceItem['section'],
  destination: string,
  dayKey: string,
  idx: number,
  curated?: CuratedNamedPick
): PlaceItem {
  const gallery = gp.photoNames.map((n) => buildPhotoProxyUrl(n, 900));
  const fallbackImg = gallery[0] || '';
  const defaultHours =
    gp.weekdayDescriptions && gp.weekdayDescriptions.length > 0
      ? gp.weekdayDescriptions.slice(0, 3).join(' · ')
      : 'Open daily · Check official hours before visiting';
  const timeDefaults = ['10:00 AM', '12:30 PM', '2:30 PM', '5:00 PM', '7:30 PM'];

  const shortDesc =
    curated?.whySpecial ||
    gp.editorialSummary ||
    `${gp.primaryType} in ${gp.neighborhood}, ${destination}.`;
  const editorial = curated
    ? `${curated.whySpecial} Insider tip: ${curated.insiderTip}`
    : gp.editorialSummary ||
      `Highly rated ${gp.primaryType.toLowerCase()} in ${gp.neighborhood} (${gp.rating.toFixed(
        1
      )}★ from ${gp.reviews.toLocaleString()} reviews). Located at ${gp.formattedAddress}.`;

  const closedDays = (gp.weekdayDescriptions || [])
    .filter((line) => /closed/i.test(line))
    .map((line) => line.split(':')[0]?.trim())
    .filter(Boolean);

  const inferredBookingType: PlaceItem['bookingType'] =
    curated?.bookingType ||
    (section === 'food'
      ? /cafe|café|coffee|bakery|pastel|pastry|market/i.test(`${gp.name} ${gp.primaryType}`)
        ? 'walk_in'
        : 'reservation'
      : section === 'museums' || /museum|palace|castle|monastery|cathedral|gallery|tower/i.test(`${gp.name} ${gp.primaryType}`)
      ? 'timed_ticket'
      : 'walk_in');

  const estimatedCostUsd =
    typeof curated?.estimatedCostUsd === 'number'
      ? curated.estimatedCostUsd
      : inferredBookingType === 'timed_ticket'
      ? 18
      : 0;

  return {
    id: `gp-${gp.id}`,
    name: gp.name,
    category: gp.primaryType,
    section,
    rating: gp.rating,
    reviews: gp.reviews,
    priceTier: gp.priceTier,
    shortDescription: shortDesc,
    editorialSummary: editorial,
    image: fallbackImg,
    gallery: gallery.length > 0 ? gallery : [fallbackImg],
    photoCredit: 'Google Places',
    coords: { lat: gp.lat, lng: gp.lng },
    hours: {
      closedDay: closedDays.length > 0 ? closedDays.join(', ') : undefined,
      openSchedule: defaultHours,
      weekdayDescriptions: gp.weekdayDescriptions,
    },
    details: {
      goodForChildren: section !== 'food',
      restroom: true,
      accessibility: 'Check venue entry details on official site',
      reservationNote: curated?.insiderTip,
    },
    website: gp.website || `https://www.google.com/maps/place/?q=place_id:${gp.id}`,
    phone: gp.phone || 'See website',
    neighborhood: gp.neighborhood,
    suggestedDay: dayKey,
    suggestedTime:
      curated?.bestTime ||
      (section === 'food'
        ? idx % 2 === 0
          ? '1:30 PM'
          : '7:30 PM'
        : timeDefaults[idx % timeDefaults.length]),
    bookingType: inferredBookingType,
    advanceLeadTime:
      curated?.advanceLeadTime ||
      (inferredBookingType === 'walk_in'
        ? 'No booking needed'
        : inferredBookingType === 'reservation'
        ? 'Reserve 1–2 weeks ahead'
        : 'Book timed tickets ahead'),
    estimatedCostUsd,
  };
}

function toActivityItem(
  gp: GooglePlaceLite,
  destination: string,
  idx: number,
  curated?: CuratedNamedPick
): ActivityItem {
  const gallery = gp.photoNames.map((n) => buildPhotoProxyUrl(n, 900));
  const basePrice =
    typeof curated?.estimatedCostUsd === 'number' && curated.estimatedCostUsd > 0
      ? Math.round(curated.estimatedCostUsd)
      : 38 + (idx % 4) * 18;
  const bookingType = curated?.bookingType || 'guided_tour';

  return {
    id: `act-${gp.id}`,
    title: gp.name,
    shortTitle: gp.name,
    rating: gp.rating,
    reviews: gp.reviews,
    duration: idx % 2 === 0 ? '2.5 hours' : '3 hours',
    pricePerPerson: basePrice,
    tagline:
      curated?.whySpecial ||
      gp.editorialSummary ||
      `Top-rated ${gp.primaryType.toLowerCase()} experience in ${gp.neighborhood}.`,
    description:
      curated?.whySpecial ||
      gp.editorialSummary ||
      `Explore ${gp.name} in ${gp.neighborhood}, ${destination}.`,
    aboutHeading: `Experience ${gp.name}`,
    aboutBody: [
      curated?.whySpecial ||
        gp.editorialSummary ||
        `Discover one of ${destination}’s highest-rated highlights in ${gp.neighborhood}, backed by ${gp.reviews.toLocaleString()} traveler reviews.`,
      curated?.insiderTip ? `Insider tip: ${curated.insiderTip}` : `Address: ${gp.formattedAddress}.`,
    ],
    highlights: [
      `Located in ${gp.neighborhood}, ${destination}`,
      `Rated ${gp.rating.toFixed(1)}★ by ${gp.reviews.toLocaleString()} travelers`,
      curated?.insiderTip || 'Instant timeline scheduling with live street transit estimates',
    ],
    image: gallery[0] || '',
    gallery: gallery.length > 0 ? gallery : [''],
    coords: { lat: gp.lat, lng: gp.lng },
    slots: [
      { id: `${gp.id}-am`, time: curated?.bestTime || '9:30 AM', endTime: '12:00 PM', spotsLeft: 6, pricePerPerson: basePrice },
      { id: `${gp.id}-pm`, time: '2:00 PM', endTime: '4:30 PM', spotsLeft: 4, pricePerPerson: basePrice + 6 },
    ],
    category: gp.primaryType,
    bookingType,
    advanceLeadTime:
      curated?.advanceLeadTime ||
      (bookingType === 'walk_in' ? 'No booking needed' : 'Book 1–2 weeks ahead'),
    website: gp.website || `https://www.google.com/maps/place/?q=place_id:${gp.id}`,
    weekdayDescriptions: gp.weekdayDescriptions,
  };
}

function toHotelItem(
  gp: GooglePlaceLite,
  destination: string,
  idx: number,
  curated?: CuratedHotelPick
): HotelItem {
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
    tagline: curated?.whyChoose || gp.editorialSummary || `${gp.neighborhood} · Rated ${gp.rating.toFixed(1)}★`,
    shortDescription:
      curated?.whyChoose ||
      gp.editorialSummary ||
      `Well-reviewed stay in ${gp.neighborhood}, ${destination} with easy access to your daily route.`,
    pickLabel: curated?.pickLabel || pickLabels[idx % pickLabels.length],
    whyChoose:
      curated?.whyChoose ||
      gp.editorialSummary ||
      `Strong ${gp.rating.toFixed(1)}★ guest rating (${gp.reviews.toLocaleString()} reviews) in ${gp.neighborhood}, well positioned for your itinerary.`,
    website: gp.website,
    bookingUrl: gp.website,
    pricePerNight: Math.round(twoNightTotal / 2),
    livePricing: false,
    ...(curated?.overnightTown ? { overnightTown: curated.overnightTown } : {}),
    image: gallery[0] || '',
    gallery: gallery.length > 0 ? gallery : [''],
    coords: { lat: gp.lat, lng: gp.lng },
    highlights: [
      { icon: 'map', title: `Prime ${gp.neighborhood} base`, description: gp.formattedAddress },
      { icon: 'sparkle', title: `${scoreTen.toFixed(1)}/10 traveler score`, description: `Based on ${gp.reviews.toLocaleString()} verified guest reviews.` },
      { icon: 'bed', title: curated?.pickLabel || 'Thoughtful rooms & suites', description: curated?.whyChoose || 'Flexible cancellation rates available.' },
      { icon: 'tree', title: 'Sleep & room tip', description: curated?.noiseAndRoomTip || `Short transit distance to top ${destination} stops.` },
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
            body: `${gp.formattedAddress}. ${curated?.whyChoose || `Convenient jumping-off point for your ${destination} itinerary.`}`,
          },
        ],
      },
      {
        id: 'noise',
        label: 'Noise & Privacy',
        title: 'Noise & Sleep Quality',
        items: [
          {
            heading: 'Insider room request tip',
            body:
              curated?.noiseAndRoomTip ||
              `Ask ${gp.name} for an upper-floor or interior courtyard room when booking if you prefer extra-quiet nights.`,
          },
        ],
      },
    ],
  };
}

function deriveTripMode(trip: {
  prompt?: string;
  taste_profile?: Record<string, unknown> | null;
  day_labels?: Array<{ legFrom?: string; overnightTown?: string }>;
}): 'city' | 'roadtrip' {
  const tpMode = trip.taste_profile?.tripMode;
  if (tpMode === 'roadtrip' || tpMode === 'city') return tpMode;
  if (Array.isArray(trip.day_labels) && trip.day_labels.some((d) => Boolean(d.legFrom || d.overnightTown))) {
    return 'roadtrip';
  }
  return trip.prompt && detectRoadTripPrompt(trip.prompt) ? 'roadtrip' : 'city';
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

  const [{ isOwner }, ownerName, items, messages, votes, notes] = await Promise.all([
    resolveTripOwnership(trip, c.req.header('Authorization')),
    trip.user_id ? store.getProfileDisplayName(trip.user_id) : Promise.resolve(null),
    store.getTripItems(trip.id),
    store.getMessages(trip.id),
    store.getTripVotes(trip.id),
    store.getTripNotes(trip.id),
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
      isOwner,
      ownerName,
      tripMode: deriveTripMode(trip),
      tasteProfile: trip.taste_profile,
      catalog: trip.catalog,
    },
    items,
    messages: isOwner ? messages : [],
    votes,
    notes,
  });
});

/** POST /api/trips/:id/claim — Associates an anonymous guest trip with the newly signed-in user. */
tripsRoutes.post('/:id/claim', async (c) => {
  const user = await store.verifyAccessToken(c.req.header('Authorization'));
  if (!user) return c.json({ error: 'Authentication required' }, 401);
  const claimed = await store.claimTrip(c.req.param('id'), user.id);
  return c.json({ ok: claimed });
});

/** GET /api/trips/:id — Loads a full trip with cached catalog, items, chat history, votes & notes ($0 API cost). */
tripsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);

  const [{ isOwner }, ownerName, items, messages, votes, notes] = await Promise.all([
    resolveTripOwnership(trip, c.req.header('Authorization')),
    trip.user_id ? store.getProfileDisplayName(trip.user_id) : Promise.resolve(null),
    store.getTripItems(id),
    store.getMessages(id),
    store.getTripVotes(id),
    store.getTripNotes(id),
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
      isOwner,
      ownerName,
      tripMode: deriveTripMode(trip),
      tasteProfile: trip.taste_profile,
      catalog: trip.catalog,
    },
    items,
    messages: isOwner ? messages : [],
    votes,
    notes,
  });
});

/* ── Group Collaboration: Votes & Contextual Notes ──────────────────────── */

const voteSchema = z.object({
  entityId: z.string().min(1),
  entityKind: z.enum(['hotel', 'place', 'activity']),
  voterKey: z.string().min(1).max(120),
  voterName: z.string().min(1).max(60),
  vote: z.enum(['up', 'down', 'clear']),
});

const noteSchema = z.object({
  entityId: z.string().min(1),
  entityKind: z.enum(['hotel', 'place', 'activity']),
  authorKey: z.string().min(1).max(120),
  authorName: z.string().min(1).max(60),
  body: z.string().min(1).max(280),
});

tripsRoutes.get('/:id/collaboration', async (c) => {
  const id = c.req.param('id');
  const [votes, notes] = await Promise.all([
    store.getTripVotes(id),
    store.getTripNotes(id),
  ]);
  return c.json({ votes, notes });
});

tripsRoutes.post('/:id/votes', async (c) => {
  const id = c.req.param('id');
  const body = voteSchema.parse(await c.req.json());
  const votes = await store.setTripVote(id, body);
  return c.json({ votes });
});

tripsRoutes.post('/:id/notes', async (c) => {
  const id = c.req.param('id');
  const body = noteSchema.parse(await c.req.json());
  const notes = await store.addTripNote(id, body);
  return c.json({ notes });
});

tripsRoutes.delete('/:id/notes/:noteId', async (c) => {
  const id = c.req.param('id');
  const noteId = c.req.param('noteId');
  const authorKey = c.req.query('authorKey') || '';
  if (!authorKey) return c.json({ error: 'authorKey required' }, 400);
  const notes = await store.deleteTripNote(id, noteId, authorKey);
  return c.json({ notes });
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
      tripMode: parsed.tripMode,
      roadTripDefaults: parsed.roadTripDefaults ?? null,
    },
    messages: initialMessages,
  });
});

const composeSchema = z.object({
  travelers: z.string(),
  vibes: z.array(z.string()).min(1),
  pace: z.enum(['Unhurried', 'Balanced', 'Packed']),
  splurge: z.enum(['Smart', 'Elevated', 'Iconic']),
  tripMode: z.enum(['city', 'roadtrip']).optional(),
  roadTrip: z
    .object({
      startCity: z.string(),
      transportMode: z.enum(['drive_home', 'fly_drive']),
      maxDriveHoursPerDay: z.enum(['under_2h', '2_to_4h', '4h_plus']),
      overnightTowns: z.array(z.string()).optional(),
    })
    .optional(),
  loyaltyPrograms: z
    .array(
      z.object({
        category: z.enum(['hotel', 'airline']),
        provider: z.string(),
        programName: z.string(),
        tier: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * POST /api/trips/:id/compose
 * Called when the user submits the 5-Second TasteCard:
 * 1. Gemini generates tailored section queries & editorial intros for this destination + taste + loyalty wallet
 *    (and multi-leg driving corridor + per-town stays when `tripMode === 'roadtrip'`).
 * 2. Parallel cached Google Places (New) Text Searches fetch real activities, places, and boutique stays.
 * 3. Caches the full catalog on `trips.catalog` in Supabase so reloads cost $0.
 */
tripsRoutes.post('/:id/compose', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);

  const { isOwner, authedUser } = await resolveTripOwnership(trip, c.req.header('Authorization'));
  if (!isOwner) {
    return c.json({ error: 'Only the trip organizer can modify this itinerary.' }, 403);
  }

  const parsedBody = composeSchema.parse(await c.req.json());
  const { loyaltyPrograms: bodyLoyalty, ...taste } = parsedBody;
  const effectiveTripMode = taste.tripMode || deriveTripMode(trip);
  const tasteWithMode = { ...taste, tripMode: effectiveTripMode };

  const storedProfile = authedUser ? await store.getOrCreateProfile(authedUser) : null;
  const effectiveLoyalty =
    bodyLoyalty && bodyLoyalty.length > 0
      ? bodyLoyalty
      : storedProfile?.loyalty_programs || [];

  const hotelPrograms = effectiveLoyalty
    .filter((l) => l.category === 'hotel')
    .map((l) => (l.tier ? `${l.programName} (${l.tier})` : l.programName));
  const airlinePrograms = effectiveLoyalty
    .filter((l) => l.category === 'airline')
    .map((l) => (l.tier ? `${l.programName} (${l.tier})` : l.programName));

  const blueprint = await buildDiscoverBlueprint(
    trip.destination,
    trip.country,
    trip.dates_label,
    tasteWithMode,
    { hotelPrograms, airlinePrograms },
    Math.max(2, trip.day_labels.length)
  );

  // Merge Gemini road-trip corridor legs into trip.day_labels when in Road Trip Mode
  let updatedDays = trip.day_labels;
  if (effectiveTripMode === 'roadtrip' && blueprint.roadTripLegs && blueprint.roadTripLegs.length > 0) {
    updatedDays = trip.day_labels.map((day, idx) => {
      const leg = blueprint.roadTripLegs?.find((l) => l.dayIndex === idx) || blueprint.roadTripLegs?.[idx];
      if (!leg) return day;
      return {
        ...day,
        themeLabel: leg.themeLabel || day.themeLabel,
        legFrom: leg.legFrom,
        legTo: leg.legTo,
        overnightTown: leg.overnightTown,
        estDriveMinutes: Math.round(leg.estDriveMinutes),
        estDriveMiles: Math.round(leg.estDriveMiles),
      };
    });
    const towns = Array.from(
      new Set(updatedDays.map((d) => d.overnightTown || d.legTo).filter((t): t is string => Boolean(t)))
    );
    if (tasteWithMode.roadTrip) {
      tasteWithMode.roadTrip = { ...tasteWithMode.roadTrip, overnightTowns: towns };
    }
  }

  // Verify all Gemini-curated named venues, experiences & boutique stays in parallel
  // against Google Places API (New) via our 14-day Supabase `place_cache`.
  // For Road Trip Mode, each pick verifies against its specific corridor `town` / `overnightTown`!
  const [verifiedExperiences, verifiedHotels, verifiedSections] = await Promise.all([
    blueprint.namedExperiences.length > 0
      ? Promise.all(
          blueprint.namedExperiences.slice(0, 4).map(async (pick) => ({
            pick,
            gp: await verifyNamedPlaceCached(pick.name, pick.town || trip.destination),
          }))
        )
      : Promise.resolve([]),
    blueprint.namedHotels.length > 0
      ? Promise.all(
          blueprint.namedHotels.slice(0, 6).map(async (pick) => ({
            pick,
            gp: await verifyNamedPlaceCached(pick.name, pick.overnightTown || trip.destination),
          }))
        )
      : Promise.resolve([]),
    Promise.all(
      blueprint.sections.map(async (sec) => {
        const namedHits = await Promise.all(
          (sec.namedPicks || []).slice(0, 4).map(async (pick) => ({
            pick,
            gp: await verifyNamedPlaceCached(pick.name, pick.town || trip.destination),
          }))
        );
        const validNamed = namedHits.filter(
          (h): h is { pick: CuratedNamedPick; gp: GooglePlaceLite } => h.gp !== null
        );
        // Backfill with Places search if fewer than 3 named venues verified
        const backfill =
          validNamed.length < 3
            ? await searchPlacesCached(sec.placesQuery, 5, trip.destination)
            : [];
        return { sec, validNamed, backfill };
      })
    ),
  ]);

  const seenPlaceIds = new Set<string>();
  const discoverSections: DiscoverSection[] = verifiedSections.map(({ sec, validNamed, backfill }, sIdx) => {
    const defaultDayKey = updatedDays[sIdx % updatedDays.length]?.key || 'Day 1';
    const places: PlaceItem[] = [];

    for (const { pick, gp } of validNamed) {
      if (seenPlaceIds.has(gp.id)) continue;
      seenPlaceIds.add(gp.id);
      const dayKey =
        typeof pick.dayIndex === 'number' && updatedDays[pick.dayIndex]
          ? updatedDays[pick.dayIndex].key
          : defaultDayKey;
      places.push(toPlaceItem(gp, sec.key, pick.town || trip.destination, dayKey, places.length, pick));
    }
    for (const gp of backfill) {
      if (seenPlaceIds.has(gp.id) || places.length >= 5) continue;
      seenPlaceIds.add(gp.id);
      places.push(toPlaceItem(gp, sec.key, trip.destination, defaultDayKey, places.length));
    }

    return {
      key: sec.key,
      title: sec.title,
      intro: sec.intro,
      places,
    };
  });

  // Experiences: verified named picks + backfill if < 3 verified
  const validExp = verifiedExperiences.filter(
    (h): h is { pick: CuratedNamedPick; gp: GooglePlaceLite } => h.gp !== null
  );
  const expBackfill =
    validExp.length < 3 ? await searchPlacesCached(blueprint.activitiesQuery, 5, trip.destination) : [];
  const seenActIds = new Set<string>();
  const activities: ActivityItem[] = [];
  for (const { pick, gp } of validExp) {
    if (seenActIds.has(gp.id)) continue;
    seenActIds.add(gp.id);
    activities.push(toActivityItem(gp, pick.town || trip.destination, activities.length, pick));
  }
  for (const gp of expBackfill) {
    if (seenActIds.has(gp.id) || activities.length >= 5) continue;
    seenActIds.add(gp.id);
    activities.push(toActivityItem(gp, trip.destination, activities.length));
  }

  // Boutique Hotels: verified named picks + backfill if < 4 verified
  const validHotels = verifiedHotels.filter(
    (h): h is { pick: CuratedHotelPick; gp: GooglePlaceLite } => h.gp !== null
  );
  const hotelBackfill =
    validHotels.length < 4 ? await searchPlacesCached(blueprint.hotelsQuery, 6, trip.destination) : [];
  const seenHotelIds = new Set<string>();
  const hotels: HotelItem[] = [];
  for (const { pick, gp } of validHotels) {
    if (seenHotelIds.has(gp.id)) continue;
    seenHotelIds.add(gp.id);
    hotels.push(toHotelItem(gp, pick.overnightTown || trip.destination, hotels.length, pick));
  }
  for (const gp of hotelBackfill) {
    if (seenHotelIds.has(gp.id) || hotels.length >= 6) continue;
    seenHotelIds.add(gp.id);
    hotels.push(toHotelItem(gp, trip.destination, hotels.length));
  }

  const allPlaces = discoverSections.flatMap((s) => s.places);

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
    taste_profile: tasteWithMode,
    day_labels: updatedDays,
    catalog,
    center_lat: center.lat,
    center_lng: center.lng,
    hero_image: heroImage,
  });

  // Save submitted taste profile as the signed-in user's cross-trip Taste Memory
  if (authedUser) {
    store.updateProfile(authedUser, { default_taste: taste }).catch(() => {});
  }

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
      text:
        effectiveTripMode === 'roadtrip'
          ? `Road trip · ${taste.travelers} · ${taste.vibes.join(', ')} · ${taste.pace} pace · ${taste.splurge} style`
          : `${taste.travelers} · ${taste.vibes.join(', ')} · ${taste.pace} pace · ${taste.splurge} style`,
    },
    assistantMsg,
  ]);

  return c.json({
    catalog,
    days: updatedDays,
    tripMode: effectiveTripMode,
    tasteProfile: tasteWithMode,
    center,
    heroImage,
    assistantMessage: assistantMsg,
  });
});

/** PUT /api/trips/:id/items — Persists saved places, activities, hotels, and flights. */
tripsRoutes.put('/:id/items', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);
  const { isOwner } = await resolveTripOwnership(trip, c.req.header('Authorization'));
  if (!isOwner) {
    return c.json({ error: 'Only the trip organizer can edit trip stops.' }, 403);
  }
  const body = (await c.req.json()) as { items: TripSavedItem[] };
  const saved = await store.replaceTripItems(id, body.items || []);
  return c.json({ items: saved });
});

/** PATCH /api/trips/:id/meta — Updates editable trip dates and travelers from the My Trip header. */
tripsRoutes.patch('/:id/meta', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);
  const { isOwner } = await resolveTripOwnership(trip, c.req.header('Authorization'));
  if (!isOwner) {
    return c.json({ error: 'Only the trip organizer can update trip details.' }, 403);
  }
  const body = (await c.req.json()) as { datesLabel?: string; travelers?: string };
  const patch: Record<string, unknown> = {};
  if (typeof body.datesLabel === 'string' && body.datesLabel.trim()) {
    patch.dates_label = body.datesLabel.trim();
  }
  if (typeof body.travelers === 'string' && body.travelers.trim()) {
    patch.travelers = body.travelers.trim();
  }
  if (Object.keys(patch).length > 0) {
    await store.updateTrip(id, patch);
  }
  return c.json({ ok: true, datesLabel: patch.dates_label ?? trip.dates_label, travelers: patch.travelers ?? trip.travelers });
});

/**
 * POST /api/trips/:id/organize
 * Uses Gemini to cluster the user's saved stops spatially across days & chronological times.
 */
tripsRoutes.post('/:id/organize', async (c) => {
  const id = c.req.param('id');
  const trip = await store.getTrip(id);
  if (!trip) return c.json({ error: 'Trip not found' }, 404);
  const { isOwner } = await resolveTripOwnership(trip, c.req.header('Authorization'));
  if (!isOwner) {
    return c.json({ error: 'Only the trip organizer can reorganize this itinerary.' }, 403);
  }

  const body = (await c.req.json()) as { items: TripSavedItem[] };
  const workingItems = body.items || [];

  const hasUnscheduled = workingItems.some(
    (i) => (i.type === 'place' || i.type === 'activity') && (!i.day || i.day === 'Any time')
  );

  let updatedItems: TripSavedItem[] = workingItems;
  let summaryIntro = `Organized your ${trip.destination} stops into a smooth day-by-day route.`;
  let summaryBullets: string[] = [];
  let summaryOutro = 'Open **Map** to inspect your color-coded daily routes and transit times.';
  let suggestions: string[] = [
    `Find boutique stays in ${trip.destination}`,
    'View my routed days on Map',
  ];

  try {
    const result = await organizeStopsWithGemini(trip.destination, trip.day_labels, workingItems);
    const assignmentMap = new Map(result.assignments.map((a) => [a.itemId, a]));
    updatedItems = workingItems.map((item) => {
      const isPinnedAnchor =
        hasUnscheduled &&
        (item.type === 'place' || item.type === 'activity') &&
        Boolean(item.day && item.day !== 'Any time' && item.time);
      if (isPinnedAnchor) return item;
      const hit = assignmentMap.get(item.id);
      if (!hit) return item;
      return { ...item, day: hit.day, time: hit.time };
    });
    summaryIntro = result.summaryIntro || summaryIntro;
    summaryBullets = result.summaryBullets || [];
    summaryOutro = result.summaryOutro || summaryOutro;
    if (result.suggestions?.length) suggestions = result.suggestions.slice(0, 3);
  } catch (err) {
    console.warn('[vesper] organizeStopsWithGemini fallback:', (err as Error)?.message?.slice(0, 140));
    // Deterministic coordinate-aware spatial clustering fallback (respects manually pinned anchors!)
    const validDays = trip.day_labels.length > 0 ? trip.day_labels : [{ key: 'Day 1', short: 'Day 1', themeLabel: 'Highlights', dotColor: '#C85A17' }];
    const dayCounts = new Map<string, number>(validDays.map((d) => [d.key, 0]));
    const pinnedSet = new Set<string>();

    for (const item of workingItems) {
      if (
        hasUnscheduled &&
        (item.type === 'place' || item.type === 'activity') &&
        item.day &&
        item.day !== 'Any time' &&
        item.time
      ) {
        pinnedSet.add(item.id);
        dayCounts.set(item.day, (dayCounts.get(item.day) || 0) + 1);
      }
    }

    // Sort unpinned stops spatially by latitude/longitude so nearby stops cluster onto the same day
    const toRoute = workingItems
      .filter((i) => (i.type === 'place' || i.type === 'activity') && !pinnedSet.has(i.id))
      .sort((a, b) => {
        const scoreA = (a.coords?.lat || 0) + (a.coords?.lng || 0);
        const scoreB = (b.coords?.lat || 0) + (b.coords?.lng || 0);
        return scoreA - scoreB;
      });

    const foodSlots = ['1:00 PM', '7:30 PM', '12:30 PM', '8:00 PM'];
    const sightSlots = ['10:00 AM', '2:30 PM', '4:30 PM', '11:30 AM'];
    const routedMap = new Map<string, { day: string; time: string }>();

    toRoute.forEach((item, idx) => {
      // Pick the least-loaded day so stops spread evenly while respecting pinned anchors
      const chosenDay =
        [...validDays].sort((a, b) => (dayCounts.get(a.key) || 0) - (dayCounts.get(b.key) || 0))[0]
          ?.key || validDays[0].key;
      const countOnDay = dayCounts.get(chosenDay) || 0;
      dayCounts.set(chosenDay, countOnDay + 1);
      const isFood =
        item.bookingMeta?.bookingType === 'reservation' ||
        /restaurant|cafe|café|coffee|bar|bistro|ramen|sushi|dining|bakery/i.test(
          `${item.title} ${item.subtitle || ''}`
        );
      const time = isFood
        ? foodSlots[(countOnDay + idx) % foodSlots.length]
        : sightSlots[countOnDay % sightSlots.length];
      routedMap.set(item.id, { day: chosenDay, time });
    });

    updatedItems = workingItems.map((item) => {
      const assigned = routedMap.get(item.id);
      return assigned ? { ...item, day: assigned.day, time: assigned.time } : item;
    });

    summaryBullets = validDays
      .map((d) => {
        const dayTitles = updatedItems
          .filter((i) => (i.type === 'place' || i.type === 'activity') && i.day === d.key)
          .map((i) => i.title);
        return dayTitles.length > 0 ? `**${d.key}:** ${dayTitles.join(' → ')}` : '';
      })
      .filter(Boolean);
  }

  await store.replaceTripItems(trip.id, updatedItems);

  const assistantMsg: ChatMessage = {
    id: `org-done-${Date.now()}`,
    role: 'assistant',
    blocks: [
      {
        type: 'bullets',
        intro: summaryIntro,
        items: summaryBullets,
        outro: summaryOutro,
      },
      { type: 'suggestions', items: suggestions.slice(0, 3) },
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
  const { isOwner } = await resolveTripOwnership(trip, c.req.header('Authorization'));
  if (!isOwner) {
    return c.json({ error: 'Co-Pilot is only available to the trip organizer.' }, 403);
  }

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
    country: trip.country,
    datesLabel: trip.dates_label,
    travelers: trip.travelers,
    tasteProfile: trip.taste_profile,
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
  const { isOwner } = await resolveTripOwnership(trip, c.req.header('Authorization'));
  if (!isOwner) {
    return c.json({ error: 'Co-Pilot is only available to the trip organizer.' }, 403);
  }

  const body = (await c.req.json()) as {
    message: string;
    activeTab: string;
    savedItems: TripSavedItem[];
    inspectingEntity?: { kind: string; name: string; details?: string } | null;
  };

  const [priorMessages, tripVotes, tripNotes] = await Promise.all([
    store.getMessages(id),
    store.getTripVotes(id),
    store.getTripNotes(id),
  ]);
  const recentHistory = priorMessages.slice(-8).map((m) => ({
    role: m.role,
    text:
      m.text ||
      (m.blocks || [])
        .map((b) => (b.type === 'text' ? b.content : b.type === 'bullets' ? b.intro || '' : ''))
        .join(' '),
  }));

  // Summarize group votes & notes for Co-Pilot consensus awareness
  const voteMap = new Map<
    string,
    { entityId: string; kind: string; upvotes: number; downvotes: number; voters: string[] }
  >();
  for (const v of tripVotes) {
    const cur = voteMap.get(v.entityId) || {
      entityId: v.entityId,
      kind: v.entityKind,
      upvotes: 0,
      downvotes: 0,
      voters: [],
    };
    if (v.vote === 'up') cur.upvotes += 1;
    else cur.downvotes += 1;
    cur.voters.push(`${v.voterName} (${v.vote})`);
    voteMap.set(v.entityId, cur);
  }
  const groupSummary = {
    topVotes: Array.from(voteMap.values())
      .sort((a, b) => b.upvotes - a.upvotes)
      .slice(0, 8),
    recentNotes: tripNotes.slice(-8).map((n) => ({
      entityId: n.entityId,
      author: n.authorName,
      body: n.body,
    })),
  };

  return streamSSE(c, async (stream) => {
    try {
      const { fullText, meta } = await streamCoPilotTurn({
        destination: trip.destination,
        country: trip.country,
        datesLabel: trip.dates_label,
        travelers: trip.travelers,
        tasteProfile: trip.taste_profile,
        days: trip.day_labels,
        userMessage: body.message,
        savedItems: body.savedItems || [],
        activeTab: body.activeTab || 'discover',
        inspectingEntity: body.inspectingEntity,
        groupSummary,
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

      // Guardrails: never let a hotel or accommodation slip into `recommendedPlaces` as a "Walk-in / Free" place card
      const HOTEL_TYPE_RE =
        /\b(hotel|lodging|resort|hostel|inn|motel|bed[ _]and[ _]breakfast|guest[ _]house|pousada|boutique stay|extended stay)\b/i;
      const USER_HOTEL_INTENT_RE =
        /\b(hotel|hotels|stay|stays|where to stay|accommodation|accommodations|resort|resorts|boutique stay|lodging|hostel|airbnb)\b/i;
      const userAskedForHotels = USER_HOTEL_INTENT_RE.test(body.message);

      const hotelSpecs: Array<{
        query: string;
        neighborhood?: string;
        note?: string;
        pickLabel?: string;
        noiseAndRoomTip?: string;
      }> = [...(meta.recommendedHotels || [])];
      const placeSpecs: typeof meta.recommendedPlaces = [];

      for (const spec of meta.recommendedPlaces || []) {
        const looksLikeHotel =
          HOTEL_TYPE_RE.test(`${spec.category || ''} ${spec.query}`) ||
          (userAskedForHotels && hotelSpecs.length === 0);
        if (looksLikeHotel) {
          hotelSpecs.push({ query: spec.query, note: spec.note });
        } else {
          placeSpecs.push(spec);
        }
      }

      // Verify any AI-recommended places in parallel via Google Places API so chat renders
      // rich interactive photo cards (+ Add, ratings, dossiers, and live map pins)
      const recommendedPlaces: PlaceItem[] = [];
      const divertedHotelHits: Array<{ gp: GooglePlaceLite; note?: string }> = [];

      if (placeSpecs.length > 0) {
        await stream.writeSSE({
          event: 'status',
          data: JSON.stringify({ label: 'Pulling live photos, ratings & map pins...' }),
        });

        const verified = await Promise.all(
          placeSpecs.slice(0, 5).map(async (spec, idx) => {
            const hits = await searchPlacesCached(
              `${spec.query} ${trip.destination}`,
              1,
              trip.destination
            );
            const gp = hits[0];
            if (!gp) return null;
            // Secondary guardrail: if Google Places classifies this venue as lodging/hotel, divert to Hotel Cards!
            if (HOTEL_TYPE_RE.test(gp.primaryType)) {
              divertedHotelHits.push({ gp, note: spec.note });
              return null;
            }
            const catText = `${spec.category || ''} ${gp.primaryType}`;
            const section: PlaceItem['section'] = /food|cafe|café|coffee|bar|bakery|restaurant|dining|pastry|bistro|tapas|wine/i.test(
              catText
            )
              ? 'food'
              : /museum|gallery|art/i.test(catText)
              ? 'museums'
              : 'landmarks';
            const targetDay = resolveDayKey(spec.suggestedDay, validDayKeys);
            const curatedPick = spec.note
              ? {
                  name: gp.name,
                  whySpecial: spec.note,
                  insiderTip: spec.bestTime ? `Best around ${spec.bestTime}.` : 'Worth a stop on your route.',
                  bestTime: spec.bestTime || (section === 'food' ? '1:00 PM' : '11:00 AM'),
                  bookingType: (section === 'food'
                    ? /cafe|café|coffee|bakery|pastel|pastry/i.test(`${gp.name} ${catText}`)
                      ? 'walk_in'
                      : 'reservation'
                    : section === 'museums'
                    ? 'timed_ticket'
                    : 'walk_in') as PlaceItem['bookingType'],
                  advanceLeadTime: section === 'food' ? 'Walk-in or reserve ahead' : 'No booking needed',
                  estimatedCostUsd: section === 'food' ? 25 : 0,
                }
              : undefined;
            return toPlaceItem(gp, section, trip.destination, targetDay, idx, curatedPick);
          })
        );

        const seenIds = new Set<string>();
        for (const p of verified) {
          if (p && !seenIds.has(p.id)) {
            seenIds.add(p.id);
            recommendedPlaces.push(p);
          }
        }

        // Persist newly verified chat places into the trip's catalog so clicking them later
        // or inspecting them from the Timeline always opens their full dossier & map pin
        if (recommendedPlaces.length > 0 && trip.catalog) {
          const cat = trip.catalog as { places?: PlaceItem[] };
          const existingIds = new Set((cat.places || []).map((p) => p.id));
          const fresh = recommendedPlaces.filter((p) => !existingIds.has(p.id));
          if (fresh.length > 0) {
            await store.updateTrip(trip.id, {
              catalog: { ...trip.catalog, places: [...(cat.places || []), ...fresh] },
            });
          }
        }
      }

      // Hydrate interactive Hotel Cards (live SerpApi Google Hotels pricing + Google Places details)
      const recommendedHotels: HotelItem[] = [];
      let stayNights = Math.max(1, (trip.day_labels?.length || 3) - 1);
      const shouldHydrateHotels =
        hotelSpecs.length > 0 ||
        divertedHotelHits.length > 0 ||
        (userAskedForHotels && meta.action.type !== 'open_bookings_flights');

      if (shouldHydrateHotels) {
        await stream.writeSSE({
          event: 'status',
          data: JSON.stringify({ label: 'Checking live hotel rates & room options...' }),
        });

        const { startDate, endDate, nights } = parseTripIsoDates(trip.dates_label);
        stayNights = Math.max(1, nights || stayNights);
        const adultsMatch = (trip.travelers || '').match(/\d+/);
        const adults = adultsMatch ? Math.min(8, Math.max(1, parseInt(adultsMatch[0], 10))) : 2;

        const [liveSerp, verifiedNamedHotels] = await Promise.all([
          searchSerpApiHotels({
            destination: trip.destination,
            checkInDate: startDate,
            checkOutDate: endDate,
            nights: stayNights,
            adults,
          }).catch(() => null),
          Promise.all(
            hotelSpecs.slice(0, 5).map(async (spec) => {
              const hits = await searchPlacesCached(
                `${spec.query} ${trip.destination}`,
                1,
                trip.destination
              );
              return { spec, gp: hits[0] ?? null };
            })
          ),
        ]);

        const livePool = liveSerp?.hotels || [];
        const normalizeHotelName = (s: string) =>
          s
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\b(hotel|lisboa|lisbon|boutique|the|by|suites|resort|spa)\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const matchLiveHotel = (name: string): HotelItem | undefined => {
          const target = normalizeHotelName(name);
          if (!target) return undefined;
          return livePool.find((h) => {
            const cand = normalizeHotelName(h.name);
            return cand && (cand.includes(target) || target.includes(cand));
          });
        };

        const scaleHotelToNights = (base: HotelItem): HotelItem => {
          if (base.livePricing) return base;
          const nightly = base.pricePerNight || Math.round(base.priceTotal / 2);
          const total = Math.round(nightly * stayNights);
          return {
            ...base,
            pricePerNight: nightly,
            priceTotal: total,
            rooms: base.rooms.map((r) => ({
              ...r,
              rates: r.rates.map((rate) => {
                const ratio = base.priceTotal > 0 ? rate.price / base.priceTotal : 1;
                return { ...rate, price: Math.round((total * ratio) / 5) * 5 };
              }),
            })),
          };
        };

        const seenHotelIds = new Set<string>();
        const pushHotel = (h: HotelItem) => {
          if (!seenHotelIds.has(h.id)) {
            seenHotelIds.add(h.id);
            recommendedHotels.push(h);
          }
        };

        verifiedNamedHotels.forEach(({ spec, gp }, idx) => {
          const matchedLive =
            matchLiveHotel(spec.query) || (gp ? matchLiveHotel(gp.name) : undefined);
          if (matchedLive) {
            pushHotel({
              ...matchedLive,
              ...(spec.note ? { shortDescription: spec.note, whyChoose: spec.note } : {}),
              ...(spec.pickLabel ? { pickLabel: spec.pickLabel } : {}),
            });
          } else if (gp) {
            const curated: CuratedHotelPick = {
              name: gp.name,
              neighborhood: spec.neighborhood || gp.neighborhood,
              pickLabel: spec.pickLabel || 'Boutique pick',
              whyChoose:
                spec.note ||
                gp.editorialSummary ||
                `Well-reviewed stay in ${gp.neighborhood}, ${trip.destination}.`,
              noiseAndRoomTip:
                spec.noiseAndRoomTip || 'Request a quiet upper-floor or courtyard-facing room.',
            };
            pushHotel(scaleHotelToNights(toHotelItem(gp, trip.destination, idx, curated)));
          }
        });

        divertedHotelHits.forEach(({ gp, note }, idx) => {
          const matchedLive = matchLiveHotel(gp.name);
          if (matchedLive) {
            pushHotel({
              ...matchedLive,
              ...(note ? { shortDescription: note, whyChoose: note } : {}),
            });
          } else {
            pushHotel(
              scaleHotelToNights(
                toHotelItem(gp, trip.destination, idx, {
                  name: gp.name,
                  neighborhood: gp.neighborhood,
                  pickLabel: 'Curated stay',
                  whyChoose: note || gp.editorialSummary || `Top-rated stay in ${gp.neighborhood}.`,
                  noiseAndRoomTip: 'Ask for an upper-floor room for quiet nights.',
                })
              )
            );
          }
        });

        // If user asked generally for hotels and no specific named picks resolved, show top 4 live Google Hotels
        if (recommendedHotels.length === 0 && livePool.length > 0) {
          for (const h of livePool.slice(0, 4)) pushHotel(h);
        }

        // Persist newly hydrated chat hotels into the trip's catalog so View Rooms & Map Pins survive reload
        if (recommendedHotels.length > 0 && trip.catalog) {
          const cat = trip.catalog as { hotels?: HotelItem[] };
          const existingIds = new Set((cat.hotels || []).map((h) => h.id));
          const freshHotels = recommendedHotels.filter((h) => !existingIds.has(h.id));
          if (freshHotels.length > 0) {
            await store.updateTrip(trip.id, {
              catalog: { ...trip.catalog, hotels: [...(cat.hotels || []), ...freshHotels] },
            });
          }
        }
      }

      const blocks: ChatMessage['blocks'] = [{ type: 'text', content: fullText }];
      if (recommendedHotels.length > 0) {
        blocks.push({
          type: 'hotels',
          title: meta.hotelsTitle || `Stays in ${trip.destination}`,
          hotels: recommendedHotels,
          datesLabel: trip.dates_label,
          nights: stayNights,
        });
      }
      if (recommendedPlaces.length > 0) {
        blocks.push({
          type: 'places',
          title: meta.placesTitle,
          places: recommendedPlaces,
        });
      }
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
          recommendedPlaces,
          recommendedHotels,
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
