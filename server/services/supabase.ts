import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { config } from '../config';
import type { ChatMessage, TripNote, TripSavedItem, TripVote } from '../../src/types/travel';

export interface TripDayRecord {
  key: string;
  short: string;
  themeLabel: string;
  dotColor: string;
}

export interface VerifiedAuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface StoredProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  home_airport: string;
  preferred_theme: string;
  default_taste: Record<string, unknown> | null;
  loyalty_programs?: Array<{
    id: string;
    category: 'hotel' | 'airline';
    provider: string;
    programName: string;
    memberNumber: string;
    tier?: string;
  }>;
  last_seen_at: string;
}

export interface StoredTrip {
  id: string;
  slug: string;
  user_id?: string | null;
  title: string;
  destination: string;
  country: string;
  prompt: string;
  dates_label: string;
  day_labels: TripDayRecord[];
  center_lat: number;
  center_lng: number;
  hero_image: string;
  travelers: string;
  taste_profile: Record<string, unknown> | null;
  catalog: Record<string, unknown> | null;
  last_interaction_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Supabase Postgres persistence & cache client.
 *
 * Gracefully degrades to an in-memory store if `supabase/schema.sql` has not yet been
 * executed in the Supabase SQL Editor, so local dev & testing never hard-crash.
 */
class VesperStore {
  private client: SupabaseClient | null = null;
  private dbReady = false;
  private checkedSchema = false;

  // Fallback in-memory stores (used automatically if schema.sql hasn't been applied yet)
  private memTrips = new Map<string, StoredTrip>();
  private memItems = new Map<string, TripSavedItem[]>();
  private memMessages = new Map<string, ChatMessage[]>();
  private memVotes = new Map<string, TripVote[]>();
  private memNotes = new Map<string, TripNote[]>();
  private memCache = new Map<string, { payload: unknown; expiresAt: number }>();

