import { Coordinates, TripSavedItem } from '../types/travel';
import { buildCurvedArcPoints } from './geo';
import { parseStartTimeMinutes } from './time';

function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatMinutesTo12Hour(totalMins: number): string {
  const clamped = Math.max(6 * 60, Math.min(23 * 60, totalMins));
  const h24 = Math.floor(clamped / 60);
  const mins = clamped % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
}

export interface StayGravityMetrics {
  centroid: Coordinates;
  radiusMeters: number;
  stopCount: number;
}

export interface HotelGravityReport {
  hotelId: string;
  hotelName: string;
  avgWalkMinutes: number;
  avgDistKm: number;
  within12MinCount: number;
  totalStops: number;
  legs: Array<{
    stopId: string;
    stopTitle: string;
    coords: Coordinates;
    distKm: number;
    walkMinutes: number;
    tier: 'close' | 'medium' | 'far';
  }>;
}

export interface ZigzagReport {
  dayKey: string;
  actualKm: number;
  optimalKm: number;
  savedKm: number;
  savedMinutes: number;
  hasZigzag: boolean;
}

export interface PlaybackSample {
  coord: Coordinates;
  progress: number; // 0..1
  stopIndex: number;
  stopTitle: string;
  stopTime: string;
  phase: 'morning' | 'afternoon' | 'evening';
  cumulativeKm: number;
  cumulativeTransitMins: number;
}

/**
 * Computes the geographic centroid and natural walking radius around the traveler's
 * saved places & activities so hotels can be evaluated against their personal itinerary.
 */
export function computeStayGravity(savedItems: TripSavedItem[]): StayGravityMetrics | null {
  const stops = savedItems.filter(
    (i) => (i.type === 'place' || i.type === 'activity') && i.coords && i.coords.lat !== 0
  );
  if (stops.length < 2) return null;

  const sumLat = stops.reduce((s, i) => s + i.coords!.lat, 0);
  const sumLng = stops.reduce((s, i) => s + i.coords!.lng, 0);
  const centroid: Coordinates = {
    lat: sumLat / stops.length,
    lng: sumLng / stops.length,
  };

  // Compute median-ish spread so one outlier stop doesn't blow up the glowing core zone
  const dists = stops
    .map((s) => haversineKm(centroid, s.coords!))
    .sort((a, b) => a - b);
  const p75Km = dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.75))] || 0.9;
  const radiusMeters = Math.min(2200, Math.max(750, Math.round(p75Km * 1000 * 1.05)));

  return { centroid, radiusMeters, stopCount: stops.length };
}

/**
 * Computes exact spider-web proximity legs from a hovered hotel to up to 6 saved stops,
 * returning walking feasibility tiers and summary stats for the Stay Gravity HUD.
 */
export function computeHotelGravityReport(
  hotel: { id: string; name: string; coords: Coordinates },
  savedItems: TripSavedItem[]
): HotelGravityReport | null {
  const stops = savedItems.filter(
    (i) => (i.type === 'place' || i.type === 'activity') && i.coords && i.coords.lat !== 0
  );
  if (stops.length < 1) return null;

  const allLegs = stops.map((s) => {
    const rawKm = haversineKm(hotel.coords, s.coords!);
    const streetKm = rawKm * 1.25; // realistic street grid factor
    const walkMinutes = Math.max(2, Math.round((streetKm / 4.6) * 60));
    const tier: 'close' | 'medium' | 'far' =
      walkMinutes <= 12 ? 'close' : walkMinutes <= 22 ? 'medium' : 'far';
    return {
      stopId: s.id,
      stopTitle: s.title,
      coords: s.coords!,
      distKm: streetKm,
      walkMinutes,
      tier,
    };
  });

  const avgDistKm = allLegs.reduce((s, l) => s + l.distKm, 0) / allLegs.length;
  const avgWalkMinutes = Math.round(
    allLegs.reduce((s, l) => s + l.walkMinutes, 0) / allLegs.length
  );
  const within12MinCount = allLegs.filter((l) => l.walkMinutes <= 12).length;

  return {
    hotelId: hotel.id,
    hotelName: hotel.name,
    avgWalkMinutes,
    avgDistKm,
    within12MinCount,
    totalStops: allLegs.length,
    legs: allLegs.sort((a, b) => a.distKm - b.distKm).slice(0, 6),
  };
}

/**
 * Detects inefficient cross-town zigzagging within a single day's chronological stops
 * by comparing actual sequential distance against a nearest-neighbor ordering.
 */
