import { Coordinates } from '../types/travel';

export interface TransitEstimate {
  mode: 'walk' | 'drive';
  minutes: number;
  distanceKm: number;
  label: string;
}

/**
 * Estimates urban transit mode, duration, and road distance between two lat/lng points
 * using Haversine great-circle distance with a 1.28x city street routing factor.
 *
 * When a real routing backend (e.g. Google Routes / Mapbox Directions) is connected,
 * replace calls to this helper with live route durations from `travelApi`.
 */
export function computeTransitEstimate(
  from?: Coordinates,
  to?: Coordinates
): TransitEstimate | null {
  if (!from || !to) return null;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const EARTH_RADIUS_KM = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;

  const straightKm = 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const distanceKm = Math.max(0.2, straightKm * 1.28);

  if (distanceKm < 1.1) {
    const minutes = Math.max(3, Math.round((distanceKm / 4.8) * 60));
    return {
      mode: 'walk',
      minutes,
      distanceKm,
      label: `${minutes} min walk · ${distanceKm.toFixed(1)} km`,
    };
  }

  // Average urban speed (~19 km/h) plus pickup/parking buffer
  const minutes = Math.max(6, Math.round((distanceKm / 19) * 60) + 3);
  return {
    mode: 'drive',
    minutes,
    distanceKm,
    label: `${minutes} min drive · ${distanceKm.toFixed(1)} km`,
  };
}

/**
 * Generates smooth quadratic Bezier curve coordinates between two map points
 * for rendering visually distinct day-by-day route arcs on Google Maps.
 */
export function buildCurvedArcPoints(
  from: Coordinates,
  to: Coordinates,
  segments = 24
): [number, number][] {
  const midLat = (from.lat + to.lat) / 2;
  const midLng = (from.lng + to.lng) / 2;
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;

  // Offset control point perpendicular to the line segment for subtle curvature
  const ctrlLat = midLat - dLng * 0.18;
  const ctrlLng = midLng + dLat * 0.18;

  const points: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const inv = 1 - t;
    const lat = inv * inv * from.lat + 2 * inv * t * ctrlLat + t * t * to.lat;
    const lng = inv * inv * from.lng + 2 * inv * t * ctrlLng + t * t * to.lng;
    points.push([lat, lng]);
  }
  return points;
}
