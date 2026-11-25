import { Hono } from 'hono';
import { resolvePhotoCdnUrl } from '../services/places';

export const placesRoutes = new Hono();

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
