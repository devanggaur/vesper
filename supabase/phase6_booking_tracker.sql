-- ============================================================================
-- Vesper — Phase 6 Ticket & Reservation Booking Tracker
-- ============================================================================
-- Run in Supabase Dashboard → SQL Editor → Run.
-- Adds `booking_meta` JSONB column to `public.trip_items` so each saved stop
-- tracks whether it is Walk-in vs Ticket Needed vs Booked (+ confirmation #).
-- ============================================================================

alter table public.trip_items
  add column if not exists booking_meta jsonb;
