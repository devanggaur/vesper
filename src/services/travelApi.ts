/**
 * Vesper Travel API Client
 * ------------------------
 * Centralized data & AI service layer connecting the React frontend to the Hono backend
 * (`/api/trips/*`, `/api/places/*`, backed by Gemini + Google Places New + Supabase Postgres).
 *
 * Includes local seed fallback helpers so the UI remains resilient even if the API server
 * is offline during static preview builds.
 */

import {
  ACTIVITIES,
  FARE_CLASSES,
  HOTELS,
  MEXICO_CITY_HERO_IMAGE,
  OUTBOUND_FLIGHTS,
  PLACES,
  RETURN_FLIGHTS,
} from '../data/mockData';
import {
  ActivityItem,
  ChatMessage,
  CoPilotAction,
  Coordinates,
  FareClass,
  FlightOption,
  HotelItem,
  LiveTripMetadata,
  LoyaltyProgramEntry,
  PlaceItem,
  TripCatalogPayload,
  TripDayMeta,
  TripNote,
  TripSavedItem,
  TripSummary,
  TripVote,
} from '../types/travel';
import { getAccessToken } from '../lib/supabaseClient';

export interface RouteLegEstimate {
  id: string;
  mode: 'walk' | 'drive';
  minutes: number;
  distanceKm: number;
  label: string;
  source: 'osrm' | 'estimate';
  geometry?: Coordinates[];
}

export interface DiscoverCatalog {
  activities: ActivityItem[];
  places: PlaceItem[];
}

export interface FlightSearchResponse {
  fromCity?: string;
  toCity?: string;
  fromCode?: string;
  toCode?: string;
  outboundDate?: string;
  returnDate?: string;
  outbound: FlightOption[];
  inbound: FlightOption[];
  fareClasses: FareClass[];
  providerBookingUrl?: string;
  source?: 'serpapi' | 'amadeus' | 'estimated';
}

export interface LiveHotelSearchResponse {
  hotels: HotelItem[];
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  googleHotelsUrl: string;
  source: 'serpapi' | 'curated';
}

export interface HandoffLinkInfo {
  label: string;
  url: string;
  secondaryLabel?: string;
  secondaryUrl?: string;
}

export interface UserPreferencesProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  homeAirport: string;
  preferredTheme: 'twilight' | 'nocturne' | 'mediterranean';
  defaultTaste: {
    travelers: string;
    vibes: string[];
    pace: 'Unhurried' | 'Balanced' | 'Packed';
    splurge: 'Smart' | 'Elevated' | 'Iconic';
  } | null;
  loyaltyPrograms: LoyaltyProgramEntry[];
}