export function detectDayZigzag(dayKey: string, dayStops: TripSavedItem[]): ZigzagReport | null {
  const withCoords = dayStops.filter((s) => s.coords && s.coords.lat !== 0);
  if (withCoords.length < 3) return null;

  let actualKm = 0;
  for (let i = 0; i < withCoords.length - 1; i++) {
    actualKm += haversineKm(withCoords[i].coords!, withCoords[i + 1].coords!) * 1.25;
  }

  // Greedy nearest-neighbor from each possible start to find best tight geographic ordering
  let bestKm = actualKm;
  for (let startIdx = 0; startIdx < withCoords.length; startIdx++) {
    const visited = new Set<number>([startIdx]);
    let cur = startIdx;
    let total = 0;
    while (visited.size < withCoords.length) {
      let nextIdx = -1;
      let nextDist = Infinity;
      for (let j = 0; j < withCoords.length; j++) {
        if (visited.has(j)) continue;
        const d = haversineKm(withCoords[cur].coords!, withCoords[j].coords!) * 1.25;
        if (d < nextDist) {
          nextDist = d;
          nextIdx = j;
        }
      }
      if (nextIdx === -1) break;
      total += nextDist;
      visited.add(nextIdx);
      cur = nextIdx;
    }
    if (total < bestKm) bestKm = total;
  }

  const savedKm = Math.max(0, actualKm - bestKm);
  const ratio = actualKm > 0 ? savedKm / actualKm : 0;
  const savedMinutes = Math.round((savedKm / 4.8) * 60);
  const hasZigzag = ratio >= 0.2 && savedKm >= 0.9;

  return {
    dayKey,
    actualKm,
    optimalKm: bestKm,
    savedKm,
    savedMinutes,
    hasZigzag,
  };
}

/**
 * Builds a smooth dense array of route samples for the "Play My Day" cinematic preview,
 * tagging each sample with time-of-day ambient phase (morning / afternoon / evening)
 * and cumulative distance & transit minutes.
 */
export function buildDayPlaybackTrack(
  dayStops: TripSavedItem[],
  highwayPolylines: Record<string, Coordinates[]>
): PlaybackSample[] {
  const ordered = dayStops
    .filter((s) => s.coords && s.coords.lat !== 0)
    .sort((a, b) => parseStartTimeMinutes(a.time) - parseStartTimeMinutes(b.time));
  if (ordered.length < 2) return [];

  const phaseForTime = (timeStr?: string): 'morning' | 'afternoon' | 'evening' => {
    const mins = parseStartTimeMinutes(timeStr);
    if (mins >= 17 * 60) return 'evening';
    if (mins >= 12 * 60) return 'afternoon';
    return 'morning';
  };

  const samples: PlaybackSample[] = [];
  let cumKm = 0;
  let cumMins = 0;

  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const legKey = `${a.id}->${b.id}`;
    const rawPts: Coordinates[] =
      highwayPolylines[legKey] && highwayPolylines[legKey].length >= 2
        ? highwayPolylines[legKey]
        : buildCurvedArcPoints(a.coords!, b.coords!, 22).map(([lat, lng]) => ({ lat, lng }));

    // Downsample very dense OSRM highway polylines to ~24 frames per leg for crisp smooth animation
    const targetSteps = 22;
    const pts: Coordinates[] = [];
    for (let s = 0; s <= targetSteps; s++) {
      const idx = Math.min(rawPts.length - 1, Math.round((s / targetSteps) * (rawPts.length - 1)));
      pts.push(rawPts[idx]);
    }

    const legKm = haversineKm(a.coords!, b.coords!) * 1.25;
    const isWalk = legKm <= 2.2;
    const legMins = isWalk ? (legKm / 4.6) * 60 : (legKm / 26) * 60;

    for (let k = 0; k < pts.length; k++) {
      const frac = k / Math.max(1, pts.length - 1);
      const activeStop = frac < 0.72 ? a : b;
      const activeIdx = frac < 0.72 ? i : i + 1;
      samples.push({
        coord: pts[k],
        progress: (i + frac) / (ordered.length - 1),
        stopIndex: activeIdx,
        stopTitle: activeStop.title,
        stopTime: activeStop.time || (activeIdx === 0 ? '10:00 AM' : '2:00 PM'),
        phase: phaseForTime(activeStop.time),
        cumulativeKm: Number((cumKm + legKm * frac).toFixed(1)),
        cumulativeTransitMins: Math.round(cumMins + legMins * frac),
      });
    }

    cumKm += legKm;
    cumMins += legMins;
  }

  return samples;
}

/** Computes a clean midpoint clock time (rounded to 15 min) between two itinerary stops. */
export function computeMidpointTime(timeA?: string, timeB?: string): string {
  const mA = parseStartTimeMinutes(timeA);
  const mB = parseStartTimeMinutes(timeB);
  const start = Number.isFinite(mA) && mA < 9000 ? mA : 10 * 60;
  const end = Number.isFinite(mB) && mB < 9000 && mB > start ? mB : start + 120;
  const mid = Math.round(((start + end) / 2) / 15) * 15;
  return formatMinutesTo12Hour(mid);
}
