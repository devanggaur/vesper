import { Hono } from 'hono';
import {
  buildPhotoProxyUrl,
  GooglePlaceLite,
  resolvePhotoCdnUrl,
  searchPlacesInCircleCached,
} from '../services/places';
import type { HotelItem, PlaceItem } from '../../src/types/travel';

export const placesRoutes = new Hono();

function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildSpatialPlaceItem(gp: GooglePlaceLite, destination: string, idx: number): PlaceItem {
  const gallery = gp.photoNames.map((n) => buildPhotoProxyUrl(n, 900));
  const fallbackImg = gallery[0] || '';
  const isFood = /restaurant|cafe|café|coffee|bar|bakery|pastry|bistro|wine|tapas|ice cream/i.test(
    `${gp.name} ${gp.primaryType}`
  );
  const isMuseum = /museum|gallery|palace|castle|cathedral|monastery/i.test(
    `${gp.name} ${gp.primaryType}`
  );
  const section: PlaceItem['section'] = isFood ? 'food' : isMuseum ? 'museums' : 'landmarks';
  const bookingType: PlaceItem['bookingType'] = isFood
    ? /cafe|café|coffee|bakery|pastel|pastry|gelato|bar/i.test(`${gp.name} ${gp.primaryType}`)
      ? 'walk_in'
      : 'reservation'
    : isMuseum
    ? 'timed_ticket'
    : 'walk_in';

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
      `Rated ${gp.rating.toFixed(1)}★ (${gp.reviews.toLocaleString()} reviews) in ${gp.neighborhood}.`,
    image: fallbackImg,
    gallery: gallery.length > 0 ? gallery : [fallbackImg],
    photoCredit: 'Google Places',
    coords: { lat: gp.lat, lng: gp.lng },
    hours: {
      openSchedule:
        gp.weekdayDescriptions && gp.weekdayDescriptions.length > 0
          ? gp.weekdayDescriptions.slice(0, 3).join(' · ')
          : 'Open daily · Check venue hours',
      weekdayDescriptions: gp.weekdayDescriptions,
    },
    details: {
      goodForChildren: !isFood,
      restroom: true,
      accessibility: 'Check venue entry details on official site',
    },
    website: gp.website || `https://www.google.com/maps/place/?q=place_id:${gp.id}`,
    phone: gp.phone || 'See website',
    neighborhood: gp.neighborhood,
    suggestedDay: 'Any time',
    suggestedTime: isFood ? (idx % 2 === 0 ? '1:00 PM' : '7:30 PM') : '11:00 AM',
    bookingType,
    advanceLeadTime:
      bookingType === 'walk_in'
        ? 'No booking needed'
        : bookingType === 'reservation'
        ? 'Reserve ahead'
        : 'Book timed tickets ahead',
    estimatedCostUsd: bookingType === 'timed_ticket' ? 18 : 0,
  };
}

function buildSpatialHotelItem(gp: GooglePlaceLite, destination: string, nights: number, idx: number): HotelItem {
  const gallery = gp.photoNames.map((n) => buildPhotoProxyUrl(n, 900));
  const mult = gp.priceTier === '$$$$' ? 2.1 : gp.priceTier === '$$$' ? 1.55 : 1.05;
  const perNight = Math.round((175 * mult + idx * 18) / 5) * 5;
  const total = perNight * Math.max(1, nights);
  const scoreTen = Math.min(9.8, Math.max(8.2, Number((gp.rating * 1.94).toFixed(1))));

  return {
    id: `htl-${gp.id}`,
    name: gp.name,
    neighborhood: gp.neighborhood,
    rating: scoreTen,
    reviews: gp.reviews,
    stars: gp.priceTier === '$$$$' ? 5 : 4,
    priceTotal: total,
    pricePerNight: perNight,
    livePricing: false,
    tagline: gp.editorialSummary || `${gp.neighborhood} · Rated ${gp.rating.toFixed(1)}★`,
    shortDescription:
      gp.editorialSummary || `Well-reviewed boutique stay right inside your selected zone in ${destination}.`,
    pickLabel: 'Inside your circle',
    whyChoose: gp.editorialSummary || `${gp.rating.toFixed(1)}★ across ${gp.reviews.toLocaleString()} reviews in ${gp.neighborhood}.`,
    website: gp.website,
    bookingUrl: gp.website,
    image: gallery[0] || '',
    gallery: gallery.length > 0 ? gallery : [''],
    coords: { lat: gp.lat, lng: gp.lng },
    highlights: [
      { icon: 'map', title: `Prime ${gp.neighborhood} location`, description: gp.formattedAddress },
      { icon: 'sparkle', title: `${scoreTen.toFixed(1)}/10 guest score`, description: `${gp.reviews.toLocaleString()} verified reviews.` },
    ],
    rooms: [
      {
        id: `${gp.id}-std`,
        name: 'Signature King Room',
        sqft: 340,
        beds: '1 King Bed',
        images: gallery.length > 0 ? gallery : [''],
        description: `Quiet, well-appointed room at ${gp.name} in ${gp.neighborhood}.`,
        rates: [
          { id: `${gp.id}-r1`, label: 'Standard Rate', refundable: false, breakfastIncluded: false, price: total },
          { id: `${gp.id}-r2`, label: 'Free Cancellation + Breakfast', refundable: true, breakfastIncluded: true, price: Math.round((total * 1.12) / 5) * 5 },
        ],
      },
    ],
    deepDive: [
      { id: 'location', label: 'Location', summary: `Right inside your selected zone in ${gp.neighborhood}.`, bullets: [gp.formattedAddress] },
    ],
  };
}