export const DEFAULT_CDMX_DAYS: TripDayMeta[] = [
  { key: 'Fri, Jun 19', short: 'Fri', themeLabel: 'Centro & Roma Norte', dotColor: '#C05A2B' },
  { key: 'Sat, Jun 20', short: 'Sat', themeLabel: 'Chapultepec & Polanco', dotColor: '#2563EB' },
  { key: 'Sun, Jun 21', short: 'Sun', themeLabel: 'Polanco Art & Departure', dotColor: '#0F766E' },
];

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errBody || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const travelApi = {
  /* ── Live Backend Endpoints ──────────────────────────────────────────── */

  async createTrip(payload: {
    prompt: string;
    datesLabel: string;
    travelers: string;
  }): Promise<{ trip: LiveTripMetadata; messages: ChatMessage[] }> {
    return apiFetch('/api/trips', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async listTrips(): Promise<TripSummary[]> {
    const res = await apiFetch<{ trips: TripSummary[] }>('/api/trips');
    return res.trips || [];
  },

  async getTrip(tripId: string): Promise<{
    trip: LiveTripMetadata;
    items: TripSavedItem[];
    messages: ChatMessage[];
    votes?: TripVote[];
    notes?: TripNote[];
  }> {
    return apiFetch(`/api/trips/${encodeURIComponent(tripId)}`);
  },

  async getTripBySlug(slug: string): Promise<{
    trip: LiveTripMetadata;
    items: TripSavedItem[];
    messages: ChatMessage[];
    votes?: TripVote[];
    notes?: TripNote[];
  }> {
    return apiFetch(`/api/trips/slug/${encodeURIComponent(slug)}`);
  },

  async setTripVote(
    tripId: string,
    payload: {
      entityId: string;
      entityKind: 'hotel' | 'place' | 'activity';
      voterKey: string;
      voterName: string;
      vote: 'up' | 'down' | 'clear';
    }
  ): Promise<TripVote[]> {
    const res = await apiFetch<{ votes: TripVote[] }>(
      `/api/trips/${encodeURIComponent(tripId)}/votes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.votes || [];
  },

  async addTripNote(
    tripId: string,
    payload: {
      entityId: string;
      entityKind: 'hotel' | 'place' | 'activity';
      authorKey: string;
      authorName: string;
      body: string;
    }
  ): Promise<TripNote[]> {
    const res = await apiFetch<{ notes: TripNote[] }>(
      `/api/trips/${encodeURIComponent(tripId)}/notes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.notes || [];
  },

  async deleteTripNote(tripId: string, noteId: string, authorKey: string): Promise<TripNote[]> {
    const res = await apiFetch<{ notes: TripNote[] }>(
      `/api/trips/${encodeURIComponent(tripId)}/notes/${encodeURIComponent(noteId)}?authorKey=${encodeURIComponent(authorKey)}`,
      {
        method: 'DELETE',
      }
    );
    return res.notes || [];
  },

  async claimTrip(tripId: string): Promise<{ ok: boolean }> {
    return apiFetch(`/api/trips/${encodeURIComponent(tripId)}/claim`, {
      method: 'POST',
    });
  },

  async getProfile(): Promise<UserPreferencesProfile | null> {
    const res = await apiFetch<{ profile: UserPreferencesProfile | null }>('/api/profile');
    return res.profile;
  },

  async updateProfile(patch: {
    homeAirport?: string;
    preferredTheme?: 'twilight' | 'nocturne' | 'mediterranean';
    defaultTaste?: UserPreferencesProfile['defaultTaste'];
    loyaltyPrograms?: LoyaltyProgramEntry[];
  }): Promise<UserPreferencesProfile | null> {
    const res = await apiFetch<{ profile: UserPreferencesProfile | null }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return res.profile;
  },

  async estimateRoutes(
    legs: Array<{ id: string; from: Coordinates; to: Coordinates }>,
    options?: { includeGeometry?: boolean }
  ): Promise<RouteLegEstimate[]> {
    if (legs.length === 0) return [];
    const res = await apiFetch<{ legs: RouteLegEstimate[] }>('/api/routes/estimate', {
      method: 'POST',
      body: JSON.stringify({ legs, includeGeometry: Boolean(options?.includeGeometry) }),
    });
    return res.legs || [];
  },

  async searchFlights(payload: {
    fromCity: string;
    toCity: string;
    datesLabel: string;
    startDate?: string;
    endDate?: string;
    adults: number;
    preferredAirlines?: string[];
  }): Promise<FlightSearchResponse> {
    return apiFetch<FlightSearchResponse>('/api/bookings/flights', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async searchReturnFlights(payload: {
    fromCity: string;
    toCity: string;
    outboundDate: string;
    returnDate: string;
    adults: number;
    departureToken: string;
    preferredAirlines?: string[];
  }): Promise<{ inbound: FlightOption[]; providerBookingUrl: string | null }> {
    return apiFetch('/api/bookings/flights/return', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async searchHotels(payload: {
    destination: string;
    datesLabel: string;
    startDate?: string;
    endDate?: string;
    adults: number;
    queryOverride?: string;
    preferredChains?: string[];
  }): Promise<LiveHotelSearchResponse> {
    return apiFetch<LiveHotelSearchResponse>('/api/bookings/hotels', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getHandoffLinks(payload: {
    destination: string;
    datesLabel: string;
    items: Array<{
      id: string;
      type: TripSavedItem['type'];
      title: string;
      fromCode?: string;
      toCode?: string;
      bookingType?: 'walk_in' | 'timed_ticket' | 'guided_tour' | 'reservation';
      officialUrl?: string;
    }>;
  }): Promise<Record<string, HandoffLinkInfo>> {
    const res = await apiFetch<{ links: Record<string, HandoffLinkInfo> }>(
      '/api/bookings/handoff-links',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.links || {};
  },

  async composeTrip(
    tripId: string,
    taste: {
      travelers: string;
      vibes: string[];
      pace: 'Unhurried' | 'Balanced' | 'Packed';
      splurge: 'Smart' | 'Elevated' | 'Iconic';
      tripMode?: 'city' | 'roadtrip';
      roadTrip?: {
        startCity: string;
        transportMode: 'drive_home' | 'fly_drive';
        maxDriveHoursPerDay: 'under_2h' | '2_to_4h' | '4h_plus';
        overnightTowns?: string[];
      };
      loyaltyPrograms?: LoyaltyProgramEntry[];
    }
  ): Promise<{
    catalog: TripCatalogPayload;
    days?: TripDayMeta[];
    tripMode?: 'city' | 'roadtrip';
    center: Coordinates;
    heroImage: string;
    assistantMessage: ChatMessage;
  }> {
    return apiFetch(`/api/trips/${encodeURIComponent(tripId)}/compose`, {
      method: 'POST',
      body: JSON.stringify(taste),
    });
  },

  async syncTripItems(tripId: string, items: TripSavedItem[]): Promise<TripSavedItem[]> {
    const res = await apiFetch<{ items: TripSavedItem[] }>(
      `/api/trips/${encodeURIComponent(tripId)}/items`,
      {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }
    );
    return res.items;
  },

  async updateTripMeta(
    tripId: string,
    patch: { datesLabel?: string; travelers?: string }
  ): Promise<{ ok: boolean; datesLabel: string; travelers: string }> {
    return apiFetch(`/api/trips/${encodeURIComponent(tripId)}/meta`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  async organizeTrip(
    tripId: string,
    items: TripSavedItem[]
  ): Promise<{ items: TripSavedItem[]; assistantMessage: ChatMessage }> {
    return apiFetch(`/api/trips/${encodeURIComponent(tripId)}/organize`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  async sendCoPilotMessage(
    tripId: string,
    payload: {
      message: string;
      activeTab: string;
      savedItems: TripSavedItem[];
      inspectingEntity?: { kind: string; name: string; details?: string } | null;
    }
  ): Promise<{ assistantMessage: ChatMessage; action?: CoPilotAction }> {
    return apiFetch(`/api/trips/${encodeURIComponent(tripId)}/chat`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Streams Co-Pilot tokens word-by-word via Server-Sent Events (`POST /api/trips/:id/chat/stream`)
   * and delivers live itinerary mutations (`add_place`, `move_item`, `remove_item`) as they execute.
   */
  async streamCoPilotMessage(
    tripId: string,
    payload: {
      message: string;
      activeTab: string;
      savedItems: TripSavedItem[];
      inspectingEntity?: { kind: string; name: string; details?: string } | null;
    },
    handlers: {
      onDelta: (text: string) => void;
      onStatus: (label: string) => void;
      onMutation: (data: {
        items: TripSavedItem[];
        addedPlaces: PlaceItem[];
        toast: string;
      }) => void;
      onDone: (data: {
        assistantMessage: ChatMessage;
        action?: CoPilotAction;
        recommendedPlaces?: PlaceItem[];
        recommendedHotels?: HotelItem[];
      }) => void;
    }
  ): Promise<void> {
    const token = await getAccessToken();
    const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Stream failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEventBlock = (block: string) => {
      let eventType = 'message';
      const dataLines: string[] = [];
      for (const rawLine of block.split('\n')) {
        const line = rawLine.trimEnd();
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (dataLines.length === 0) return;
      const parsed = JSON.parse(dataLines.join('\n'));
      if (eventType === 'delta' && parsed.text) {
        handlers.onDelta(parsed.text);
      } else if (eventType === 'status' && parsed.label) {
        handlers.onStatus(parsed.label);
      } else if (eventType === 'mutation') {
        handlers.onMutation(parsed);
      } else if (eventType === 'done') {
        handlers.onDone(parsed);
      } else if (eventType === 'error') {
        throw new Error(parsed.message || 'Co-Pilot stream error');
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        if (frame.trim()) processEventBlock(frame);
      }
    }
    if (buffer.trim()) {
      processEventBlock(buffer);
    }
  },

  async searchPlacesInArea(payload: {
    lat: number;
    lng: number;
    radiusMeters: number;
    query: string;
    destination: string;
    nights?: number;
  }): Promise<{
    kind: 'places' | 'hotels';
    areaLabel: string;
    places: PlaceItem[];
    hotels: HotelItem[];
  }> {
    return apiFetch('/api/places/area-search', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async searchAlongRoute(payload: {
    from: Coordinates;
    to: Coordinates;
    destination: string;
    category?: 'coffee' | 'viewpoint' | 'bite';
    excludeNames?: string[];
  }): Promise<{
    detours: Array<{ place: PlaceItem; detourMinutes: number }>;
  }> {
    return apiFetch('/api/places/along-route', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /* ── Local Seed Fallback Helpers (used when offline or for Flight GDS Phase 3) ── */

  getDiscoverCatalog(_destination = 'Mexico City'): DiscoverCatalog {
    return { activities: ACTIVITIES, places: PLACES };
  },

  getHotels(_destination = 'Mexico City'): HotelItem[] {
    return HOTELS;
  },

  getFlights(_from = 'SFO', _to = 'MEX'): FlightSearchResponse {
    return {
      outbound: OUTBOUND_FLIGHTS,
      inbound: RETURN_FLIGHTS,
      fareClasses: FARE_CLASSES,
    };
  },

  getDestinationHeroImage(_destination = 'Mexico City'): string {
    return MEXICO_CITY_HERO_IMAGE;
  },

  findPlaceById(id: string): PlaceItem | undefined {
    return PLACES.find((p) => p.id === id);
  },

  findActivityById(id: string): ActivityItem | undefined {
    return ACTIVITIES.find((a) => a.id === id);
  },

  findHotelById(id: string): HotelItem | undefined {
    return HOTELS.find((h) => h.id === id);
  },
};
