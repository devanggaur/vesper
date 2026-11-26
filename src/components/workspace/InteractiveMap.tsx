import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus,
  Minus,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  X,
  Crosshair,
  Magnet,
  Sparkles,
  Zap,
  ArrowRight,
  Coffee,
  Utensils,
  Wine,
  BedDouble,
  Eye,
  Footprints,
  Star,
} from 'lucide-react';
import {
  Coordinates,
  HotelItem,
  PlaceItem,
  TripDayMeta,
  TripMode,
  TripSavedItem,
} from '../../types/travel';
import { buildCurvedArcPoints } from '../../utils/geo';
import { parseStartTimeMinutes } from '../../utils/time';
import { loadGoogleMaps } from '../../utils/googleMapsLoader';
import { getGoogleMapStyles } from '../../utils/googleMapStyles';
import { DEFAULT_CDMX_DAYS, travelApi } from '../../services/travelApi';
import {
  buildDayPlaybackTrack,
  computeHotelGravityReport,
  computeMidpointTime,
  computeStayGravity,
  detectDayZigzag,
} from '../../utils/mapSpatial';
import { SmartImage } from '../common/SmartImage';

interface InteractiveMapProps {
  mapStage: 'continent' | 'city' | 'pins';
  tripMode?: TripMode;
  destination?: string;
  center?: Coordinates;
  days?: TripDayMeta[];
  places: PlaceItem[];
  hotels: HotelItem[];
  savedItems: TripSavedItem[];
  showHotelPins: boolean;
  highlightedId: string | null;
  spotlightIds?: string[];
  focusedDay?: string;
  readOnly?: boolean;
  onSelectPlace: (place: PlaceItem) => void;
  onSelectHotel: (hotel: HotelItem) => void;
  onHoverId?: (id: string | null) => void;
  onAskArea?: (payload: {
    lat: number;
    lng: number;
    radiusMeters: number;
    query: string;
  }) => Promise<void>;
  onAddDetourPlace?: (place: PlaceItem, day: string, time: string) => void;
  onOptimizeItinerary?: () => void;
}

interface ActiveDetourLeg {
  dayKey: string;
  from: TripSavedItem;
  to: TripSavedItem;
  midpointTime: string;
}

interface DrawnCircleZone {
  lat: number;
  lng: number;
  radiusMeters: number;
}

/**
 * Lightweight Google Maps OverlayView rendering rich interactive HTML pins
 * (Vesper photo cards, hotel price pills, midpoint detour pills, and live playback beacon).
 */
function createHtmlOverlay(
  g: typeof google,
  position: Coordinates,
  html: string,
  zIndex: number,
  onClick?: () => void,
  options?: {
    transform?: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
    pointerEvents?: 'auto' | 'none';
  }
): google.maps.OverlayView {
  class HtmlPinOverlay extends g.maps.OverlayView {
    private div: HTMLDivElement | null = null;

    onAdd() {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.transform = options?.transform ?? 'translate(-50%, -85%)';
      div.style.cursor = onClick ? 'pointer' : 'default';
      div.style.pointerEvents = options?.pointerEvents ?? 'auto';
      div.style.zIndex = String(zIndex);
      div.innerHTML = html;
      if (onClick) {
        div.addEventListener('click', (e) => {
          e.stopPropagation();
          onClick();
        });
      }
      if (options?.onMouseEnter) {
        div.addEventListener('mouseenter', options.onMouseEnter);
      }
      if (options?.onMouseLeave) {
        div.addEventListener('mouseleave', options.onMouseLeave);
      }
      this.div = div;
      const panes = this.getPanes();
      panes?.overlayMouseTarget.appendChild(div);
    }

    draw() {
      if (!this.div) return;
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(
        new g.maps.LatLng(position.lat, position.lng)
      );
      if (point) {
        this.div.style.left = `${point.x}px`;
        this.div.style.top = `${point.y}px`;
      }
    }

    onRemove() {
      if (this.div && this.div.parentNode) {
        this.div.parentNode.removeChild(this.div);
      }
      this.div = null;
    }
  }

  return new HtmlPinOverlay();
}

const SPATIAL_QUICK_CHIPS = [
  { label: 'Coffee', query: 'specialty coffee and pastry cafe', icon: Coffee },
  { label: 'Dining', query: 'top local restaurants', icon: Utensils },
  { label: 'Sunset bar', query: 'rooftop or wine bar for sunset', icon: Wine },
  { label: 'Hidden gems', query: 'hidden gems local viewpoints shops', icon: Sparkles },
  { label: 'Boutique stay', query: 'boutique hotels', icon: BedDouble },
];

/**
 * Vesper Living Spatial Map:
 * - Stay Gravity: glowing centroid zone + live color-coded walk/transit spider lines when hovering any hotel
 * - Circle to Ask Vesper: draw a circle on the map to query Google Places strictly inside that zone
 * - Play My Day: cinematic route preview with animated beacon, time-of-day warmth, odometer & Zigzag Detector
 * - Along the Way: subtle midpoint `+` pills on route connectors to slot micro-detours between stops
 */