  constructor() {
    if (config.supabaseUrl && config.supabaseServiceRoleKey) {
      this.client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
  }

  /** Probes whether `public.trips` exists in Supabase and caches the result. */
  async checkConnection(): Promise<{ mode: 'supabase' | 'memory'; reason?: string }> {
    if (!this.client) {
      return { mode: 'memory', reason: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' };
    }
    const { error } = await this.client.from('trips').select('id').limit(1);
    this.checkedSchema = true;
    if (!error) {
      this.dbReady = true;
      return { mode: 'supabase' };
    }
    this.dbReady = false;
    return {
      mode: 'memory',
      reason: `Supabase connected, but tables not created yet (${error.code}: ${error.message}). Run supabase/schema.sql in Supabase SQL Editor.`,
    };
  }

  private async ensureChecked(): Promise<boolean> {
    if (!this.checkedSchema) {
      await this.checkConnection();
    }
    return this.dbReady && this.client !== null;
  }

  /* ── Place Cache (14-day TTL in Supabase `place_cache`) ──────────────── */

  async getCache<T>(key: string): Promise<T | null> {
    const now = Date.now();
    const mem = this.memCache.get(key);
    if (mem && mem.expiresAt > now) {
      return mem.payload as T;
    }

    if (await this.ensureChecked()) {
      const { data, error } = await this.client!
        .from('place_cache')
        .select('payload, expires_at')
        .eq('cache_key', key)
        .maybeSingle();

      if (!error && data && new Date(data.expires_at).getTime() > now) {
        this.memCache.set(key, {
          payload: data.payload,
          expiresAt: new Date(data.expires_at).getTime(),
        });
        return data.payload as T;
      }
    }
    return null;
  }

  async setCache(key: string, payload: unknown, ttlDays = 14): Promise<void> {
    const expiresAtMs = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
    this.memCache.set(key, { payload, expiresAt: expiresAtMs });

    if (await this.ensureChecked()) {
      await this.client!
        .from('place_cache')
        .upsert(
          {
            cache_key: key,
            payload,
            expires_at: new Date(expiresAtMs).toISOString(),
          },
          { onConflict: 'cache_key' }
        );
    }
  }

  /** Verifies an incoming `Authorization: Bearer <token>` header against Supabase Auth. */
  async verifyAccessToken(authHeader?: string): Promise<VerifiedAuthUser | null> {
    if (!this.client || !authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    try {
      const { data, error } = await this.client.auth.getUser(token);
      if (error || !data?.user) return null;
      const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
      return {
        id: data.user.id,
        email: data.user.email || '',
        name:
          (typeof meta.full_name === 'string' && meta.full_name) ||
          (typeof meta.name === 'string' && meta.name) ||
          undefined,
        avatarUrl:
          (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
          (typeof meta.picture === 'string' && meta.picture) ||
          undefined,
      };
    } catch {
      return null;
    }
  }

  /* ── User Profiles (`public.profiles`) ───────────────────────────────── */

  async getOrCreateProfile(user: VerifiedAuthUser): Promise<StoredProfile | null> {
    if (!(await this.ensureChecked())) return null;

    const { data: existing, error: selErr } = await this.client!
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (selErr) {
      // Gracefully ignore if `phase4_profiles.sql` hasn't been executed yet
      return null;
    }

    if (existing) {
      // Refresh `last_seen_at` quietly in the background
      this.client!
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', user.id)
        .then(() => {});
      return existing as StoredProfile;
    }

    const { data: created, error: insErr } = await this.client!
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name: user.name ?? null,
          avatar_url: user.avatarUrl ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select('*')
      .maybeSingle();

    if (insErr || !created) return null;
    return created as StoredProfile;
  }

  async updateProfile(
    user: VerifiedAuthUser,
    patch: {
      home_airport?: string;
      preferred_theme?: string;
      default_taste?: Record<string, unknown> | null;
      loyalty_programs?: StoredProfile['loyalty_programs'];
    }
  ): Promise<StoredProfile | null> {
    if (!(await this.ensureChecked())) return null;

    let { data, error } = await this.client!
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name: user.name ?? null,
          avatar_url: user.avatarUrl ?? null,
          ...patch,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select('*')
      .maybeSingle();

    // Gracefully retry without `loyalty_programs` if `phase5_loyalty.sql` hasn't run yet
    if (error && patch.loyalty_programs !== undefined && error.message?.includes('loyalty_programs')) {
      const { loyalty_programs: _ignored, ...restPatch } = patch;
      const retry = await this.client!
        .from('profiles')
        .upsert(
          {
            id: user.id,
            email: user.email,
            full_name: user.name ?? null,
            avatar_url: user.avatarUrl ?? null,
            ...restPatch,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select('*')
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) return null;
    return data as StoredProfile;
  }

  /* ── Trips CRUD ──────────────────────────────────────────────────────── */

  async createTrip(
    input: Omit<StoredTrip, 'id' | 'slug' | 'created_at' | 'updated_at'>,
    userId?: string | null
  ): Promise<StoredTrip> {
    const now = new Date().toISOString();
    const slugBase = input.destination
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 28);
    const slug = `${slugBase || 'trip'}-${crypto.randomBytes(3).toString('hex')}`;

    if (await this.ensureChecked()) {
      const rowToInsert = userId ? { ...input, slug, user_id: userId } : { ...input, slug };
      let { data, error } = await this.client!
        .from('trips')
        .insert(rowToInsert)
        .select('*')
        .single();

      // If `phase2_auth.sql` hasn't been applied yet (`user_id` column missing), retry cleanly without it
      if (error && userId && error.message?.includes('user_id')) {
        const retry = await this.client!
          .from('trips')
          .insert({ ...input, slug })
          .select('*')
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (!error && data) {
        return data as StoredTrip;
      }
      console.warn('[vesper-store] Supabase insert failed, falling back to memory:', error?.message);
    }

    const record: StoredTrip = {
      ...input,
      user_id: userId ?? null,
      id: crypto.randomUUID(),
      slug,
      created_at: now,
      updated_at: now,
    };
    this.memTrips.set(record.id, record);
    return record;
  }

  async listTrips(limit = 20, userId?: string | null): Promise<StoredTrip[]> {
    if (await this.ensureChecked()) {
      if (userId) {
        const { data, error } = await this.client!
          .from('trips')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(limit);
        if (!error && data) return data as StoredTrip[];
        // Fall through to recent trips if `user_id` column hasn't been migrated yet
      }

      const { data, error } = await this.client!
        .from('trips')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (!error && data) return data as StoredTrip[];
    }
    return Array.from(this.memTrips.values())
      .filter((t) => (!userId ? true : t.user_id === userId || !t.user_id))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit);
  }

  async getTrip(id: string): Promise<StoredTrip | null> {
    if (await this.ensureChecked()) {
      const { data, error } = await this.client!
        .from('trips')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!error && data) return data as StoredTrip;
    }
    return this.memTrips.get(id) ?? null;
  }

  async getTripBySlug(slug: string): Promise<StoredTrip | null> {
    if (await this.ensureChecked()) {
      const { data, error } = await this.client!
        .from('trips')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      if (!error && data) return data as StoredTrip;
    }
    for (const trip of this.memTrips.values()) {
      if (trip.slug === slug) return trip;
    }
    return null;
  }

  async claimTrip(tripId: string, userId: string): Promise<boolean> {
    if (await this.ensureChecked()) {
      const { error } = await this.client!
        .from('trips')
        .update({ user_id: userId })
        .eq('id', tripId)
        .is('user_id', null);
      if (!error) return true;
    }
    const existing = this.memTrips.get(tripId);
    if (existing && !existing.user_id) {
      existing.user_id = userId;
      return true;
    }
    return false;
  }

  async updateTrip(id: string, patch: Partial<StoredTrip>): Promise<StoredTrip | null> {
    if (await this.ensureChecked()) {
      const { data, error } = await this.client!
        .from('trips')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (!error && data) return data as StoredTrip;
    }
    const existing = this.memTrips.get(id);
    if (!existing) return null;
    const updated: StoredTrip = { ...existing, ...patch, updated_at: new Date().toISOString() };
    this.memTrips.set(id, updated);
    return updated;
  }

  /* ── Trip Items ──────────────────────────────────────────────────────── */

  async getTripItems(tripId: string): Promise<TripSavedItem[]> {
    if (await this.ensureChecked()) {
      const { data, error } = await this.client!
        .from('trip_items')
        .select('*')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true });
      if (!error && data) {
        return data.map((row) => ({
          id: row.id,
          refId: row.ref_id,
          type: row.type,
          title: row.title,
          subtitle: row.subtitle ?? undefined,
          image: row.image || '',
          day: row.day || 'Any time',
          time: row.time ?? undefined,
          price: row.price !== null && row.price !== undefined ? Number(row.price) : undefined,
          coords: row.coords ?? undefined,
          flightDetails: row.flight_details ?? undefined,
          hotelDetails: row.hotel_details ?? undefined,
          bookingMeta: row.booking_meta ?? undefined,
        }));
      }
    }
    return this.memItems.get(tripId) ?? [];
  }

  async replaceTripItems(tripId: string, items: TripSavedItem[]): Promise<TripSavedItem[]> {
    this.memItems.set(tripId, items);

    if (await this.ensureChecked()) {
      await this.client!.from('trip_items').delete().eq('trip_id', tripId);
      if (items.length > 0) {
        const rows = items.map((item) => ({
          trip_id: tripId,
          id: item.id,
          ref_id: item.refId,
          type: item.type,
          title: item.title,
          subtitle: item.subtitle ?? null,
          image: item.image || '',
          day: item.day || 'Any time',
          time: item.time ?? null,
          price: item.price ?? null,
          coords: item.coords ?? null,
          flight_details: item.flightDetails ?? null,
          hotel_details: item.hotelDetails ?? null,
          booking_meta: item.bookingMeta ?? null,
        }));
        const { error } = await this.client!.from('trip_items').insert(rows);
        if (error && error.message?.includes('booking_meta')) {
          const fallbackRows = rows.map(({ booking_meta: _ignored, ...rest }) => rest);
          const retry = await this.client!.from('trip_items').insert(fallbackRows);
          if (retry.error) console.warn('[vesper-store] replaceTripItems retry error:', retry.error.message);
        } else if (error) {
          console.warn('[vesper-store] replaceTripItems error:', error.message);
        }
      }
    }
    return items;
  }

  /* ── Chat Messages ───────────────────────────────────────────────────── */

  async getMessages(tripId: string): Promise<ChatMessage[]> {
    if (await this.ensureChecked()) {
      const { data, error } = await this.client!
        .from('chat_messages')
        .select('id, role, text, blocks')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true });
      if (!error && data) return data as ChatMessage[];
    }
    return this.memMessages.get(tripId) ?? [];
  }

