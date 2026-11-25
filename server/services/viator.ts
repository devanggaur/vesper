import { config } from '../config';
import { store } from './supabase';

export interface ViatorTicketOffer {
  productCode: string;
  title: string;
  fromPriceUsd: number | null;
  rating: number | null;
  reviewCount: number;
  durationMinutes: number | null;
  productUrl: string;
  imageUrl?: string;
}

interface ViatorFreetextResponse {
  products?: {
    results?: Array<{
      productCode?: string;
      title?: string;
      productUrl?: string;
      pricing?: {
        summary?: {
          fromPrice?: number;
        };
      };
      reviews?: {
        combinedAverageRating?: number;
        totalReviews?: number;
      };
      duration?: {
        fixedDurationInMinutes?: number;
        variableDurationFromMinutes?: number;
      };
      images?: Array<{
        variants?: Array<{ url?: string; width?: number }>;
      }>;
    }>;
  };
}

/**
 * Queries Viator Partner API v2 (`/search/freetext`) using the server-only `VIATOR_API_KEY`
 * with 12-hour Supabase `place_cache` caching. Gracefully returns `[]` if the key is unset,
 * pending activation, or unavailable so affiliate deep-link handoff never breaks.
 */
export async function searchViatorOffersCached(
  venueName: string,
  destination: string,
  limit = 3
): Promise<ViatorTicketOffer[]> {
  if (!config.viatorApiKey) return [];

  const searchTerm = `${venueName} ${destination}`.trim();
  const cacheKey = `viator:freetext:${searchTerm.toLowerCase()}:n${limit}`;
  const cached = await store.getCache<ViatorTicketOffer[]>(cacheKey);
  if (cached) return cached;

  const baseUrls = Array.from(
    new Set([
      config.viatorApiBaseUrl,
      'https://api.viator.com/partner',
      'https://api.sandbox.viator.com/partner',
    ])
  );

  for (const base of baseUrls) {
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/search/freetext`, {
        method: 'POST',
        headers: {
          'exp-api-key': config.viatorApiKey,
          Accept: 'application/json;version=2.0',
          'Accept-Language': 'en-US',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          searchTerm,
          searchTypes: [{ searchType: 'PRODUCTS', pagination: { start: 1, count: limit } }],
          currency: 'USD',
        }),
      });

      if (!res.ok) continue;

      const data = (await res.json()) as ViatorFreetextResponse;
      const rawProducts = data.products?.results || [];
      const offers: ViatorTicketOffer[] = rawProducts
        .filter((p) => Boolean(p.productCode && p.title))
        .map((p) => {
          const baseUrl =
            p.productUrl ||
            `https://www.viator.com/searchResults/all?text=${encodeURIComponent(searchTerm)}`;
          const trackedUrl =
            config.viatorPartnerId && !baseUrl.includes('pid=')
              ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}pid=${encodeURIComponent(config.viatorPartnerId)}`
              : baseUrl;
          const img = p.images?.[0]?.variants?.find((v) => (v.width || 0) >= 400)?.url;

          return {
            productCode: p.productCode!,
            title: p.title!,
            fromPriceUsd: p.pricing?.summary?.fromPrice ?? null,
            rating: p.reviews?.combinedAverageRating ?? null,
            reviewCount: p.reviews?.totalReviews ?? 0,
            durationMinutes:
              p.duration?.fixedDurationInMinutes ?? p.duration?.variableDurationFromMinutes ?? null,
            productUrl: trackedUrl,
            imageUrl: img,
          };
        });

      if (offers.length > 0) {
        await store.setCache(cacheKey, offers, 0.5); // 12-hour TTL
      }
      return offers;
    } catch {
      // Try next base URL or degrade cleanly to affiliate search deep link
    }
  }

  return [];
}
