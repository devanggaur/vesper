-- ============================================================================
-- Vesper — Phase 4 Migration (`public.profiles` + Auto-Sync Trigger + Backfill)
-- ============================================================================
-- Paste into Supabase Dashboard → SQL Editor → Run.
-- 1. Creates `public.profiles` visible in Table Editor alongside `trips`.
-- 2. Auto-syncs every new or returning Google / Email user from `auth.users`.
-- 3. Immediately backfills existing `auth.users` into `public.profiles`.
-- ============================================================================

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  avatar_url      text,
  home_airport    text not null default 'San Francisco (SFO)',
  preferred_theme text not null default 'twilight',
  default_taste   jsonb,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Keep `updated_at` fresh on profile updates
create or replace function public.set_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

-- Automatically sync new/updated auth.users (Google SSO, Magic Link, Email) into public.profiles
create or replace function public.handle_auth_user_sync()
returns trigger
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, last_seen_at)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    now()
  )
  on conflict (id) do update set
    email        = excluded.email,
    full_name    = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url   = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    last_seen_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_auth_user_sync();

-- Immediately backfill all existing auth.users into public.profiles
insert into public.profiles (id, email, full_name, avatar_url, created_at, last_seen_at)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
  u.created_at,
  coalesce(u.last_sign_in_at, now())
from auth.users u
on conflict (id) do update set
  email        = excluded.email,
  full_name    = coalesce(excluded.full_name, public.profiles.full_name),
  avatar_url   = coalesce(excluded.avatar_url, public.profiles.avatar_url),
  last_seen_at = greatest(public.profiles.last_seen_at, excluded.last_seen_at);
