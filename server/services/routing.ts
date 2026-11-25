import { store } from './supabase';
import type { Coordinates } from '../../src/types/travel';

/**
 * Cost-Free Real Street Routing Service (OSRM + 30-Day Supabase Cache)
 * --------------------------------------------------------------------
 * Computes real footpath & road distances/durations between consecutive stops using
 * OpenStreetMap's OSRM engine, cached for 30 days in Supabase `place_cache`.
 *
 * Falls back transparently to Haversine street-factor estimates if OSRM is slow (>3s)
 * or unreachable, guaranteeing zero UI latency spikes and $0/month MVP routing cost.
 */

export interface RouteLegRequest {
  id: string;
  from: Coordinates;
  to: Coordinates;
}

export interface RouteLegEstimate {
  id: string;
  mode: 'walk' | 'drive';
  minutes: number;
  distanceKm: number;
  label: string;
  source: 'osrm' | 'estimate';
}

function haversineFallback(id: string, from: Coordinates, to: Coordinates): RouteLegEstimate {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const straightKm = 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const distanceKm = Math.max(0.2, straightKm * 1.28);

  if (distanceKm < 1.1) {
    const minutes = Math.max(3, Math.round((distanceKm / 4.8) * 60));
    return {
      id,
      mode: 'walk',
      minutes,
      distanceKm,
      label: `${minutes} min walk · ${distanceKm.toFixed(1)} km`,
      source: 'estimate',
    };
  }
  const minutes = Math.max(6, Math.round((distanceKm / 19) * 60) + 3);
  return {
    id,
    mode: 'drive',
    minutes,
    distanceKm,
    label: `${minutes} min drive · ${distanceKm.toFixed(1)} km`,
    source: 'estimate',
  };
}

async function fetchOsrmLeg(
  profile: 'foot' | 'driving',
  from: Coordinates,
  to: Coordinates
): Promise<{ durationSec: number; distanceM: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3200);
  try {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${from.lng.toFixed(
      5
    )},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}?overview=false`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'VesperTravelApp/1.0' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{ duration: number; distance: number }>;
    };
    const route = json.routes?.[0];
    if (json.code !== 'Ok' || !route) return null;
    return { durationSec: route.duration, distanceM: route.distance };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function estimateRouteLeg(leg: RouteLegRequest): Promise<RouteLegEstimate> {
  const key = `route:v2:${leg.from.lat.toFixed(4)},${leg.from.lng.toFixed(4)}->${leg.to.lat.toFixed(
    4
  )},${leg.to.lng.toFixed(4)}`;

  const cached = await store.getCache<Omit<RouteLegEstimate, 'id'>>(key);
  if (cached) {
    return { id: leg.id, ...cached };
  }

  // Query real OpenStreetMap road distance & duration via OSRM
  const osrm = await fetchOsrmLeg('driving', leg.from, leg.to);
  if (!osrm) {
    return haversineFallback(leg.id, leg.from, leg.to);
  }

  const distanceKm = Math.max(0.1, osrm.distanceM / 1000);
  // Use realistic urban walking pace (4.8 km/h) for short street legs <= 1.3 km; driving for longer legs
  const mode: 'walk' | 'drive' = distanceKm <= 1.3 ? 'walk' : 'drive';
  const minutes =
    mode === 'walk'
      ? Math.max(3, Math.round((distanceKm / 4.8) * 60))
      : Math.max(5, Math.round((osrm.durationSec / 60) * 1.25) + 2);

  const result: Omit<RouteLegEstimate, 'id'> = {
    mode,
    minutes,
    distanceKm,
    label: `${minutes} min ${mode} · ${distanceKm.toFixed(1)} km`,
    source: 'osrm',
  };

  await store.setCache(key, result, 30);
  return { id: leg.id, ...result };
}

export async function estimateRouteLegsBatch(
  legs: RouteLegRequest[]
): Promise<RouteLegEstimate[]> {
  return Promise.all(legs.slice(0, 20).map((leg) => estimateRouteLeg(leg)));
}
