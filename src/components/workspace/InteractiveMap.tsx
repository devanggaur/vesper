import React, { useEffect, useRef, useState } from 'react';
import { Plus, Minus, AlertCircle, Loader2 } from 'lucide-react';
import { Coordinates, HotelItem, PlaceItem, TripDayMeta, TripSavedItem } from '../../types/travel';
import { VesperTheme } from '../common/ThemeSwitcher';
import { buildCurvedArcPoints } from '../../utils/geo';
import { parseStartTimeMinutes } from '../../utils/time';
import { loadGoogleMaps } from '../../utils/googleMapsLoader';
import { getGoogleMapStyles } from '../../utils/googleMapStyles';
import { DEFAULT_CDMX_DAYS } from '../../services/travelApi';

interface InteractiveMapProps {
  mapStage: 'continent' | 'city' | 'pins';
  theme: VesperTheme;
  center?: Coordinates;
  days?: TripDayMeta[];
  places: PlaceItem[];
  hotels: HotelItem[];
  savedItems: TripSavedItem[];
  showHotelPins: boolean;
  highlightedId: string | null;
  focusedDay?: string;
  onSelectPlace: (place: PlaceItem) => void;
  onSelectHotel: (hotel: HotelItem) => void;
}

const DARK_ROUTE_PALETTE = ['#E5C585', '#60A5FA', '#34D399', '#C084FC', '#FBBF24'];

/**
 * Lightweight Google Maps OverlayView rendering rich interactive HTML pins
 * (Vesper photo cards & hotel price pills) without requiring a Cloud Map ID.
 */
