import { Hono } from 'hono';
import { z } from 'zod';
import { store } from '../services/supabase';

export const profileRoutes = new Hono();

/**
 * GET /api/profile
 * Fetches (and lazily syncs) the signed-in user's Vesper profile from `public.profiles`,
 * including their saved home airport, preferred theme, and cross-trip Taste Memory.
 */
profileRoutes.get('/', async (c) => {
  const user = await store.verifyAccessToken(c.req.header('Authorization'));
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const profile = await store.getOrCreateProfile(user);
  return c.json({
    profile: profile
      ? {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          avatarUrl: profile.avatar_url,
          homeAirport: profile.home_airport,
          preferredTheme: profile.preferred_theme,
          defaultTaste: profile.default_taste,
        }
      : {
          id: user.id,
          email: user.email,
          fullName: user.name ?? null,
          avatarUrl: user.avatarUrl ?? null,
          homeAirport: 'San Francisco (SFO)',
          preferredTheme: 'twilight',
          defaultTaste: null,
        },
  });
});

const patchProfileSchema = z.object({
  homeAirport: z.string().min(2).max(80).optional(),
  preferredTheme: z.enum(['twilight', 'nocturne', 'mediterranean']).optional(),
  defaultTaste: z
    .object({
      travelers: z.string(),
      vibes: z.array(z.string()).min(1),
      pace: z.enum(['Unhurried', 'Balanced', 'Packed']),
      splurge: z.enum(['Smart', 'Elevated', 'Iconic']),
    })
    .nullable()
    .optional(),
});

/**
 * PATCH /api/profile
 * Persists cross-trip preferences (home airport, theme, default taste) in `public.profiles`.
 */
profileRoutes.patch('/', async (c) => {
  const user = await store.verifyAccessToken(c.req.header('Authorization'));
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const body = patchProfileSchema.parse(await c.req.json());
  const updated = await store.updateProfile(user, {
    ...(body.homeAirport !== undefined ? { home_airport: body.homeAirport } : {}),
    ...(body.preferredTheme !== undefined ? { preferred_theme: body.preferredTheme } : {}),
    ...(body.defaultTaste !== undefined ? { default_taste: body.defaultTaste } : {}),
  });

  return c.json({
    ok: true,
    profile: updated
      ? {
          id: updated.id,
          email: updated.email,
          fullName: updated.full_name,
          avatarUrl: updated.avatar_url,
          homeAirport: updated.home_airport,
          preferredTheme: updated.preferred_theme,
          defaultTaste: updated.default_taste,
        }
      : null,
  });
});
