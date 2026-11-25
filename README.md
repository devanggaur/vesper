# Vesper — AI Travel Planning & Booking Workspace

Vesper is a full-stack AI travel planning and booking web application powered by **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, **Framer Motion**, **Google Maps JS API**, **Hono**, **Google Gemini Interactions API**, **Google Places API (New)**, **OSRM Routing**, and **Supabase (Postgres + Auth)**.

---

## Local Development

1. Copy `.env.example` to `.env` and fill in your keys.
2. Run the SQL migrations in your Supabase SQL Editor:
   - [supabase/schema.sql](supabase/schema.sql) (core tables + 14–30 day `place_cache`)
   - [supabase/phase2_auth.sql](supabase/phase2_auth.sql) (optional per-user trip ownership)
3. Start the frontend and backend in two terminals:

```bash
npm install
npm run dev:api   # Hono API on http://localhost:8787
npm run dev       # Vite dev server on http://localhost:5173 (proxies /api -> :8787)
```

---

## Single-Service Production Deployment (Render / Railway / Docker)

In production, `server/index.ts` serves **both** `/api/*` endpoints (including real-time SSE Co-Pilot streaming) and the built Vite SPA (`dist/`, with `/t/:slug` history fallback) from a single Node process.

### Option A — Deploy on Render (Free Tier / Starter)
1. Push this repository to GitHub (`.env` is git-ignored).
2. In Render, click **New + → Blueprint** and select your repo (`render.yaml` auto-configures `npm ci && npm run build`, `npm start`, and `/api/health`).
3. Paste your environment variables in Render's Environment tab (`GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

### Option B — Deploy on Railway (Always-On, Zero Cold Start)
1. Push this repository to GitHub.
2. In Railway, click **New Project → Deploy from GitHub Repo** — Railway detects the `Dockerfile` automatically.
3. Add the same environment variables under **Variables** (Railway injects `PORT` automatically and passes `VITE_*` variables into the Docker build).

### Go-Live Checklist (Once You Have Your Live Domain `https://your-app.onrender.com`)
1. **Supabase Auth Redirect URLs:**
   - Go to **Supabase → Authentication → URL Configuration**.
   - Update **Site URL** to `https://your-app.onrender.com`.
   - Add `https://your-app.onrender.com/**` to **Redirect URLs**.
2. **Google OAuth Consent / Origins:**
   - In Google Cloud Console → **Credentials → OAuth 2.0 Client ID**, add `https://your-app.onrender.com` to **Authorized JavaScript origins** (the Supabase callback URI stays unchanged).
3. **Google Maps Key Restrictions:**
   - Restrict `VITE_GOOGLE_MAPS_API_KEY` by **HTTP Referrer** (`https://your-app.onrender.com/*`) and **Maps JavaScript API** only.
4. **Rotate Development Keys:**
   - Rotate any keys shared during development before sharing your public URL widely.

---

## Architecture Overview

```text
server/
├── index.ts                 # Hono API + production static SPA server (`dist/` + `/t/:slug`)
├── config.ts                # Server-side env config & Gemini model fallback chain
├── services/
│   ├── supabase.ts          # Postgres CRUD, JWT auth verification & TTL `place_cache`
│   ├── gemini.ts            # @google/genai Interactions API (structured JSON + SSE streaming)
│   ├── places.ts            # Google Places API (New) FieldMask client + photo CDN proxy
│   ├── routing.ts           # OSRM street/footpath transit durations (30-day cached)
│   └── bookings.ts          # Multi-destination flights (Amadeus GDS or AI route engine)
└── routes/
    ├── trips.ts             # /api/trips/* (CRUD, /slug/:slug, /compose, /organize, /chat/stream)
    ├── places.ts            # /api/places/photo (cached Google CDN redirect proxy)
    ├── routes.ts            # /api/routes/estimate (batched OSRM leg routing)
    └── bookings.ts          # /api/bookings/flights & /api/bookings/handoff-links

src/
├── App.tsx                  # Root shell: /t/:slug URL routing, Google SSO auth, theme, toasts
├── lib/supabaseClient.ts    # Browser Supabase Auth client
├── services/travelApi.ts    # Typed frontend API & SSE stream client
├── utils/                   # Google Maps loader/styles, geo, time/.ics, inline formatting
├── hooks/                   # Voice dictation hook
└── components/
    ├── common/              # BrandMark, SmartImage, ThemeSwitcher, TripSidebar, AuthModal
    ├── landing/             # Horizon universal homepage & DateRangePicker
    └── workspace/           # WorkspaceView, CoPilotRail, TasteCard, Discover, Timeline, Map, Bookings
```