function createHtmlOverlay(
  g: typeof google,
  position: Coordinates,
  html: string,
  zIndex: number,
  onClick: () => void
): google.maps.OverlayView {
  class HtmlPinOverlay extends g.maps.OverlayView {
    private div: HTMLDivElement | null = null;

    onAdd() {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.transform = 'translate(-50%, -85%)';
      div.style.cursor = 'pointer';
      div.style.zIndex = String(zIndex);
      div.innerHTML = html;
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
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

/**
 * Interactive Google Maps JS API spatial canvas with bespoke Twilight / Nocturne / Olive styles,
 * curved quadratic Bezier day-by-day route arcs, numbered photo-card stop markers, and hotel pills.
 */
export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  mapStage,
  theme,
  center = { lat: 19.426, lng: -99.172 },
  days = DEFAULT_CDMX_DAYS,
  places,
  hotels,
  savedItems,
  showHotelPins,
  highlightedId,
  focusedDay = 'All',
  onSelectPlace,
  onSelectHotel,
}) => {
  const [dayFilter, setDayFilter] = useState<string>(focusedDay);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const googleRef = useRef<typeof google | null>(null);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const overlaysRef = useRef<google.maps.OverlayView[]>([]);
  const prevCenterKeyRef = useRef<string>('');

  useEffect(() => {
    setDayFilter(focusedDay);
  }, [focusedDay]);

  // 1. Load Google Maps JS API once & initialize map instance
  useEffect(() => {
    let cancelled = false;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

    // Capture Google Maps API auth / activation failures cleanly
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
          styles: getGoogleMapStyles(theme),
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
      polylinesRef.current = [];
      overlaysRef.current = [];
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Apply custom Twilight / Nocturne / Olive Google Maps styling reactively
  useEffect(() => {
    if (!mapRef.current || !isReady) return;
    mapRef.current.setOptions({ styles: getGoogleMapStyles(theme) });
  }, [theme, isReady]);

  // 3. Recenter smoothly when destination coordinates change
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

  // 4. Render Curved Day Route Arcs + Photo-Card Pins + Hotel Price Badges
  useEffect(() => {
    const map = mapRef.current;
    const g = googleRef.current;
    if (!map || !g || !isReady) return;

    // Clear previous overlays & arcs
    polylinesRef.current.forEach((p) => p.setMap(null));
    overlaysRef.current.forEach((o) => o.setMap(null));
    polylinesRef.current = [];
    overlaysRef.current = [];

    const stopOrderBadge = new Map<string, { num: number; color: string }>();

    // Curved quadratic Bezier route arcs for each day
    days.forEach((meta, dayIdx) => {
      if (dayFilter !== 'All' && dayFilter !== meta.key) return;

      const dayStops = savedItems
        .filter((i) => (i.type === 'place' || i.type === 'activity') && i.day === meta.key && i.coords)
        .sort((a, b) => parseStartTimeMinutes(a.time) - parseStartTimeMinutes(b.time));

      const lineColor =
        theme === 'nocturne'
          ? DARK_ROUTE_PALETTE[dayIdx % DARK_ROUTE_PALETTE.length]
          : meta.dotColor;

      dayStops.forEach((st, idx) => {
        stopOrderBadge.set(st.refId, { num: idx + 1, color: lineColor });
      });

      for (let i = 0; i < dayStops.length - 1; i++) {
        const pts = buildCurvedArcPoints(dayStops[i].coords!, dayStops[i + 1].coords!).map(
          ([lat, lng]) => ({ lat, lng })
        );

        // Soft outer halo
        const halo = new g.maps.Polyline({
          path: pts,
          geodesic: false,
          strokeColor: lineColor,
          strokeOpacity: theme === 'nocturne' ? 0.24 : 0.16,
          strokeWeight: 7,
          map,
        });

        // Crisp dashed inner route arc
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
    });

    const savedRefIds = new Set(savedItems.map((s) => s.refId));
    const activeDayRefIds =
      dayFilter === 'All'
        ? null
        : new Set(savedItems.filter((s) => s.day === dayFilter).map((s) => s.refId));

    const defaultPinIds = new Set(places.slice(0, 8).map((p) => p.id));
    const visiblePlaces = places.filter((p) => {
      if (activeDayRefIds) return activeDayRefIds.has(p.id);
      return savedRefIds.has(p.id) || defaultPinIds.has(p.id);
    });

    // Place Photo-Card Markers
    visiblePlaces.forEach((place) => {
      const isSaved = savedRefIds.has(place.id);
      const badge = stopOrderBadge.get(place.id);
      const isHighlighted = highlightedId === place.id;
      const truncated = place.name.length > 15 ? `${place.name.slice(0, 14)}...` : place.name;

      const html = `
        <div class="group flex flex-col items-center transition-transform duration-200 ${
          isHighlighted ? 'scale-110' : 'hover:scale-105'
        }">
          <div class="w-[54px] h-[54px] rounded-[12px] p-[3px] shadow-[0_8px_22px_rgba(0,0,0,0.28)] border-2 overflow-visible relative" style="background: var(--v-surface); border-color: ${
            badge ? badge.color : isSaved ? 'var(--v-cta)' : 'var(--v-surface)'
          };">
            <img src="${place.image}" alt="${place.name.replace(/"/g, '&quot;')}" class="w-full h-full object-cover rounded-[8px]" />
            ${
              badge
                ? `<span class="absolute -top-2 -left-2 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow" style="background: ${badge.color}; font-family: var(--v-font-mono);">${badge.num}</span>`
                : isSaved
                ? '<span class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold shadow" style="background: var(--v-cta); color: var(--v-cta-text);">✓</span>'
                : ''
            }
          </div>
          <div class="mt-1 px-2 py-0.5 rounded-md backdrop-blur-sm shadow-sm border text-[10.5px] font-semibold whitespace-nowrap leading-tight" style="background: var(--v-surface); border-color: var(--v-border); color: var(--v-ink);">
            ${truncated}
          </div>
        </div>
      `;

      const overlay = createHtmlOverlay(
        g,
        place.coords,
        html,
        isHighlighted ? 90 : badge ? 60 : 30,
        () => onSelectPlace(place)
      );
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    // Hotel Price Pills
    if (showHotelPins && dayFilter === 'All') {
      hotels.forEach((hotel) => {
        const isHighlighted = highlightedId === hotel.id;
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
          isHighlighted ? 95 : 20,
          () => onSelectHotel(hotel)
        );
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
      });
    }

    // Auto-fit bounds cleanly when isolating a single day's stops
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
    }
  }, [
    isReady,
    theme,
    days,
    places,
    hotels,
    savedItems,
    showHotelPins,
    highlightedId,
    dayFilter,
    onSelectPlace,
    onSelectHotel,
  ]);

  const hasScheduledRoutes = savedItems.some(
    (i) => (i.type === 'place' || i.type === 'activity') && i.day !== 'Any time'
  );

  return (
    <div
      className="relative isolate w-full h-full rounded-[22px] overflow-hidden border border-black/[0.08]"
      style={{ backgroundColor: 'var(--v-map-bg)' }}
    >
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Loading Indicator */}
      {!isReady && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-[13px] font-medium text-[#5A626A]">
          <Loader2 className="w-4 h-4 animate-spin text-[#C85A17]" />
          <span>Loading Google Maps...</span>
        </div>
      )}

      {/* Actionable Setup Card if Maps JavaScript API isn't enabled on the key yet */}
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

      {/* Top-Left Day Route Filter Legend */}
      <div className="absolute top-3.5 left-3.5 z-[20] flex flex-wrap items-center gap-1.5 max-w-[calc(100%-64px)]">
        <div
          className="flex items-center gap-1 rounded-full p-1 shadow-md border backdrop-blur-md"
          style={{
            backgroundColor: 'var(--v-surface)',
            borderColor: 'var(--v-border-strong)',
          }}
        >
          <button
            type="button"
            onClick={() => setDayFilter('All')}
            className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-colors cursor-pointer ${
              dayFilter === 'All' ? 'bg-[#0E2034]' : 'text-[#5A626A] hover:text-[#14191F]'
            }`}
          >
            All days
          </button>
          {days.map((m, idx) => {
            const dot =
              theme === 'nocturne'
                ? DARK_ROUTE_PALETTE[idx % DARK_ROUTE_PALETTE.length]
                : m.dotColor;
            const active = dayFilter === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setDayFilter(m.key)}
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

        {hasScheduledRoutes && (
          <div
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-sm border text-[11px] font-medium backdrop-blur-md"
            style={{
              backgroundColor: 'var(--v-surface)',
              borderColor: 'var(--v-border)',
              color: 'var(--v-ink-muted)',
            }}
          >
            <span>Curved arcs connect each day’s route</span>
          </div>
        )}
      </div>

      {/* Top-Right Custom Zoom Controls */}
      <div className="absolute top-3.5 right-3.5 z-[20] flex flex-col rounded-full bg-white/95 shadow-md border border-black/[0.08] overflow-hidden">
        <button
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
    </div>
  );
};