export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  mapStage,
  tripMode = 'city',
  destination = '',
  center = { lat: 19.426, lng: -99.172 },
  days = DEFAULT_CDMX_DAYS,
  places,
  hotels,
  savedItems,
  showHotelPins,
  highlightedId,
  spotlightIds = [],
  focusedDay = 'All',
  readOnly = false,
  onSelectPlace,
  onSelectHotel,
  onHoverId,
  onAskArea,
  onAddDetourPlace,
  onOptimizeItinerary,
}) => {
  const [dayFilter, setDayFilter] = useState<string>(focusedDay);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highwayPolylines, setHighwayPolylines] = useState<Record<string, Coordinates[]>>({});

  // Superpower 1: Stay Gravity Lens
  const [gravityPinned, setGravityPinned] = useState(false);
  const [localHoveredHotelId, setLocalHoveredHotelId] = useState<string | null>(null);

  // Superpower 2: Circle to Ask Vesper (Lasso Draw)
  const [lassoDrawing, setLassoDrawing] = useState(false);
  const [dragCirclePx, setDragCirclePx] = useState<{
    startX: number;
    startY: number;
    radiusPx: number;
  } | null>(null);
  const [drawnCircle, setDrawnCircle] = useState<DrawnCircleZone | null>(null);
  const [areaPromptInput, setAreaPromptInput] = useState('');
  const [isSearchingArea, setIsSearchingArea] = useState(false);

  // Superpower 3: Play My Day Cinematic Preview
  const [playbackDay, setPlaybackDay] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2>(1);

  // Superpower 4: Along the Way Micro-Detours
  const [activeDetourLeg, setActiveDetourLeg] = useState<ActiveDetourLeg | null>(null);
  const [detourCategory, setDetourCategory] = useState<'coffee' | 'viewpoint' | 'bite'>('coffee');
  const [detourResults, setDetourResults] = useState<
    Array<{ place: PlaceItem; detourMinutes: number }>
  >([]);
  const [isLoadingDetours, setIsLoadingDetours] = useState(false);

  // In Road Trip Mode, fetch real OSRM road-following highway geometry for consecutive stops
  const roadLegs = useMemo(() => {
    if (tripMode !== 'roadtrip') return [];
    const legs: Array<{ id: string; from: Coordinates; to: Coordinates }> = [];
    let prevDayLast: TripSavedItem | null = null;
    days.forEach((meta) => {
      const dayStops = savedItems
        .filter((i) => (i.type === 'place' || i.type === 'activity') && i.day === meta.key && i.coords)
        .sort((a, b) => parseStartTimeMinutes(a.time) - parseStartTimeMinutes(b.time));
      if (prevDayLast?.coords && dayStops[0]?.coords) {
        legs.push({
          id: `${prevDayLast.id}->${dayStops[0].id}`,
          from: prevDayLast.coords,
          to: dayStops[0].coords,
        });
      }
      for (let i = 0; i < dayStops.length - 1; i++) {
        if (dayStops[i].coords && dayStops[i + 1].coords) {
          legs.push({
            id: `${dayStops[i].id}->${dayStops[i + 1].id}`,
            from: dayStops[i].coords!,
            to: dayStops[i + 1].coords!,
          });
        }
      }
      if (dayStops.length > 0) prevDayLast = dayStops[dayStops.length - 1];
    });
    return legs;
  }, [tripMode, days, savedItems]);

  const roadLegsSig = useMemo(
    () => roadLegs.map((l) => `${l.id}:${l.from.lat.toFixed(3)},${l.to.lat.toFixed(3)}`).join('|'),
    [roadLegs]
  );

  useEffect(() => {
    if (tripMode !== 'roadtrip' || roadLegs.length === 0) return;
    let cancelled = false;
    travelApi
      .estimateRoutes(roadLegs, { includeGeometry: true })
      .then((res) => {
        if (cancelled) return;
        const mapGeom: Record<string, Coordinates[]> = {};
        res.forEach((r) => {
          if (r.geometry && r.geometry.length >= 2) {
            mapGeom[r.id] = r.geometry;
          }
        });
        setHighwayPolylines(mapGeom);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripMode, roadLegsSig]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapFrameRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const googleRef = useRef<typeof google | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const overlaysRef = useRef<google.maps.OverlayView[]>([]);
  const gravityShapesRef = useRef<Array<google.maps.Circle | google.maps.Polyline | google.maps.OverlayView>>([]);
  const drawnCircleRef = useRef<google.maps.Circle | null>(null);
  const playbackBeaconRef = useRef<google.maps.OverlayView | null>(null);
  const prevCenterKeyRef = useRef<string>('');

  useEffect(() => {
    setDayFilter(focusedDay);
  }, [focusedDay]);

  // Derived Stay Gravity metrics & active hovered hotel
  const stayGravity = useMemo(() => computeStayGravity(savedItems), [savedItems]);
  const activeHotelId = localHoveredHotelId || highlightedId;
  const activeHoveredHotel = useMemo(
    () => (activeHotelId ? hotels.find((h) => h.id === activeHotelId) || null : null),
    [activeHotelId, hotels]
  );
  const hotelGravityReport = useMemo(
    () => (activeHoveredHotel ? computeHotelGravityReport(activeHoveredHotel, savedItems) : null),
    [activeHoveredHotel, savedItems]
  );

  // Derived playable days & zigzag analysis
  const dayStopsMap = useMemo(() => {
    const map = new Map<string, TripSavedItem[]>();
    days.forEach((d) => {
      const list = savedItems
        .filter((i) => (i.type === 'place' || i.type === 'activity') && i.day === d.key && i.coords)
        .sort((a, b) => parseStartTimeMinutes(a.time) - parseStartTimeMinutes(b.time));
      map.set(d.key, list);
    });
    return map;
  }, [days, savedItems]);

  const playableDays = useMemo(
    () => days.filter((d) => (dayStopsMap.get(d.key)?.length || 0) >= 2),
    [days, dayStopsMap]
  );

  const activeDayForZigzag = playbackDay || (dayFilter !== 'All' ? dayFilter : playableDays[0]?.key || null);
  const activeZigzag = useMemo(() => {
    if (!activeDayForZigzag) return null;
    const stops = dayStopsMap.get(activeDayForZigzag) || [];
    return detectDayZigzag(activeDayForZigzag, stops);
  }, [activeDayForZigzag, dayStopsMap]);

  const playbackTrack = useMemo(() => {
    if (!playbackDay) return [];
    return buildDayPlaybackTrack(dayStopsMap.get(playbackDay) || [], highwayPolylines);
  }, [playbackDay, dayStopsMap, highwayPolylines]);

  const currentPlaybackSample =
    playbackTrack.length > 0
      ? playbackTrack[Math.min(playbackIdx, playbackTrack.length - 1)]
      : null;

  // Fetch Along-the-Way detours whenever an active detour leg or category changes
  useEffect(() => {
    if (!activeDetourLeg?.from.coords || !activeDetourLeg?.to.coords) return;
    let cancelled = false;
    setIsLoadingDetours(true);
    travelApi
      .searchAlongRoute({
        from: activeDetourLeg.from.coords,
        to: activeDetourLeg.to.coords,
        destination,
        category: detourCategory,
        excludeNames: savedItems.map((i) => i.title),
      })
      .then((res) => {
        if (!cancelled) setDetourResults(res.detours || []);
      })
      .catch(() => {
        if (!cancelled) setDetourResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetours(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDetourLeg?.from.id, activeDetourLeg?.to.id, detourCategory, destination]);

  // Esc key cleanly dismisses Lasso, Detours, or Playback
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLassoDrawing(false);
        setDragCirclePx(null);
        setDrawnCircle(null);
        setActiveDetourLeg(null);
        setPlaybackDay(null);
        setIsPlaying(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Play My Day animation ticker
  useEffect(() => {
    if (!isPlaying || playbackTrack.length < 2) return;
    const intervalMs = playbackSpeed === 2 ? 52 : 100;
    const timer = window.setInterval(() => {
      setPlaybackIdx((prev) => {
        if (prev >= playbackTrack.length - 1) {
          setIsPlaying(false);
          return playbackTrack.length - 1;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, playbackSpeed, playbackTrack.length]);

  // 1. Load Google Maps JS API once & initialize map instance
  useEffect(() => {
    let cancelled = false;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

    const prevAuthFailure = (window as unknown as Record<string, (() => void) | undefined>)
      .gm_authFailure;
    (window as unknown as Record<string, () => void>).gm_authFailure = () => {
      if (!cancelled) {
        setLoadError(
          'Google Maps JavaScript API needs to be enabled (and allowed on your API key) in Google Cloud Console.'
        );
      }
    };

    loadGoogleMaps(apiKey)
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        googleRef.current = g;
        const map = new g.maps.Map(containerRef.current, {
          center: { lat: center.lat, lng: center.lng },
          zoom: mapStage === 'pins' ? 13 : 12,
          styles: getGoogleMapStyles(),
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        mapRef.current = map;
        prevCenterKeyRef.current = `${center.lat.toFixed(4)}:${center.lng.toFixed(4)}`;
        setIsReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError((err as Error)?.message || 'Unable to load Google Maps');
        }
      });

    return () => {
      cancelled = true;
      (window as unknown as Record<string, (() => void) | undefined>).gm_authFailure =
        prevAuthFailure;
      polylinesRef.current.forEach((p) => p.setMap(null));
      overlaysRef.current.forEach((o) => o.setMap(null));
      gravityShapesRef.current.forEach((s) => s.setMap(null));
      drawnCircleRef.current?.setMap(null);
      playbackBeaconRef.current?.setMap(null);
      polylinesRef.current = [];
      overlaysRef.current = [];
      gravityShapesRef.current = [];
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Recenter smoothly when destination coordinates change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;
    const key = `${center.lat.toFixed(4)}:${center.lng.toFixed(4)}`;
    if (prevCenterKeyRef.current !== key) {
      prevCenterKeyRef.current = key;
      map.panTo({ lat: center.lat, lng: center.lng });
      map.setZoom(mapStage === 'pins' ? 13 : 12);
    }
  }, [center.lat, center.lng, mapStage, isReady]);

  // 3. Render Curved Day Route Arcs + Midpoint Detour Pills + Photo-Card Pins + Hotel Price Badges
  useEffect(() => {
    const map = mapRef.current;
    const g = googleRef.current;
    if (!map || !g || !isReady) return;

    polylinesRef.current.forEach((p) => p.setMap(null));
    overlaysRef.current.forEach((o) => o.setMap(null));
    polylinesRef.current = [];
    overlaysRef.current = [];

    const stopOrderBadge = new Map<string, { num: number; color: string }>();
    let prevDayLastStop: TripSavedItem | null = null;

    days.forEach((meta) => {
      const dayStops = savedItems
        .filter((i) => (i.type === 'place' || i.type === 'activity') && i.day === meta.key && i.coords)
        .sort((a, b) => parseStartTimeMinutes(a.time) - parseStartTimeMinutes(b.time));

      const lineColor = meta.dotColor;

      if (dayFilter === 'All' || dayFilter === meta.key) {
        dayStops.forEach((st, idx) => {
          stopOrderBadge.set(st.refId, { num: idx + 1, color: lineColor });
        });

        if (
          tripMode === 'roadtrip' &&
          dayFilter === 'All' &&
          prevDayLastStop?.coords &&
          dayStops[0]?.coords
        ) {
          const bridgeId = `${prevDayLastStop.id}->${dayStops[0].id}`;
          const bridgePath =
            highwayPolylines[bridgeId] ||
            buildCurvedArcPoints(prevDayLastStop.coords, dayStops[0].coords).map(([lat, lng]) => ({
              lat,
              lng,
            }));
          const bridgeLine = new g.maps.Polyline({
            path: bridgePath,
            geodesic: false,
            strokeColor: lineColor,
            strokeOpacity: highwayPolylines[bridgeId] ? 0.72 : 0.45,
            strokeWeight: 3,
            map,
          });
          polylinesRef.current.push(bridgeLine);
        }

        for (let i = 0; i < dayStops.length - 1; i++) {
          const stopA = dayStops[i];
          const stopB = dayStops[i + 1];
          const legId = `${stopA.id}->${stopB.id}`;
          const realGeom = tripMode === 'roadtrip' ? highwayPolylines[legId] : undefined;
          const pts =
            realGeom ||
            buildCurvedArcPoints(stopA.coords!, stopB.coords!).map(([lat, lng]) => ({
              lat,
              lng,
            }));

          if (realGeom) {
            const halo = new g.maps.Polyline({
              path: pts,
              geodesic: false,
              strokeColor: lineColor,
              strokeOpacity: 0.22,
              strokeWeight: 9,
              map,
            });
            const road = new g.maps.Polyline({
              path: pts,
              geodesic: false,
              strokeColor: lineColor,
              strokeOpacity: 0.94,
              strokeWeight: 3.6,
              map,
            });
            polylinesRef.current.push(halo, road);
          } else {
            const halo = new g.maps.Polyline({
              path: pts,
              geodesic: false,
              strokeColor: lineColor,
              strokeOpacity: 0.16,
              strokeWeight: 7,
              map,
            });
            const dashed = new g.maps.Polyline({
              path: pts,
              geodesic: false,
              strokeOpacity: 0,
              icons: [
                {
                  icon: {
                    path: 'M 0,-1 0,1',
                    strokeOpacity: 0.92,
                    strokeColor: lineColor,
                    strokeWeight: 2.6,
                    scale: 3.5,
                  },
                  offset: '0',
                  repeat: '14px',
                },
              ],
              map,
            });
            polylinesRef.current.push(halo, dashed);
          }

          // Superpower 4: Subtle Midpoint `+` Detour Pill along each route connector
          if (!readOnly && onAddDetourPlace && !playbackDay && !lassoDrawing && pts.length >= 3) {
            const midPt = pts[Math.floor(pts.length / 2)];
            const isSelectedLeg =
              activeDetourLeg?.from.id === stopA.id && activeDetourLeg?.to.id === stopB.id;
            const detourHtml = `
              <button type="button" title="Find a gem along the way"
                class="group inline-flex items-center gap-1 h-[22px] px-1.5 rounded-full shadow-md border transition-all duration-150 hover:scale-110 ${
                  isSelectedLeg ? 'scale-110' : ''
                }"
                style="background: ${
                  isSelectedLeg ? '#0E2034' : 'rgba(250,249,245,0.96)'
                }; color: ${isSelectedLeg ? '#FFFFFF' : '#14191F'}; border-color: ${
                  isSelectedLeg ? '#0E2034' : lineColor
                }; font-size: 11px; font-weight: 700;">
                <span style="line-height: 1;">+</span>
              </button>
            `;
            const midOverlay = createHtmlOverlay(
              g,
              midPt,
              detourHtml,
              isSelectedLeg ? 85 : 45,
              () => {
                setDrawnCircle(null);
                setPlaybackDay(null);
                setIsPlaying(false);
                setActiveDetourLeg({
                  dayKey: meta.key,
                  from: stopA,
                  to: stopB,
                  midpointTime: computeMidpointTime(stopA.time, stopB.time),
                });
              },
              { transform: 'translate(-50%, -50%)' }
            );
            midOverlay.setMap(map);
            overlaysRef.current.push(midOverlay);
          }
        }
      }

      if (dayStops.length > 0) prevDayLastStop = dayStops[dayStops.length - 1];
    });

    const savedRefIds = new Set(savedItems.map((s) => s.refId));
    const savedUnscheduledRefIds = new Set(
      savedItems
        .filter((s) => (s.type === 'place' || s.type === 'activity') && (!s.day || s.day === 'Any time'))
        .map((s) => s.refId)
    );
    const spotlightSet = new Set(spotlightIds);
    const activeDayRefIds =
      dayFilter === 'All'
        ? null
        : new Set(savedItems.filter((s) => s.day === dayFilter).map((s) => s.refId));

    const defaultPinIds = new Set(places.slice(0, 8).map((p) => p.id));
    const visiblePlaces = places.filter((p) => {
      // Always render newly added "Any time" stops, hovered cards, and Circle-to-Ask results
      // so users immediately see pins land inside their circle and turn into ✓ when added!
      if (savedUnscheduledRefIds.has(p.id) || spotlightSet.has(p.id) || highlightedId === p.id) {
        return true;
      }
      if (activeDayRefIds) return activeDayRefIds.has(p.id);
      return savedRefIds.has(p.id) || defaultPinIds.has(p.id);
    });

    // Place Photo-Card Markers
    visiblePlaces.forEach((place) => {
      const isSaved = savedRefIds.has(place.id);
      const isSpotlight = spotlightSet.has(place.id);
      const badge = stopOrderBadge.get(place.id);
      const isHighlighted = highlightedId === place.id;
      const truncated = place.name.length > 15 ? `${place.name.slice(0, 14)}...` : place.name;

      const borderColor = badge
        ? badge.color
        : isSaved
        ? 'var(--v-cta)'
        : isSpotlight
        ? '#C85A17'
        : 'var(--v-surface)';

      const html = `
        <div class="group flex flex-col items-center transition-transform duration-200 ${
          isHighlighted ? 'scale-110' : 'hover:scale-105'
        }">
          <div class="w-[54px] h-[54px] rounded-[12px] p-[3px] shadow-[0_8px_22px_rgba(0,0,0,0.28)] border-2 overflow-visible relative" style="background: var(--v-surface); border-color: ${borderColor};">
            <img src="${place.image}" alt="${place.name.replace(/"/g, '&quot;')}" class="w-full h-full object-cover rounded-[8px]" />
            ${
              badge
                ? `<span class="absolute -top-2 -left-2 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow" style="background: ${badge.color}; font-family: var(--v-font-mono);">${badge.num}</span>`
                : isSaved
                ? '<span class="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shadow-md ring-2 ring-white" style="background: var(--v-cta); color: var(--v-cta-text);">✓</span>'
                : isSpotlight
                ? '<span class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] text-white flex items-center justify-center font-bold shadow" style="background: #C85A17;">★</span>'
                : ''
            }
          </div>
          <div class="mt-1 px-2 py-0.5 rounded-md backdrop-blur-sm shadow-sm border text-[10.5px] font-semibold whitespace-nowrap leading-tight" style="background: ${
            isSaved && !badge ? 'var(--v-cta)' : 'var(--v-surface)'
          }; border-color: ${
            isSaved && !badge ? 'var(--v-cta)' : 'var(--v-border)'
          }; color: ${isSaved && !badge ? 'var(--v-cta-text)' : 'var(--v-ink)'};">
            ${truncated}
          </div>
        </div>
      `;

      const overlay = createHtmlOverlay(
        g,
        place.coords,
        html,
        isHighlighted ? 95 : isSaved ? 75 : isSpotlight ? 68 : badge ? 60 : 30,
        () => onSelectPlace(place)
      );
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    // Guarantee any saved place/activity (e.g., added via Circle-to-Ask or Detours) ALWAYS
    // appears on the map even if its refId isn't present in the initial `places` catalog!
    const renderedPlaceIds = new Set(visiblePlaces.map((p) => p.id));
    savedItems
      .filter((s) => (s.type === 'place' || s.type === 'activity') && s.coords && !renderedPlaceIds.has(s.refId))
      .forEach((item) => {
        if (activeDayRefIds && item.day && item.day !== 'Any time' && !activeDayRefIds.has(item.refId)) {
          return;
        }
        const badge = stopOrderBadge.get(item.refId);
        const truncated = item.title.length > 15 ? `${item.title.slice(0, 14)}...` : item.title;
        const borderColor = badge ? badge.color : 'var(--v-cta)';
        const html = `
          <div class="group flex flex-col items-center transition-transform duration-200 hover:scale-105">
            <div class="w-[54px] h-[54px] rounded-[12px] p-[3px] shadow-[0_8px_22px_rgba(0,0,0,0.28)] border-2 overflow-visible relative" style="background: var(--v-surface); border-color: ${borderColor};">
              <img src="${item.image}" alt="${item.title.replace(/"/g, '&quot;')}" class="w-full h-full object-cover rounded-[8px]" />
              ${
                badge
                  ? `<span class="absolute -top-2 -left-2 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow" style="background: ${badge.color}; font-family: var(--v-font-mono);">${badge.num}</span>`
                  : '<span class="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold shadow-md ring-2 ring-white" style="background: var(--v-cta); color: var(--v-cta-text);">✓</span>'
              }
            </div>
            <div class="mt-1 px-2 py-0.5 rounded-md backdrop-blur-sm shadow-sm border text-[10.5px] font-semibold whitespace-nowrap leading-tight" style="background: ${
              badge ? 'var(--v-surface)' : 'var(--v-cta)'
            }; border-color: ${badge ? 'var(--v-border)' : 'var(--v-cta)'}; color: ${
              badge ? 'var(--v-ink)' : 'var(--v-cta-text)'
            };">
              ${truncated}
            </div>
          </div>
        `;
        const overlay = createHtmlOverlay(
          g,
          item.coords!,
          html,
          75,
          () => {
            const matched = places.find((p) => p.id === item.refId);
            if (matched) onSelectPlace(matched);
          }
        );
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });

    // Hotel Price Pills (hovering triggers live Stay Gravity spider lines!)
    if (showHotelPins && dayFilter === 'All') {
      hotels.forEach((hotel) => {
        const isHighlighted = activeHotelId === hotel.id;
        const html = `
          <div class="px-2.5 py-1 rounded-full font-semibold text-[11.5px] shadow-md border transition-transform hover:scale-105 ${
            isHighlighted ? 'scale-110' : ''
          }" style="font-family: var(--v-font-mono); ${
            isHighlighted
              ? 'background: var(--v-cta); color: var(--v-cta-text); border-color: var(--v-cta);'
              : 'background: var(--v-surface); color: var(--v-ink); border-color: var(--v-border-strong);'
          }">
            $${hotel.priceTotal}
          </div>
        `;
        const overlay = createHtmlOverlay(
          g,
          hotel.coords,
          html,
          isHighlighted ? 95 : 22,
          () => onSelectHotel(hotel),
          {
            onMouseEnter: () => {
              setLocalHoveredHotelId(hotel.id);
              onHoverId?.(hotel.id);
            },
            onMouseLeave: () => {
              setLocalHoveredHotelId(null);
              onHoverId?.(null);
            },
          }
        );
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });
    }

    // Auto-fit bounds cleanly when isolating a single day's stops OR viewing a full road trip corridor
    if (dayFilter !== 'All') {
      const dayCoords = savedItems
        .filter((s) => s.day === dayFilter && s.coords)
        .map((s) => s.coords!);
      if (dayCoords.length >= 2) {
        const bounds = new g.maps.LatLngBounds();
        dayCoords.forEach((pt) => bounds.extend(pt));
        map.fitBounds(bounds, 72);
      } else if (dayCoords.length === 1) {
        map.panTo(dayCoords[0]);
        map.setZoom(14);
      }
    } else if (tripMode === 'roadtrip') {
      const allCoords = savedItems
        .filter((s) => (s.type === 'place' || s.type === 'activity') && s.coords)
        .map((s) => s.coords!);
      if (allCoords.length >= 2) {
        const bounds = new g.maps.LatLngBounds();
        allCoords.forEach((pt) => bounds.extend(pt));
        map.fitBounds(bounds, 64);
      }
    }
  }, [
    isReady,
    tripMode,
    highwayPolylines,
    days,
    places,
    hotels,
    savedItems,
    showHotelPins,
    highlightedId,
    spotlightIds,
    activeHotelId,
    dayFilter,
    readOnly,
    playbackDay,
    lassoDrawing,
    activeDetourLeg,
    onSelectPlace,
    onSelectHotel,
    onHoverId,
    onAddDetourPlace,
  ]);

  // 4. Superpower 1 Effect: Render Stay Gravity Zone Circle + Live Hotel-to-Stops Spider Lines
  useEffect(() => {
    const map = mapRef.current;
    const g = googleRef.current;
    if (!map || !g || !isReady) return;

    gravityShapesRef.current.forEach((s) => s.setMap(null));
    gravityShapesRef.current = [];

    const showGravity = (gravityPinned || Boolean(activeHoveredHotel)) && Boolean(stayGravity);
    if (!showGravity || !stayGravity) return;

    // Soft glowing Stay Gravity Zone around the traveler's actual planned stops
    const gravityCircle = new g.maps.Circle({
      center: stayGravity.centroid,
      radius: stayGravity.radiusMeters,
      fillColor: '#C85A17',
      fillOpacity: 0.08,
      strokeColor: '#C85A17',
      strokeOpacity: 0.34,
      strokeWeight: 1.5,
      clickable: false,
      map,
    });
    gravityShapesRef.current.push(gravityCircle);

    // Spider-web walk/transit lines from the hovered hotel to each saved stop
    if (activeHoveredHotel && hotelGravityReport) {
      hotelGravityReport.legs.forEach((leg) => {
        const strokeColor =
          leg.tier === 'close' ? '#15803D' : leg.tier === 'medium' ? '#C85A17' : '#64748B';
        const arcPts = buildCurvedArcPoints(activeHoveredHotel.coords, leg.coords, 14).map(
          ([lat, lng]) => ({ lat, lng })
        );
        const line = new g.maps.Polyline({
          path: arcPts,
          geodesic: false,
          strokeOpacity: 0,
          icons: [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 0.9,
                strokeColor,
                strokeWeight: 2.2,
                scale: 2.6,
              },
              offset: '0',
              repeat: '10px',
            },
          ],
          clickable: false,
          zIndex: 70,
          map,
        });
        gravityShapesRef.current.push(line);

        // Compact walk-minute pill on the spider leg midpoint
        const midPt = arcPts[Math.floor(arcPts.length / 2)];
        const pillHtml = `
          <div class="px-1.5 py-0.5 rounded-full text-white text-[10px] font-semibold shadow-sm whitespace-nowrap"
            style="background: ${strokeColor}; font-family: var(--v-font-mono);">
            ${leg.walkMinutes}m
          </div>
        `;
        const pill = createHtmlOverlay(g, midPt, pillHtml, 88, undefined, {
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        });
        pill.setMap(map);
        gravityShapesRef.current.push(pill);
      });
    }
  }, [isReady, gravityPinned, activeHoveredHotel, stayGravity, hotelGravityReport]);

  // 5. Superpower 2 Effect: Render Drawn Lasso Circle on Map
  useEffect(() => {
    const map = mapRef.current;
    const g = googleRef.current;
    if (!map || !g || !isReady) return;

    drawnCircleRef.current?.setMap(null);
    drawnCircleRef.current = null;

    if (!drawnCircle) return;
    drawnCircleRef.current = new g.maps.Circle({
      center: { lat: drawnCircle.lat, lng: drawnCircle.lng },
      radius: drawnCircle.radiusMeters,
      fillColor: '#C85A17',
      fillOpacity: 0.12,
      strokeColor: '#C85A17',
      strokeOpacity: 0.85,
      strokeWeight: 2,
      clickable: false,
      map,
    });
  }, [isReady, drawnCircle]);

  // 6. Superpower 3 Effect: Render Animated "Play My Day" Traveler Beacon
  useEffect(() => {
    const map = mapRef.current;
    const g = googleRef.current;
    if (!map || !g || !isReady) return;

    playbackBeaconRef.current?.setMap(null);
    playbackBeaconRef.current = null;

    if (!playbackDay || !currentPlaybackSample) return;

    const phaseBg =
      currentPlaybackSample.phase === 'evening'
        ? '#B45309'
        : currentPlaybackSample.phase === 'afternoon'
        ? '#0E2034'
        : '#C85A17';
    const beaconHtml = `
      <div class="flex flex-col items-center">
        <div class="px-2 py-0.5 rounded-full text-white text-[10px] font-semibold shadow-md whitespace-nowrap mb-1"
          style="background: ${phaseBg}; font-family: var(--v-font-mono);">
          ${currentPlaybackSample.stopTime}
        </div>
        <div class="relative w-5 h-5 flex items-center justify-center">
          <span class="absolute inset-0 rounded-full animate-ping opacity-60" style="background: ${phaseBg};"></span>
          <span class="relative w-3.5 h-3.5 rounded-full border-2 border-white shadow-md" style="background: ${phaseBg};"></span>
        </div>
      </div>
    `;
    const beacon = createHtmlOverlay(g, currentPlaybackSample.coord, beaconHtml, 110, undefined, {
      transform: 'translate(-50%, -82%)',
      pointerEvents: 'none',
    });
    beacon.setMap(map);
    playbackBeaconRef.current = beacon;
  }, [isReady, playbackDay, currentPlaybackSample]);

  // Lasso Pointer Handlers (converts drawn SVG circle into exact lat/lng + radiusMeters)
  const handleLassoPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!lassoDrawing || !mapFrameRef.current) return;
    const rect = mapFrameRef.current.getBoundingClientRect();
    setDragCirclePx({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      radiusPx: 12,
    });
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handleLassoPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragCirclePx || !mapFrameRef.current) return;
    const rect = mapFrameRef.current.getBoundingClientRect();
    const dx = e.clientX - rect.left - dragCirclePx.startX;
    const dy = e.clientY - rect.top - dragCirclePx.startY;
    setDragCirclePx((prev) =>
      prev ? { ...prev, radiusPx: Math.max(16, Math.round(Math.hypot(dx, dy))) } : null
    );
  };

  const handleLassoPointerUp = () => {
    if (!dragCirclePx || !mapFrameRef.current || !mapRef.current) {
      setDragCirclePx(null);
      return;
    }
    const map = mapRef.current;
    const bounds = map.getBounds();
    const rect = mapFrameRef.current.getBoundingClientRect();
    if (bounds && rect.width > 0 && rect.height > 0) {
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const fracX = dragCirclePx.startX / rect.width;
      const fracY = dragCirclePx.startY / rect.height;
      const lat = ne.lat() - fracY * (ne.lat() - sw.lat());
      const lng = sw.lng() + fracX * (ne.lng() - sw.lng());
      const metersPerLatDeg = 111320;
      const visibleLatMeters = Math.abs(ne.lat() - sw.lat()) * metersPerLatDeg;
      const radiusMeters = Math.min(
        8000,
        Math.max(280, Math.round((dragCirclePx.radiusPx / rect.height) * visibleLatMeters))
      );

      setDrawnCircle({ lat, lng, radiusMeters });
      setLassoDrawing(false);
      setActiveDetourLeg(null);
      setPlaybackDay(null);
      setIsPlaying(false);
    }
    setDragCirclePx(null);
  };

  const submitAreaQuery = useCallback(
    async (query: string) => {
      if (!drawnCircle || !onAskArea || !query.trim() || isSearchingArea) return;
      setIsSearchingArea(true);
      try {
        await onAskArea({
          lat: drawnCircle.lat,
          lng: drawnCircle.lng,
          radiusMeters: drawnCircle.radiusMeters,
          query: query.trim(),
        });
        setAreaPromptInput('');
        // Keep the glowing circle briefly so user sees pins land inside it, then gently clear
        window.setTimeout(() => {
          setDrawnCircle(null);
        }, 4500);
      } finally {
        setIsSearchingArea(false);
      }
    },
    [drawnCircle, onAskArea, isSearchingArea]
  );

  const startPlayMyDay = () => {
    const targetDay =
      dayFilter !== 'All' && (dayStopsMap.get(dayFilter)?.length || 0) >= 2
        ? dayFilter
        : playableDays[0]?.key;
    if (!targetDay) return;
    setLassoDrawing(false);
    setDrawnCircle(null);
    setActiveDetourLeg(null);
    setDayFilter(targetDay);
    setPlaybackDay(targetDay);
    setPlaybackIdx(0);
    setIsPlaying(true);
  };

  const hasScheduledRoutes = savedItems.some(
    (i) => (i.type === 'place' || i.type === 'activity') && i.day !== 'Any time'
  );

  const activeHudMode:
    | 'playback'
    | 'lasso_prompt'
    | 'detour'
    | 'gravity'
    | 'zigzag'
    | 'none' = playbackDay && currentPlaybackSample
    ? 'playback'
    : drawnCircle
    ? 'lasso_prompt'
    : activeDetourLeg
    ? 'detour'
    : (activeHoveredHotel && hotelGravityReport) || (gravityPinned && stayGravity)
    ? 'gravity'
    : activeZigzag?.hasZigzag && dayFilter !== 'All' && !readOnly && onOptimizeItinerary
    ? 'zigzag'
    : 'none';

  return (
    <div
      ref={mapFrameRef}
      className="relative isolate w-full h-full rounded-[22px] overflow-hidden border border-black/[0.08]"
      style={{ backgroundColor: 'var(--v-map-bg)' }}
    >
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Subtle Time-of-Day Ambient Tint during "Play My Day" (Morning crisp -> Golden Hour warm) */}
      <AnimatePresence>
        {playbackDay && currentPlaybackSample && (
          <motion.div
            key={currentPlaybackSample.phase}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-0 z-[5]"
            style={{
              background:
                currentPlaybackSample.phase === 'evening'
                  ? 'radial-gradient(circle at 50% 45%, rgba(217,119,6,0.03) 35%, rgba(180,83,9,0.18) 100%)'
                  : currentPlaybackSample.phase === 'morning'
                  ? 'radial-gradient(circle at 50% 45%, rgba(254,243,199,0.04) 40%, rgba(14,32,52,0.08) 100%)'
                  : 'transparent',
            }}
          />
        )}
      </AnimatePresence>

      {/* Interactive SVG Lasso Capture Layer when Circle-to-Ask Drawing Mode is active */}
      {lassoDrawing && (
        <div
          onPointerDown={handleLassoPointerDown}
          onPointerMove={handleLassoPointerMove}
          onPointerUp={handleLassoPointerUp}
          className="absolute inset-0 z-[18] cursor-crosshair select-none touch-none bg-[#0E2034]/[0.06]"
        >
          <div className="absolute top-16 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-[#0E2034]/95 text-white text-[12px] font-medium shadow-lg flex items-center gap-2 pointer-events-none">
            <Crosshair className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Click &amp; drag to circle an area on the map · Esc to cancel</span>
          </div>
          {dragCirclePx && (
            <svg className="w-full h-full pointer-events-none">
              <circle
                cx={dragCirclePx.startX}
                cy={dragCirclePx.startY}
                r={dragCirclePx.radiusPx}
                fill="rgba(200, 90, 23, 0.14)"
                stroke="#C85A17"
                strokeWidth="2.2"
                strokeDasharray="6 5"
              />
              <circle cx={dragCirclePx.startX} cy={dragCirclePx.startY} r="4" fill="#C85A17" />
            </svg>
          )}
        </div>
      )}

      {/* Loading Indicator */}
      {!isReady && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-[13px] font-medium text-[#5A626A]">
          <Loader2 className="w-4 h-4 animate-spin text-[#C85A17]" />
          <span>Loading Google Maps...</span>
        </div>
      )}

      {/* Actionable Setup Card if Maps JavaScript API isn't enabled */}
      {loadError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 bg-[#F7F6F1]/95 backdrop-blur-xs">
          <div className="max-w-md rounded-[22px] bg-white border border-black/[0.09] p-6 shadow-lg space-y-3 text-center">
            <AlertCircle className="w-8 h-8 text-[#C85A17] mx-auto" />
            <h3 className="font-editorial text-[22px] font-medium text-[#14191F]">
              Enable Maps JavaScript API
            </h3>
            <p className="text-[13px] text-[#5A626A] leading-relaxed">{loadError}</p>
            <a
              href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[12.5px] font-medium"
            >
              Open Google Cloud Console →
            </a>
          </div>
        </div>
      )}

      {/* Top-Left Day Route Filter Bar + Play My Day Trigger */}
      <div className="absolute top-3.5 left-3.5 z-[20] flex flex-wrap items-center gap-1.5 max-w-[calc(100%-220px)]">
        <div
          className="flex items-center gap-1 rounded-full p-1 shadow-md border backdrop-blur-md"
          style={{
            backgroundColor: 'var(--v-surface)',
            borderColor: 'var(--v-border-strong)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setPlaybackDay(null);
              setIsPlaying(false);
              setDayFilter('All');
            }}
            className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer ${
              dayFilter === 'All' ? 'bg-[#0E2034]' : 'text-[#5A626A] hover:text-[#14191F]'
            }`}
          >
            All days
          </button>
          {days.map((m) => {
            const dot = m.dotColor;
            const active = dayFilter === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  setPlaybackDay(null);
                  setIsPlaying(false);
                  setDayFilter(m.key);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer ${
                  active ? 'bg-[#0E2034]' : 'text-[#5A626A] hover:text-[#14191F]'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                <span>{m.short}</span>
              </button>
            );
          })}
        </div>

        {/* Superpower 3 Trigger: Play My Day */}
        {playableDays.length > 0 && !playbackDay && (
          <button
            type="button"
            onClick={startPlayMyDay}
            title="Preview your day route chronologically"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 hover:bg-white border border-black/[0.1] shadow-md text-[11.5px] font-semibold text-[#14191F] transition-all active:scale-95 cursor-pointer"
          >
            <Play className="w-3 h-3 fill-[#C85A17] text-[#C85A17]" />
            <span>Preview</span>
          </button>
        )}
      </div>

      {/* Top-Right Compact Control Stack: Zoom + Circle-to-Ask + Stay Gravity */}
      <div className="absolute top-3.5 right-3.5 z-[20] flex flex-col items-center gap-2">
        <div className="flex flex-col rounded-full bg-white/95 shadow-md border border-black/[0.08] overflow-hidden">
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (map) map.setZoom((map.getZoom() || 13) + 1);
            }}
            className="w-9 h-9 hover:bg-black/[0.04] flex items-center justify-center text-[#14191F] transition-colors cursor-pointer border-b border-black/[0.06]"
            title="Zoom in"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (map) map.setZoom((map.getZoom() || 13) - 1);
            }}
            className="w-9 h-9 hover:bg-black/[0.04] flex items-center justify-center text-[#14191F] transition-colors cursor-pointer"
            title="Zoom out"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        {/* Minimal Superpower Dock (Circle-to-Ask + Stay Gravity) */}
        <div className="flex flex-col rounded-full bg-white/95 shadow-md border border-black/[0.08] overflow-hidden">
          {!readOnly && onAskArea && (
            <button
              type="button"
              onClick={() => {
                setActiveDetourLeg(null);
                setPlaybackDay(null);
                setIsPlaying(false);
                if (lassoDrawing || drawnCircle) {
                  setLassoDrawing(false);
                  setDrawnCircle(null);
                } else {
                  setLassoDrawing(true);
                }
              }}
              aria-label="Circle an area to ask Vesper"
              title="Circle an area to ask Vesper"
              className={`w-9 h-9 flex items-center justify-center transition-colors cursor-pointer ${
                stayGravity && hotels.length > 0 ? 'border-b border-black/[0.06]' : ''
              } ${
                lassoDrawing || drawnCircle
                  ? 'bg-[#C85A17] text-white'
                  : 'text-[#14191F] hover:bg-black/[0.04]'
              }`}
              style={lassoDrawing || drawnCircle ? { color: '#FFFFFF' } : undefined}
            >
              <Crosshair className="w-4 h-4" />
            </button>
          )}

          {stayGravity && hotels.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDayFilter('All');
                setGravityPinned((v) => !v);
              }}
              aria-label="Toggle Stay Gravity hotel proximity zone"
              title="Stay Gravity: compare hotel walk times to your stops"
              className={`w-9 h-9 flex items-center justify-center transition-colors cursor-pointer ${
                gravityPinned
                  ? 'bg-[#0E2034] text-white'
                  : 'text-[#14191F] hover:bg-black/[0.04]'
              }`}
              style={gravityPinned ? { color: '#FFFFFF' } : undefined}
            >
              <Magnet className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom-Left Quiet Caption (only shown when no contextual HUD is active) */}
      {hasScheduledRoutes && activeHudMode === 'none' && (
        <div
          className="hidden sm:inline-flex absolute bottom-7 left-3.5 z-[20] items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm border text-[11px] font-medium backdrop-blur-md pointer-events-none"
          style={{
            backgroundColor: 'var(--v-surface)',
            borderColor: 'var(--v-border)',
            color: 'var(--v-ink-muted)',
          }}
        >
          <span>
            {tripMode === 'roadtrip'
              ? 'Live highway route by day'
              : 'Tap + on any route arc for detours'}
          </span>
        </div>
      )}

      {/* ── SINGLE MUTUALLY-EXCLUSIVE BOTTOM-CENTER CONTEXT HUD (Zero Overlap!) ── */}
      <AnimatePresence mode="wait">
        {/* HUD 1: Play My Day Cinematic Playback */}
        {activeHudMode === 'playback' && currentPlaybackSample && (
          <motion.div
            key="hud-playback"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[25] w-[360px] max-w-[calc(100%-24px)] rounded-[20px] bg-white/96 backdrop-blur-md border border-black/[0.1] shadow-[0_14px_38px_rgba(14,32,52,0.18)] p-3.5 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#C85A17]">
                  <span>{playbackDay}</span>
                  <span>·</span>
                  <span>
                    {currentPlaybackSample.phase === 'evening'
                      ? 'Golden hour'
                      : currentPlaybackSample.phase === 'afternoon'
                      ? 'Afternoon'
                      : 'Morning'}
                  </span>
                  <span>·</span>
                  <span className="font-tabular">{currentPlaybackSample.stopTime}</span>
                </div>
                <div className="text-[13.5px] font-semibold text-[#14191F] truncate mt-0.5">
                  {currentPlaybackSample.stopTitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPlaybackDay(null);
                  setIsPlaying(false);
                }}
                aria-label="Close preview"
                className="p-1 rounded-full hover:bg-black/[0.06] text-[#5A626A] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrubbable Progress Bar */}
            <div className="w-full h-1.5 rounded-full bg-[#ECEAE2] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#0E2034] transition-all duration-100"
                style={{ width: `${Math.round(currentPlaybackSample.progress * 100)}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#4A535C]">
                <Footprints className="w-3.5 h-3.5 text-[#C85A17]" />
                <span className="font-tabular">
                  {currentPlaybackSample.cumulativeKm} km · {currentPlaybackSample.cumulativeTransitMins} min
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlaybackSpeed((s) => (s === 1 ? 2 : 1))}
                  className="px-2 py-1 rounded-full bg-[#F3F2EC] hover:bg-[#ECEAE2] font-tabular text-[11px] font-semibold text-[#2C333A] cursor-pointer"
                >
                  {playbackSpeed}x
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (playbackIdx >= playbackTrack.length - 1) setPlaybackIdx(0);
                    setIsPlaying((p) => !p);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[11.5px] font-semibold cursor-pointer"
                  style={{ color: '#FFFFFF' }}
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-white" />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
              </div>
            </div>

            {activeZigzag?.hasZigzag && !readOnly && onOptimizeItinerary && (
              <button
                type="button"
                onClick={() => {
                  setPlaybackDay(null);
                  setIsPlaying(false);
                  onOptimizeItinerary();
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 text-[11.5px] font-semibold text-amber-900 cursor-pointer transition-colors"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  <span>Zigzag detected — optimize saves ~{activeZigzag.savedMinutes} min</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        )}

        {/* HUD 2: Circle-to-Ask Vesper Spatial Prompt Popover */}
        {activeHudMode === 'lasso_prompt' && drawnCircle && (
          <motion.div
            key="hud-lasso"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[25] w-[360px] max-w-[calc(100%-24px)] rounded-[22px] bg-white/98 backdrop-blur-md border border-black/[0.1] shadow-[0_14px_38px_rgba(14,32,52,0.18)] p-3.5 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#14191F]">
                <Crosshair className="w-3.5 h-3.5 text-[#C85A17]" />
                <span>Ask Vesper inside this circle</span>
                <span className="font-tabular text-[11px] font-medium text-[#7B828A]">
                  (~{drawnCircle.radiusMeters >= 1000 ? `${(drawnCircle.radiusMeters / 1000).toFixed(1)}km` : `${drawnCircle.radiusMeters}m`})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDrawnCircle(null)}
                aria-label="Clear circle"
                className="p-1 rounded-full hover:bg-black/[0.06] text-[#5A626A] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SPATIAL_QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  disabled={isSearchingArea}
                  onClick={() => submitAreaQuery(chip.query)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF9F5] hover:bg-[#0E2034] hover:text-white border border-black/[0.09] text-[11.5px] font-medium text-[#14191F] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <chip.icon className="w-3 h-3 text-[#C85A17]" />
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitAreaQuery(areaPromptInput);
              }}
              className="flex items-center gap-1.5 rounded-full bg-[#F7F6F1] border border-black/[0.09] pl-3.5 pr-1.5 py-1"
            >
              <input
                type="text"
                value={areaPromptInput}
                onChange={(e) => setAreaPromptInput(e.target.value)}
                disabled={isSearchingArea}
                placeholder="Or ask for anything right here..."
                className="flex-1 min-w-0 bg-transparent text-[12.5px] text-[#14191F] placeholder:text-[#7B828A] focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSearchingArea || !areaPromptInput.trim()}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#0E2034] disabled:opacity-40 text-[11.5px] font-semibold cursor-pointer"
                style={{ color: '#FFFFFF' }}
              >
                {isSearchingArea ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>Ask</span>
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}

        {/* HUD 3: Along the Way Micro-Detour Popover */}
        {activeHudMode === 'detour' && activeDetourLeg && (
          <motion.div
            key="hud-detour"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[25] w-[360px] max-w-[calc(100%-24px)] rounded-[22px] bg-white/98 backdrop-blur-md border border-black/[0.1] shadow-[0_14px_38px_rgba(14,32,52,0.18)] p-3.5 space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#C85A17]">
                  Along the way · {activeDetourLeg.dayKey}
                </div>
                <div className="text-[12.5px] font-semibold text-[#14191F] truncate">
                  {activeDetourLeg.from.title} → {activeDetourLeg.to.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveDetourLeg(null)}
                aria-label="Close detours"
                className="p-1 rounded-full hover:bg-black/[0.06] text-[#5A626A] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'coffee', label: 'Coffee & Pastry', icon: Coffee },
                  { id: 'viewpoint', label: 'Viewpoint', icon: Eye },
                  { id: 'bite', label: 'Quick Bite', icon: Utensils },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDetourCategory(tab.id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                    detourCategory === tab.id
                      ? 'bg-[#0E2034] border-[#0E2034]'
                      : 'bg-[#FAF9F5] border-black/[0.08] text-[#4A535C] hover:border-black/[0.2]'
                  }`}
                  style={detourCategory === tab.id ? { color: '#FFFFFF' } : undefined}
                >
                  <tab.icon className="w-3 h-3" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {isLoadingDetours ? (
              <div className="py-5 flex items-center justify-center gap-2 text-[12px] text-[#7B828A]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C85A17]" />
                <span>Scanning gems along your route...</span>
              </div>
            ) : detourResults.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-[#7B828A]">
                No detours found right along this stretch—try another category.
              </div>
            ) : (
              <div className="space-y-1.5">
                {detourResults.map(({ place, detourMinutes }) => (
                  <div
                    key={place.id}
                    className="flex items-center justify-between gap-2.5 p-2 rounded-2xl bg-[#FAF9F5] border border-black/[0.06]"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPlace(place)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <SmartImage
                        src={place.image}
                        alt={place.name}
                        className="w-10 h-10 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-[#14191F] truncate">
                          {place.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#5A626A]">
                          <span className="inline-flex items-center gap-0.5 font-semibold text-[#14191F]">
                            <Star className="w-2.5 h-2.5 fill-[#C85A17] text-[#C85A17]" />
                            {place.rating.toFixed(1)}
                          </span>
                          <span>·</span>
                          <span className="font-tabular font-semibold text-emerald-700">
                            +{detourMinutes} min detour
                          </span>
                        </div>
                      </div>
                    </button>
                    {onAddDetourPlace && (
                      <button
                        type="button"
                        onClick={() => {
                          onAddDetourPlace(place, activeDetourLeg.dayKey, activeDetourLeg.midpointTime);
                          setActiveDetourLeg(null);
                        }}
                        className="px-2.5 py-1.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[11px] font-semibold cursor-pointer shrink-0"
                        style={{ color: '#FFFFFF' }}
                      >
                        + Slot in
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* HUD 4: Stay Gravity Live Hotel Proximity Readout */}
        {activeHudMode === 'gravity' && (
          <motion.div
            key="hud-gravity"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[25] max-w-[calc(100%-24px)] rounded-full bg-[#0E2034]/95 backdrop-blur-md shadow-[0_12px_32px_rgba(14,32,52,0.28)] px-4 py-2 flex items-center gap-2.5 text-white"
            style={{ color: '#FFFFFF' }}
          >
            <Magnet className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
            {activeHoveredHotel && hotelGravityReport ? (
              <div className="flex items-center gap-2 text-[12px] min-w-0">
                <span className="font-semibold truncate max-w-[140px]">
                  {hotelGravityReport.hotelName}
                </span>
                <span className="opacity-40">·</span>
                <span className="font-tabular font-semibold text-emerald-300 shrink-0">
                  Avg {hotelGravityReport.avgWalkMinutes} min walk
                </span>
                <span className="hidden sm:inline opacity-80 shrink-0">
                  ({hotelGravityReport.within12MinCount}/{hotelGravityReport.totalStops} within 12m)
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[12px]">
                <span className="font-semibold">Stay Gravity</span>
                <span className="opacity-80 hidden sm:inline">
                  Hover any hotel to measure walk times to your stops
                </span>
                <button
                  type="button"
                  onClick={() => setGravityPinned(false)}
                  aria-label="Close Stay Gravity"
                  className="p-0.5 rounded-full hover:bg-white/15 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* HUD 5: Passive Zigzag Warning when viewing a Day with backtracking */}
        {activeHudMode === 'zigzag' && activeZigzag && onOptimizeItinerary && (
          <motion.div
            key="hud-zigzag"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[25] max-w-[calc(100%-24px)]"
          >
            <button
              type="button"
              onClick={onOptimizeItinerary}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50/98 hover:bg-amber-100 border border-amber-300/90 shadow-lg text-[12px] font-semibold text-amber-950 cursor-pointer transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                Cross-town zigzag on {activeZigzag.dayKey} · Optimize saves ~
                {activeZigzag.savedMinutes} min
              </span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