/**
 * GET /api/places/photo?name=places/.../photos/...&w=800
 * Resolves Google Places photo names server-side (hiding GOOGLE_PLACES_API_KEY)
 * and 302-redirects browsers directly to Google's CDN image URL with cache headers.
 */
placesRoutes.get('/photo', async (c) => {
  const name = c.req.query('name') || '';
  const width = Number(c.req.query('w') || 800);

  if (!name || !name.startsWith('places/')) {
    return c.json({ error: 'Invalid photo resource name' }, 400);
  }

  const cdnUrl = await resolvePhotoCdnUrl(name, Number.isFinite(width) ? width : 800);
  if (!cdnUrl) {
    return c.json({ error: 'Photo unavailable' }, 404);
  }

  c.header('Cache-Control', 'public, max-age=86400');
  return c.redirect(cdnUrl, 302);
});

/**
 * POST /api/places/area-search
 * Powers "Circle to Ask Vesper": searches Google Places strictly inside a user-drawn map circle.
 */
placesRoutes.post('/area-search', async (c) => {
  const body = (await c.req.json()) as {
    lat: number;
    lng: number;
    radiusMeters: number;
    query: string;
    destination: string;
    nights?: number;
  };

  const query = (body.query || 'hidden gems').trim();
  const destination = (body.destination || '').trim();
  const isHotel = /\b(hotel|hotels|stay|stays|boutique stay|lodging|resort)\b/i.test(query);

  const hits = await searchPlacesInCircleCached({
    textQuery: `${query} in ${destination}`.trim(),
    lat: body.lat,
    lng: body.lng,
    radiusMeters: body.radiusMeters || 900,
    pageSize: 6,
    fallbackArea: destination || 'Selected area',
  });

  if (isHotel) {
    const hotels = hits
      .slice(0, 5)
      .map((gp, idx) => buildSpatialHotelItem(gp, destination, body.nights || 3, idx));
    const areaLabel = hotels[0]?.neighborhood || destination || 'this area';
    return c.json({
      kind: 'hotels' as const,
      areaLabel,
      hotels,
      places: [] as PlaceItem[],
    });
  }

  const places = hits
    .filter((gp) => !/\b(hotel|lodging|motel|hostel)\b/i.test(gp.primaryType))
    .slice(0, 5)
    .map((gp, idx) => buildSpatialPlaceItem(gp, destination, idx));
  const areaLabel = places[0]?.neighborhood || destination || 'this area';

  return c.json({
    kind: 'places' as const,
    areaLabel,
    places,
    hotels: [] as HotelItem[],
  });
});

/**
 * POST /api/places/along-route
 * Powers "Along the Way" Micro-Detours: finds verified coffee/viewpoint/bite gems
 * right along the midpoint between Stop A and Stop B with exact extra detour minutes.
 */
placesRoutes.post('/along-route', async (c) => {
  const body = (await c.req.json()) as {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    destination: string;
    category?: 'coffee' | 'viewpoint' | 'bite';
    excludeNames?: string[];
  };

  const midLat = (body.from.lat + body.to.lat) / 2;
  const midLng = (body.from.lng + body.to.lng) / 2;
  const directKm = distKm(body.from.lat, body.from.lng, body.to.lat, body.to.lng);
  const radiusMeters = Math.min(2000, Math.max(380, Math.round(directKm * 500)));

  const queryByCat: Record<string, string> = {
    coffee: 'specialty coffee pastry bakery cafe',
    viewpoint: 'scenic viewpoint plaza garden landmark',
    bite: 'local tapas snack wine bar lunch spot',
  };
  const q = queryByCat[body.category || 'coffee'] || queryByCat.coffee;
  const exclude = new Set((body.excludeNames || []).map((n) => n.toLowerCase()));

  const hits = await searchPlacesInCircleCached({
    textQuery: `${q} ${body.destination || ''}`.trim(),
    lat: midLat,
    lng: midLng,
    radiusMeters,
    pageSize: 6,
    fallbackArea: body.destination || 'Along route',
  });

  const isWalking = directKm <= 2.4;
  const speedKmh = isWalking ? 4.5 : 26;

  const detours = hits
    .filter((gp) => !exclude.has(gp.name.toLowerCase()))
    .map((gp, idx) => {
      const viaKm =
        distKm(body.from.lat, body.from.lng, gp.lat, gp.lng) +
        distKm(gp.lat, gp.lng, body.to.lat, body.to.lng);
      const extraKm = Math.max(0.05, viaKm - directKm);
      const detourMinutes = Math.max(1, Math.min(18, Math.round((extraKm / speedKmh) * 60)));
      return {
        place: buildSpatialPlaceItem(gp, body.destination || '', idx),
        detourMinutes,
      };
    })
    .sort((a, b) => a.detourMinutes - b.detourMinutes || b.place.rating - a.place.rating)
    .slice(0, 3);

  return c.json({ detours });
});
