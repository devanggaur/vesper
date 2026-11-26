-- ============================================================================
-- Vesper — Phase 7 Lightweight Group Collaboration (Votes & Contextual Notes)
-- ============================================================================
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- Adds zero-login group voting (`trip_votes`) and contextual 1-line notes
-- (`trip_notes`) scoped to any hotel, place, or experience on a shared trip.
-- ============================================================================

create table if not exists public.trip_votes (
  trip_id      uuid not null references public.trips(id) on delete cascade,
  entity_id    text not null,
  entity_kind  text not null check (entity_kind in ('hotel', 'place', 'activity')),
  voter_key    text not null,
  voter_name   text not null,
  vote         text not null check (vote in ('up', 'down')),
  created_at   timestamptz not null default now(),
  primary key (trip_id, entity_id, voter_key)
);

create index if not exists trip_votes_trip_id_idx on public.trip_votes (trip_id);

create table if not exists public.trip_notes (
  id           text not null,
  trip_id      uuid not null references public.trips(id) on delete cascade,
  entity_id    text not null,
  entity_kind  text not null check (entity_kind in ('hotel', 'place', 'activity')),
  author_key   text not null,
  author_name  text not null,
  body         text not null,
  created_at   timestamptz not null default now(),
  primary key (trip_id, id)
);

create index if not exists trip_notes_trip_created_idx on public.trip_notes (trip_id, created_at asc);
