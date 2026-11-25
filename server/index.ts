import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import fs from 'node:fs';
import path from 'node:path';
import { assertConfig, config } from './config';
import { store } from './services/supabase';
import { tripsRoutes } from './routes/trips';
import { placesRoutes } from './routes/places';
import { routingRoutes } from './routes/routes';
import { bookingsRoutes } from './routes/bookings';
import { profileRoutes } from './routes/profile';

/**
 * Vesper Full-Stack Server (Hono + TypeScript)
 * --------------------------------------------
 * - Development: runs on http://localhost:8787 (proxied via Vite `/api`)
 * - Production (Render / Railway / Docker): serves BOTH `/api/*` endpoints AND the
 *   built Vite SPA (`dist/`, with `/t/:slug` history fallback) from a single origin.
 */

assertConfig();

const app = new Hono();

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.APP_URL ? [process.env.APP_URL] : []),
];

app.use(
  '/api/*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      if (allowedOrigins.includes(origin)) return origin;
      return origin;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

app.onError((err, c) => {
  console.error('[vesper-api] Unhandled error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

app.get('/api/health', async (c) => {
  const db = await store.checkConnection();
  return c.json({
    ok: true,
    service: 'vesper-api',
    env: process.env.NODE_ENV || 'development',
    storageMode: db.mode,
    storageNote: db.reason ?? 'Supabase Postgres connected',
  });
});

app.route('/api/trips', tripsRoutes);
app.route('/api/places', placesRoutes);
app.route('/api/routes', routingRoutes);
app.route('/api/bookings', bookingsRoutes);
app.route('/api/profile', profileRoutes);

// Production single-service SPA static hosting (serves `dist/` + `/t/:slug` fallback)
const distDir = path.resolve(process.cwd(), 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

if (fs.existsSync(indexHtmlPath)) {
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.use('/favicon.ico', serveStatic({ root: './dist' }));

  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Not found' }, 404);
    }
    const html = fs.readFileSync(indexHtmlPath, 'utf-8');
    return c.html(html);
  });
}

async function start() {
  const db = await store.checkConnection();
  console.log(`[vesper-api] Storage mode: ${db.mode}${db.reason ? ` (${db.reason})` : ''}`);

  serve(
    {
      fetch: app.fetch,
      hostname: '0.0.0.0',
      port: config.port,
    },
    (info) => {
      console.log(`[vesper-api] Listening on http://0.0.0.0:${info.port}`);
    }
  );
}

start();
