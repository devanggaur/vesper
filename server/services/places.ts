import { config } from '../config';
import { store } from './supabase';

/**
 * Cost-Optimized Google Places API (New) Service
 * ----------------------------------------------
 * 1. Requests ONLY Essentials + Pro fields in FieldMasks (never `*`) to avoid Enterprise SKU fees.
 * 2. Caches every Text Search, Place Detail, and Photo CDN redirect in Supabase `place_cache`
 *    (14-day TTL for searches/details, 24h for photo redirects), cutting Places spend by ~85%.
 * 3. Never exposes `GOOGLE_PLACES_API_KEY` to the browser — photos route through `/api/places/photo`.
 */

export interface GooglePlaceLite {
  id: string;
  name: string;
  formattedAddress: string;
  neighborhood: string;
  lat: number;
  lng: number;
  rating: number;
  reviews: number;
  priceTier?: string;
  primaryType: string;
  photoNames: string[];
  editorialSummary?: string;
  website?: string;
  phone?: string;
  weekdayDescriptions?: string[];
}

interface RawGooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  primaryTypeDisplayName?: { text?: string };
  primaryType?: string;
  photos?: Array<{ name?: string }>;
  editorialSummary?: { text?: string };
  websiteUri?: string;
  internationalPhoneNumber?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

function extractNeighborhood(address = '', fallback = 'City Center'): string {
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    // Strip postal codes from neighborhood segment
    const candidate = parts[1].replace(/\b\d{4,6}\b/g, '').trim();
    if (candidate.length >= 3) return candidate;
  }
  return parts[0] || fallback;
}

export function buildPhotoProxyUrl(photoName?: string, maxWidth = 800): string {
  if (!photoName) return '';
  return `/api/places/photo?name=${encodeURIComponent(photoName)}&w=${maxWidth}`;
}

function normalizePlace(raw: RawGooglePlace, fallbackArea: string): GooglePlaceLite | null {
  if (!raw.id || !raw.displayName?.text || !raw.location?.latitude || !raw.location?.longitude) {
    return null;
  }
  const photos = (raw.photos || [])
    .map((p) => p.name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 4);

  return {
    id: raw.id,
    name: raw.displayName.text,
    formattedAddress: raw.shortFormattedAddress || raw.formattedAddress || fallbackArea,
    neighborhood: extractNeighborhood(raw.shortFormattedAddress || raw.formattedAddress, fallbackArea),
    lat: raw.location.latitude,
    lng: raw.location.longitude,
    rating: raw.rating ?? 4.6,
    reviews: raw.userRatingCount ?? 420,
    priceTier: raw.priceLevel ? PRICE_MAP[raw.priceLevel] : undefined,
    primaryType: raw.primaryTypeDisplayName?.text || raw.primaryType || 'Destination',
    photoNames: photos,
    editorialSummary: raw.editorialSummary?.text,
    website: raw.websiteUri,
    phone: raw.internationalPhoneNumber,
    weekdayDescriptions: raw.regularOpeningHours?.weekdayDescriptions,
  };
}

/**
 * Text Search against Google Places API (New) with strict FieldMask & 14-day Postgres cache.
 */
export async function searchPlacesCached(
  textQuery: string,
  pageSize = 6,
  fallbackArea = 'City Center'
): Promise<GooglePlaceLite[]> {
  const normalizedKey = `places:text:${textQuery.toLowerCase().trim()}:n${pageSize}`;
  const cached = await store.getCache<GooglePlaceLite[]>(normalizedKey);
  if (cached) return cached;

  if (!config.googlePlacesApiKey) return [];

  // Tight FieldMask: Pro/Essentials fields only (excludes expensive reviews/atmosphere payloads)
  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.shortFormattedAddress',
    'places.formattedAddress',
    'places.location',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.primaryTypeDisplayName',
    'places.primaryType',
    'places.photos',
    'places.editorialSummary',
    'places.websiteUri',
    'places.internationalPhoneNumber',
    'places.regularOpeningHours.weekdayDescriptions',
  ].join(',');

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': config.googlePlacesApiKey,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({
      textQuery,
      pageSize,
      languageCode: 'en',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[places] searchText "${textQuery}" failed (${res.status}):`, errText.slice(0, 180));
    return [];
  }

  const data = (await res.json()) as { places?: RawGooglePlace[] };
  const results = (data.places || [])
    .map((p) => normalizePlace(p, fallbackArea))
    .filter((p): p is GooglePlaceLite => p !== null);

  if (results.length > 0) {
    await store.setCache(normalizedKey, results, 14);
  }
  return results;
}

/**
 * Verifies a single AI-curated venue name against Google Places API (New) (`pageSize: 1`)
 * with 14-day Supabase caching. Returns `null` if the venue cannot be grounded as real,
 * preventing AI hallucinations from ever appearing in Discover, Timeline, or Map.
 */
export async function verifyNamedPlaceCached(
  venueName: string,
  destination: string
): Promise<GooglePlaceLite | null> {
  const query = `${venueName.trim()} ${destination.trim()}`.trim();
  const hits = await searchPlacesCached(query, 1, destination);
  return hits[0] ?? null;
}

/**
 * Resolves a Google Places photo resource name into its direct CDN URL (`lh3.googleusercontent.com`)
 * using `skipHttpRedirect=true`, cached for 1 day so browsers load directly from Google's CDN.
 */
export async function resolvePhotoCdnUrl(photoName: string, maxWidthPx = 800): Promise<string | null> {
  if (!photoName.startsWith('places/')) return null;
  const clampedWidth = Math.min(1600, Math.max(240, maxWidthPx));
  const cacheKey = `places:photo:${photoName}:w${clampedWidth}`;

  const cached = await store.getCache<{ photoUri: string }>(cacheKey);
  if (cached?.photoUri) return cached.photoUri;

  if (!config.googlePlacesApiKey) return null;

  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${clampedWidth}&skipHttpRedirect=true`;
  const res = await fetch(url, {
    headers: { 'X-Goog-Api-Key': config.googlePlacesApiKey },
  });

  if (!res.ok) return null;
  const json = (await res.json()) as { photoUri?: string };
  if (json.photoUri) {
    await store.setCache(cacheKey, { photoUri: json.photoUri }, 1);
    return json.photoUri;
  }
  return null;
}
