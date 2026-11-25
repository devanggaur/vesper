-- ============================================================================
-- Vesper — Phase 1 & 2 Supabase Postgres Schema
-- ============================================================================
-- Paste this entire file into your Supabase Dashboard → SQL Editor → Run.
-- It creates:
--   1. `trips`          — Trip metadata, destination center, taste profile, cached catalog
--   2. `trip_items`     — Saved places, activities, hotels, and flights per trip
--   3. `chat_messages`  — Persistent Vesper Co-Pilot conversation history
--   4. `place_cache`    — 14–30 day Google Places API cache (cuts API bills by ~85%)
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Trips
create table if not exists public.trips (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  title               text not null,
  destination         text not null,
  country             text not null default '',
  prompt              text not null,
  dates_label         text not null default 'Weekend getaway',
  day_labels          jsonb not null default '["Day 1", "Day 2", "Day 3"]'::jsonb,
  center_lat          double precision not null default 19.426,
  center_lng          double precision not null default -99.172,
  hero_image          text not null default '',
  travelers           text not null default '2 adults',
  taste_profile       jsonb,
  catalog             jsonb,
  last_interaction_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists trips_updated_at_idx on public.trips (updated_at desc);

-- 2. Saved Trip Items (Places, Activities, Hotels, Flights)
create table if not exists public.trip_items (
  trip_id        uuid not null references public.trips(id) on delete cascade,
  id             text not null,
  ref_id         text not null,
  type           text not null check (type in ('activity', 'place', 'hotel', 'flight')),
  title          text not null,
  subtitle       text,
  image          text not null default '',
  day            text not null default 'Any time',
  time           text,
  price          numeric,
  coords         jsonb,
  flight_details jsonb,
  hotel_details  jsonb,
  created_at     timestamptz not null default now(),
  primary key (trip_id, id)
);

create index if not exists trip_items_trip_id_idx on public.trip_items (trip_id);

-- 3. Persistent Co-Pilot Chat Messages
create table if not exists public.chat_messages (
  trip_id    uuid not null references public.trips(id) on delete cascade,
  id         text not null,
  role       text not null check (role in ('user', 'assistant')),
  text       text,
  blocks     jsonb,
  created_at timestamptz not null default now(),
  primary key (trip_id, id)
);

create index if not exists chat_messages_trip_created_idx on public.chat_messages (trip_id, created_at asc);

-- 4. Cost-Saving Google Places Cache (TTL-based)
create table if not exists public.place_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists place_cache_expires_idx on public.place_cache (expires_at);

-- Auto-update `updated_at` on trips
create or replace function public.set_trips_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_trips_updated_at on public.trips;
create trigger trg_trips_updated_at
  before update on public.trips
  for each row execute function public.set_trips_updated_at();
