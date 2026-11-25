-- ============================================================================
-- Vesper — Phase 2 Migration (Optional User Ownership for Supabase Auth)
-- ============================================================================
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- Safe & idempotent: existing guest trips keep `user_id = null` and continue working.
-- ============================================================================

alter table public.trips
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists trips_user_id_idx on public.trips (user_id, updated_at desc);