  async appendMessages(tripId: string, messages: ChatMessage[]): Promise<void> {
    const existing = this.memMessages.get(tripId) ?? [];
    this.memMessages.set(tripId, [...existing, ...messages]);

    if (await this.ensureChecked() && messages.length > 0) {
      const rows = messages.map((m) => ({
        trip_id: tripId,
        id: m.id,
        role: m.role,
        text: m.text ?? null,
        blocks: m.blocks ?? null,
      }));
      const { error } = await this.client!
        .from('chat_messages')
        .upsert(rows, { onConflict: 'trip_id,id' });
      if (error) console.warn('[vesper-store] appendMessages error:', error.message);
    }
  }

  /* ── Group Collaboration: Votes & Contextual Notes ────────────────────── */

  async getTripVotes(tripId: string): Promise<TripVote[]> {
    if (await this.ensureChecked()) {
      const { data, error } = await this.client!
        .from('trip_votes')
        .select('entity_id, entity_kind, voter_key, voter_name, vote, created_at')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true });
      if (!error && data) {
        const mapped: TripVote[] = data.map((row) => ({
          entityId: row.entity_id,
          entityKind: row.entity_kind,
          voterKey: row.voter_key,
          voterName: row.voter_name,
          vote: row.vote,
          createdAt: row.created_at,
        }));
        this.memVotes.set(tripId, mapped);
        return mapped;
      }
    }
    return this.memVotes.get(tripId) ?? [];
  }

  async setTripVote(
    tripId: string,
    params: {
      entityId: string;
      entityKind: 'hotel' | 'place' | 'activity';
      voterKey: string;
      voterName: string;
      vote: 'up' | 'down' | 'clear';
    }
  ): Promise<TripVote[]> {
    const existing = await this.getTripVotes(tripId);
    const filtered = existing.filter(
      (v) => !(v.entityId === params.entityId && v.voterKey === params.voterKey)
    );
    const next: TripVote[] =
      params.vote === 'clear'
        ? filtered
        : [
            ...filtered,
            {
              entityId: params.entityId,
              entityKind: params.entityKind,
              voterKey: params.voterKey,
              voterName: params.voterName,
              vote: params.vote,
              createdAt: new Date().toISOString(),
            },
          ];
    this.memVotes.set(tripId, next);

    if (await this.ensureChecked()) {
      if (params.vote === 'clear') {
        await this.client!
          .from('trip_votes')
          .delete()
          .eq('trip_id', tripId)
          .eq('entity_id', params.entityId)
          .eq('voter_key', params.voterKey);
      } else {
        await this.client!.from('trip_votes').upsert(
          {
            trip_id: tripId,
            entity_id: params.entityId,
            entity_kind: params.entityKind,
            voter_key: params.voterKey,
            voter_name: params.voterName,
            vote: params.vote,
          },
          { onConflict: 'trip_id,entity_id,voter_key' }
        );
      }
    }
    return next;
  }

  async getTripNotes(tripId: string): Promise<TripNote[]> {
    if (await this.ensureChecked()) {
      const { data, error } = await this.client!
        .from('trip_notes')
        .select('id, entity_id, entity_kind, author_key, author_name, body, created_at')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: true });
      if (!error && data) {
        const mapped: TripNote[] = data.map((row) => ({
          id: row.id,
          entityId: row.entity_id,
          entityKind: row.entity_kind,
          authorKey: row.author_key,
          authorName: row.author_name,
          body: row.body,
          createdAt: row.created_at,
        }));
        this.memNotes.set(tripId, mapped);
        return mapped;
      }
    }
    return this.memNotes.get(tripId) ?? [];
  }

  async addTripNote(
    tripId: string,
    params: {
      entityId: string;
      entityKind: 'hotel' | 'place' | 'activity';
      authorKey: string;
      authorName: string;
      body: string;
    }
  ): Promise<TripNote[]> {
    const existing = await this.getTripNotes(tripId);
    const note: TripNote = {
      id: `note-${crypto.randomBytes(4).toString('hex')}`,
      entityId: params.entityId,
      entityKind: params.entityKind,
      authorKey: params.authorKey,
      authorName: params.authorName,
      body: params.body.trim(),
      createdAt: new Date().toISOString(),
    };
    const next = [...existing, note];
    this.memNotes.set(tripId, next);

    if (await this.ensureChecked()) {
      await this.client!.from('trip_notes').insert({
        id: note.id,
        trip_id: tripId,
        entity_id: note.entityId,
        entity_kind: note.entityKind,
        author_key: note.authorKey,
        author_name: note.authorName,
        body: note.body,
      });
    }
    return next;
  }

  async deleteTripNote(tripId: string, noteId: string, authorKey: string): Promise<TripNote[]> {
    const existing = await this.getTripNotes(tripId);
    const next = existing.filter((n) => !(n.id === noteId && n.authorKey === authorKey));
    this.memNotes.set(tripId, next);

    if (await this.ensureChecked()) {
      await this.client!
        .from('trip_notes')
        .delete()
        .eq('trip_id', tripId)
        .eq('id', noteId)
        .eq('author_key', authorKey);
    }
    return next;
  }
}

export const store = new VesperStore();
