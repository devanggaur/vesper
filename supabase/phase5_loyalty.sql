-- ============================================================================
-- Vesper — Phase 5 Migration (`public.profiles.loyalty_programs` Loyalty Wallet)
-- ============================================================================
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- Stores member numbers + program names only (never passwords).
-- ============================================================================

alter table public.profiles
  add column if not exists loyalty_programs jsonb not null default '[]'::jsonb;
