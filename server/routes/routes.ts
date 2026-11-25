import { Hono } from 'hono';
import { z } from 'zod';
import { estimateRouteLegsBatch } from '../services/routing';

export const routingRoutes = new Hono();

const legSchema = z.object({
  id: z.string().min(1),
  from: z.object({ lat: z.number(), lng: z.number() }),
  to: z.object({ lat: z.number(), lng: z.number() }),
});

const batchSchema = z.object({
  legs: z.array(legSchema).max(20),
});

/**
 * POST /api/routes/estimate
 * Batches consecutive timeline stop pairs into real OSRM street/footpath durations,
 * cached 30 days in Supabase `place_cache` ($0/mo routing cost).
 */
routingRoutes.post('/estimate', async (c) => {
  const { legs } = batchSchema.parse(await c.req.json());
  if (legs.length === 0) return c.json({ legs: [] });
  const estimates = await estimateRouteLegsBatch(legs);
  return c.json({ legs: estimates });
});
