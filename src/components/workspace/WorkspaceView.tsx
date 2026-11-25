import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  Compass,
  CalendarDays,
  Map as MapIcon,
  Briefcase,
  Sparkles,
  SlidersHorizontal,
  Loader2,
  Share2,
} from 'lucide-react';
import {
  ActivityItem,
  ChatMessage,
  Coordinates,
  DiscoverSection,
  FareClass,
  FlightOption,
  HotelItem,
  HotelRoom,
  LoyaltyProgramEntry,
  PlaceItem,
  TripDayMeta,
  TripSavedItem,
} from '../../types/travel';
import { DEFAULT_CDMX_DAYS, travelApi } from '../../services/travelApi';
import { BrandMark } from '../common/BrandMark';
import { ThemeSwitcher, VesperTheme } from '../common/ThemeSwitcher';
import { TasteCard, TasteProfile } from './TasteCard';
import { ActivityCarousel, PlaceCarousel } from './DiscoverCarousels';
import { CanvasTimeline } from './CanvasTimeline';
import { CanvasBookings } from './CanvasBookings';
import { InteractiveMap } from './InteractiveMap';
import { ContextualEditorialSheet, EditorialSheetTarget } from './ContextualEditorialSheet';
import { BookingCheckoutModal } from './BookingCheckoutModal';
import { CoPilotRail } from './CoPilotRail';

export type CanvasTab = 'discover' | 'timeline' | 'map' | 'bookings';

interface WorkspaceViewProps {
  tripId?: string;
  tripSlug?: string;
  initialPrompt: string;
  initialDates?: string;
  initialTravelers?: string;
  initialFocusMode?: 'flights' | 'stays' | 'activities';
  savedDefaultTaste?: TasteProfile | null;
  homeAirport?: string;
  loyaltyPrograms?: LoyaltyProgramEntry[];
  onChangeHomeAirport?: (airport: string) => void;
  onSaveDefaultTaste?: (profile: TasteProfile) => void;
  onOpenLoyaltyWallet?: (category: 'hotel' | 'airline') => void;
  theme: VesperTheme;
  onChangeTheme: (t: VesperTheme) => void;
  onOpenSidebar: () => void;
  onTripLoaded?: (meta: { id: string; slug: string; title: string }) => void;
  onTripTitleChange: (title: string) => void;
  onNotify: (msg: string) => void;
}

const DEFAULT_TRIP_TITLE = 'Mexico City Modernist Weekend';

/**
 * Primary Vesper Workspace orchestrating:
 * - Left 66% (Desktop) / 100% (Mobile): Live Trip Canvas (`Discover` | `Timeline` | `Map` | `Bookings`)
 *   with contextual floating `ContextualEditorialSheet` detail drawers scoped inside it.
 * - Right 34% (Desktop) / Slide-up FAB Sheet (Mobile): Live, context-aware `CoPilotRail`
 *   backed by Gemini Interactions API + Google Places (New) + Supabase Postgres.
 */
export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  tripId: existingTripId,
  tripSlug: existingTripSlug,
  initialPrompt,
  initialDates = 'Fri, Jun 19 – Sun, Jun 21',
  initialTravelers = '2 adults',
  initialFocusMode,
  savedDefaultTaste,
  homeAirport,
  loyaltyPrograms = [],
  onChangeHomeAirport,
  onSaveDefaultTaste,
  onOpenLoyaltyWallet,
  theme,
  onChangeTheme,
  onOpenSidebar,
  onTripLoaded,
  onTripTitleChange,
  onNotify,
}) => {
  // Seed fallback catalog (replaced dynamically once Gemini + Google Places compose the trip)
  const fallbackCatalog = useMemo(() => travelApi.getDiscoverCatalog('Mexico City'), []);
  const fallbackHotels = useMemo(() => travelApi.getHotels('Mexico City'), []);

  // Live trip metadata from Supabase + Gemini
  const [liveTripId, setLiveTripId] = useState<string | null>(existingTripId || null);
  const [liveTripSlug, setLiveTripSlug] = useState<string | null>(existingTripSlug || null);
  const [tripTitle, setTripTitle] = useState(DEFAULT_TRIP_TITLE);
  const [destination, setDestination] = useState('your destination');
  const [datesLabel, setDatesLabel] = useState(initialDates);
  const [travelersLabel, setTravelersLabel] = useState(initialTravelers);
  const [days, setDays] = useState<TripDayMeta[]>(DEFAULT_CDMX_DAYS);
  const [mapCenter, setMapCenter] = useState<Coordinates>({ lat: 19.426, lng: -99.172 });
  const [heroImage, setHeroImage] = useState<string>('');

  // Dynamic Discover + Bookings catalog
  const [activitiesTitle, setActivitiesTitle] = useState('Experiences & Guided Walks');
  const [activities, setActivities] = useState<ActivityItem[]>(fallbackCatalog.activities);
  const [places, setPlaces] = useState<PlaceItem[]>(fallbackCatalog.places);
  const [discoverSections, setDiscoverSections] = useState<DiscoverSection[] | null>(null);
  const [hotels, setHotels] = useState<HotelItem[]>(fallbackHotels);
  const [isComposingCatalog, setIsComposingCatalog] = useState(false);

  // Core workspace navigation & calibration state
  const [tasteCalibrated, setTasteCalibrated] = useState(
    Boolean(existingTripId || existingTripSlug) ||
      initialFocusMode === 'stays' ||
      initialFocusMode === 'flights'
  );
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);
  const [activeTab, setActiveTab] = useState<CanvasTab>(
    initialFocusMode === 'stays' || initialFocusMode === 'flights' ? 'bookings' : 'discover'
  );
  const [bookingsSubTab, setBookingsSubTab] = useState<'stays' | 'flights'>(
    initialFocusMode === 'flights' ? 'flights' : 'stays'
  );
  const [focusedMapDay, setFocusedMapDay] = useState<string>('All');

  // Trip items & interaction state
  const [savedItems, setSavedItems] = useState<TripSavedItem[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [sheetTarget, setSheetTarget] = useState<EditorialSheetTarget | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  // Co-Pilot conversation state
  const [mobileCopilotOpen, setMobileCopilotOpen] = useState(false);
  const [hasUnreadCopilot, setHasUnreadCopilot] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [thinkingLabel, setThinkingLabel] = useState<string | null>(null);
  const [statusStep, setStatusStep] = useState<string | null>(null);

  // Keep latest tripId in a ref for async handlers (e.g., if user clicks TasteCard rapidly)
  const tripCreatePromiseRef = useRef<Promise<string | null> | null>(null);

  /** Persists saved items to Supabase asynchronously without blocking UI updates */
  const persistItems = (nextItems: TripSavedItem[], explicitTripId?: string | null) => {
    const id = explicitTripId ?? liveTripId;
    if (!id) return;
    travelApi.syncTripItems(id, nextItems).catch(() => {
      // Non-fatal in offline mode
    });
  };

  /* ── Initialize Trip (Load by ID or `/t/:slug`, OR create fresh via Gemini + Places) ─ */
  useEffect(() => {
    let cancelled = false;

    if (existingTripId || existingTripSlug) {
      setThinkingLabel('Loading saved trip...');
      const loader = existingTripSlug
        ? travelApi.getTripBySlug(existingTripSlug)
        : travelApi.getTrip(existingTripId!);

      loader
        .then(({ trip, items, messages: savedMsgs }) => {
          if (cancelled) return;
          setThinkingLabel(null);
          setLiveTripId(trip.id);
          setLiveTripSlug(trip.slug);
          setTripTitle(trip.title);
          setDestination(trip.destination);
          setDatesLabel(trip.datesLabel);
          setTravelersLabel(trip.travelers);
          if (trip.days?.length) setDays(trip.days);
          setMapCenter(trip.center);
          if (trip.heroImage) setHeroImage(trip.heroImage);
          if (trip.tasteProfile) setTasteProfile(trip.tasteProfile);
          if (trip.catalog) {
            setActivitiesTitle(trip.catalog.activitiesTitle);
            setActivities(trip.catalog.activities);
            setPlaces(trip.catalog.places);
            setDiscoverSections(trip.catalog.sections);
            setHotels(trip.catalog.hotels);
            setTasteCalibrated(true);
            // If opening a shared trip that already has scheduled stops, open straight to Timeline!
            if (existingTripSlug && (items || []).length > 0) {
              setActiveTab('timeline');
            }
          } else {
            setTasteCalibrated(false);
          }
          setSavedItems(items || []);
          setMessages(savedMsgs || []);
          onTripTitleChange(trip.title);
          onTripLoaded?.({ id: trip.id, slug: trip.slug, title: trip.title });
        })
        .catch(() => {
          if (!cancelled) {
            setThinkingLabel(null);
            onNotify('Could not find that shared trip link');
          }
        });
      return () => {
        cancelled = true;
      };
    }

    // New trip: kick off Gemini prompt parsing + destination hero lookup in the background
    // while the user interacts with the 5-Second TasteCard!
    const userMsg: ChatMessage = { id: 'init-u', role: 'user', text: initialPrompt };
    setMessages([userMsg]);
    setThinkingLabel('Understanding your trip...');

    const createPromise = travelApi
      .createTrip({
        prompt: initialPrompt,
        datesLabel: initialDates,
        travelers: initialTravelers,
      })
      .then(({ trip, messages: initMsgs }) => {
        if (cancelled) return null;
        setThinkingLabel(null);
        setLiveTripId(trip.id);
        setLiveTripSlug(trip.slug);
        setTripTitle(trip.title);
        setDestination(trip.destination);
        setDatesLabel(trip.datesLabel);
        setTravelersLabel(trip.travelers);
        if (trip.days?.length) setDays(trip.days);
        setMapCenter(trip.center);
        if (trip.heroImage) setHeroImage(trip.heroImage);
        setMessages(initMsgs);
        onTripTitleChange(trip.title);
        onTripLoaded?.({ id: trip.id, slug: trip.slug, title: trip.title });
        return trip.id;
      })
      .catch(() => {
        if (cancelled) return null;
        setThinkingLabel(null);
        setDestination('Mexico City');
        setMessages([
          userMsg,
          {
            id: 'init-a',
            role: 'assistant',
            blocks: [
              {
                type: 'text',
                content:
                  "Welcome to **Vesper**. Set your quick preferences on the left—I'll put together your canvas, cluster stops by neighborhood, and stay right here to help you tweak or book anything.",
              },
            ],
          },
        ]);
        return null;
      });

    tripCreatePromiseRef.current = createPromise;

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savedRefIds = new Set(savedItems.map((i) => i.refId));
  const totalCost = savedItems.reduce((sum, i) => sum + (i.price || 0), 0);

  /* ── Taste Calibration -> Live Gemini + Google Places Discover Feed ──── */
  const handleTasteSubmit = async (profile: TasteProfile) => {
    setTasteProfile(profile);
    onSaveDefaultTaste?.(profile);
    setTasteCalibrated(true);
    setActiveTab('discover');
    setIsComposingCatalog(true);

    setMessages((prev) => [
      ...prev,
      {
        id: `taste-u-${Date.now()}`,
        role: 'user',
        text: `${profile.travelers} · ${profile.vibes.join(', ')} · ${profile.pace} pace · ${profile.splurge} style`,
      },
    ]);

    setStatusStep('Curating real places, photos & stays...');

    try {
      const resolvedTripId = liveTripId || (await tripCreatePromiseRef.current);
      if (resolvedTripId) {
        const res = await travelApi.composeTrip(resolvedTripId, {
          ...profile,
          loyaltyPrograms: loyaltyPrograms.length > 0 ? loyaltyPrograms : undefined,
        });
        setActivitiesTitle(res.catalog.activitiesTitle);
        setActivities(res.catalog.activities);
        setPlaces(res.catalog.places);
        setDiscoverSections(res.catalog.sections);
        setHotels(res.catalog.hotels);
        setMapCenter(res.center);
        if (res.heroImage) setHeroImage(res.heroImage);
        setStatusStep(null);
        setIsComposingCatalog(false);
        setHasUnreadCopilot(true);
        setMessages((prev) => [...prev, res.assistantMessage]);
        return;
      }
    } catch (err) {
      console.warn('[vesper] composeTrip fallback:', err);
    }

    // Fallback when API server is offline
    setStatusStep(null);
    setIsComposingCatalog(false);
    setHasUnreadCopilot(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `taste-a-${Date.now()}`,
        role: 'assistant',
        blocks: [
          {
            type: 'text',
            content: `Composed your **${destination}** canvas for **${profile.travelers}** around **${profile.vibes
              .slice(0, 3)
              .join(', ')}** at a **${profile.pace.toLowerCase()}** pace.`,
          },
          {
            type: 'suggestions',
            items: [
              'Auto-route my itinerary into days',
              `Find quiet boutique hotels in ${destination}`,
              'View my stops on the Map',
            ],
          },
        ],
      },
    ]);
  };

  /* ── Trip Item Mutations (Places, Activities, Hotels, Flights) ───────── */
  const handleToggleSavePlace = (place: PlaceItem) => {
    const exists = savedItems.some((i) => i.refId === place.id);
    if (exists) {
      const next = savedItems.filter((i) => i.refId !== place.id);
      setSavedItems(next);
      persistItems(next);
      onNotify(`Removed ${place.name}`);
      return;
    }
    const next: TripSavedItem[] = [
      ...savedItems,
      {
        id: `saved-${place.id}`,
        refId: place.id,
        type: 'place',
        title: place.name,
        subtitle: place.neighborhood,
        image: place.image,
        day: 'Any time',
        coords: place.coords,
      },
    ];
    setSavedItems(next);
    persistItems(next);
    onNotify(`Added ${place.name} to Timeline`);
  };

  const handleAddActivity = (
    activity: ActivityItem,
    day: string,
    time: string,
    endTime: string,
    _guests: number,
    total: number
  ) => {
    const next: TripSavedItem[] = [
      ...savedItems.filter((i) => i.refId !== activity.id),
      {
        id: `saved-${activity.id}`,
        refId: activity.id,
        type: 'activity',
        title: activity.title,
        subtitle: destination,
        image: activity.image,
        day,
        time: `${time} – ${endTime}`,
        price: total,
        coords: activity.coords,
      },
    ];
    setSavedItems(next);
    persistItems(next);
    setActiveTab('timeline');
    onNotify(`Added ${activity.title} ($${total}) on ${day}`);
    setMessages((prev) => [
      ...prev,
      {
        id: `act-add-${Date.now()}`,
        role: 'assistant',
        blocks: [
          {
            type: 'text',
            content: `Anchored **${activity.title}** on **${day} (${time} – ${endTime})** for **$${total}**. Want me to route the rest of your trip around it?`,
          },
        ],
      },
    ]);
  };

  const handleAddHotel = (hotel: HotelItem, room: HotelRoom, price: number) => {
    const firstDay = days[0]?.key || 'Day 1';
    const lastDay = days[days.length - 1]?.key || 'Day 3';
    const next: TripSavedItem[] = [
      ...savedItems.filter((i) => i.type !== 'hotel'),
      {
        id: `saved-${hotel.id}`,
        refId: hotel.id,
        type: 'hotel',
        title: hotel.name,
        subtitle: room.name,
        image: hotel.image,
        day: firstDay,
        price,
        coords: hotel.coords,
        hotelDetails: {
          checkIn: firstDay,
          checkOut: lastDay,
          roomName: room.name,
        },
      },
    ];
    setSavedItems(next);
    persistItems(next);
    setActiveTab('timeline');
    onNotify(`Added ${hotel.name} ($${price}) to your trip`);
    setMessages((prev) => [
      ...prev,
      {
        id: `htl-add-${Date.now()}`,
        role: 'assistant',
        blocks: [
          {
            type: 'text',
            content: `Locked in **${hotel.name}** (${room.name}, **$${price}** total). Well positioned in **${hotel.neighborhood}** for your daily route.`,
          },
          {
            type: 'suggestions',
            items: ['View curved day routes on Map', 'Auto-route my stops into days'],
          },
        ],
      },
    ]);
  };

  const handleAddFlights = (outbound: FlightOption, inbound: FlightOption, fare: FareClass) => {
    const firstDay = days[0]?.key || 'Day 1';
    const next: TripSavedItem[] = [
      ...savedItems.filter((i) => i.type !== 'flight'),
      {
        id: `saved-flt-${outbound.id}-${inbound.id}`,
        refId: outbound.id,
        type: 'flight',
        title: `${outbound.airline} Round-Trip (${outbound.fromCode} ⇄ ${outbound.toCode})`,
        subtitle: `${fare.name} · ${travelersLabel}`,
        image: '',
        day: firstDay,
        time: `${outbound.departTime} – ${outbound.arriveTime}`,
        price: fare.price,
        flightDetails: {
          outbound,
          inbound,
          fareName: fare.name,
          passengers: 2,
        },
      },
    ];
    setSavedItems(next);
    persistItems(next);
    setActiveTab('timeline');
    onNotify(`Added ${outbound.airline} ${fare.name} flights ($${fare.price.toLocaleString()})`);
    setMessages((prev) => [
      ...prev,
      {
        id: `flt-add-${Date.now()}`,
        role: 'assistant',
        blocks: [
          {
            type: 'text',
            content: `Added **${outbound.airline} ${fare.name}** (${outbound.departTime} → ${outbound.arriveTime}) for **$${fare.price.toLocaleString()}**. Your trip is ready for checkout!`,
          },
        ],
      },
    ]);
  };

  /* ── Live Gemini Spatial Auto-Routing Across Trip Days ───────────────── */
  const runOrganizeItinerary = async (userPrompt?: string) => {
    if (isOrganizing) return;
    setIsOrganizing(true);
    setTasteCalibrated(true);
    setSheetTarget(null);
    setActiveTab('timeline');

    if (userPrompt) {
      setMessages((prev) => [...prev, { id: `org-u-${Date.now()}`, role: 'user', text: userPrompt }]);
    }

    // Seed top discovered highlights if the user clicks auto-route before saving places manually
    let working = [...savedItems];
    const stopCount = working.filter((i) => i.type === 'place' || i.type === 'activity').length;
    if (stopCount < 4 && places.length > 0) {
      const existing = new Set(working.map((i) => i.refId));
      const seedPlaces = places
        .filter((p) => !existing.has(p.id))
        .slice(0, 6)
        .map<TripSavedItem>((p) => ({
          id: `saved-${p.id}`,
          refId: p.id,
          type: 'place',
          title: p.name,
          subtitle: p.neighborhood,
          image: p.image,
          day: 'Any time',
          coords: p.coords,
        }));
      working = [...working, ...seedPlaces];
      if (!working.some((i) => i.type === 'activity') && activities[0]) {
        const act = activities[0];
        working.push({
          id: `saved-${act.id}`,
          refId: act.id,
          type: 'activity',
          title: act.title,
          subtitle: destination,
          image: act.image,
          day: days[0]?.key || 'Day 1',
          time: '9:30 AM – 12:00 PM',
          price: act.pricePerPerson,
          coords: act.coords,
        });
      }
      setSavedItems(working);
    }

    setStatusStep('Clustering stops by neighborhood & transit...');

    try {
      const resolvedTripId = liveTripId || (await tripCreatePromiseRef.current);
      if (resolvedTripId) {
        const res = await travelApi.organizeTrip(resolvedTripId, working);
        setSavedItems(res.items);
        setIsOrganizing(false);
        setStatusStep(null);
        setHasUnreadCopilot(true);
        setMessages((prev) => [...prev, res.assistantMessage]);
        return;
      }
    } catch (err) {
      console.warn('[vesper] organizeTrip fallback:', err);
    }

    // Offline fallback scheduling
    const fallbackScheduled = working.map((item, idx) => {
      if (item.day !== 'Any time') return item;
      const d = days[idx % days.length]?.key || 'Day 1';
      const slots = ['10:00 AM', '1:30 PM', '4:30 PM', '7:30 PM'];
      return { ...item, day: d, time: slots[idx % slots.length] };
    });
    setSavedItems(fallbackScheduled);
    setIsOrganizing(false);
    setStatusStep(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `org-done-${Date.now()}`,
        role: 'assistant',
        blocks: [
          {
            type: 'text',
            content:
              'Routed your stops across your trip days with live transit connectors. Open **Map** to see your curved day routes!',
          },
        ],
      },
    ]);
  };

  /* ── Live SSE Streaming + Itinerary-Mutating Gemini Co-Pilot ─────────── */
  const handleCoPilotSend = async (text: string) => {
    const lower = text.toLowerCase();

    // Fast-path explicit auto-route trigger
    if (lower.includes('auto-route') || lower.includes('organize my')) {
      runOrganizeItinerary(text);
      return;
    }

    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
    setThinkingLabel('Thinking...');
    setStreamingText(null);

    const inspectingEntity = sheetTarget
      ? {
          kind: sheetTarget.kind,
          name: sheetTarget.kind === 'activity' ? sheetTarget.item.title : sheetTarget.item.name,
          details:
            sheetTarget.kind === 'hotel'
              ? `${sheetTarget.item.neighborhood}, $${sheetTarget.item.priceTotal}, rating ${sheetTarget.item.rating}/10`
              : sheetTarget.kind === 'place'
              ? `${sheetTarget.item.neighborhood}, ${sheetTarget.item.category}, ${sheetTarget.item.hours.openSchedule}`
              : `${sheetTarget.item.duration}, $${sheetTarget.item.pricePerPerson}/person`,
        }
      : null;

    const applyAction = (action?: { type: string; tab?: CanvasTab }) => {
      if (!action) return;
      if (action.type === 'organize') {
        runOrganizeItinerary();
      } else if (action.type === 'open_map') {
        setSheetTarget(null);
        setActiveTab('map');
        setFocusedMapDay('All');
        setMobileCopilotOpen(false);
      } else if (action.type === 'open_bookings_stays') {
        setTasteCalibrated(true);
        setSheetTarget(null);
        setActiveTab('bookings');
        setBookingsSubTab('stays');
        setMobileCopilotOpen(false);
      } else if (action.type === 'open_bookings_flights') {
        setTasteCalibrated(true);
        setSheetTarget(null);
        setActiveTab('bookings');
        setBookingsSubTab('flights');
        setMobileCopilotOpen(false);
      } else if (action.type === 'switch_tab' && action.tab) {
        setSheetTarget(null);
        setActiveTab(action.tab);
      }
    };

    try {
      const resolvedTripId = liveTripId || (await tripCreatePromiseRef.current);
      if (resolvedTripId) {
        let finished = false;
        await travelApi.streamCoPilotMessage(
          resolvedTripId,
          {
            message: text,
            activeTab,
            savedItems,
            inspectingEntity,
          },
          {
            onDelta: (chunk) => {
              setThinkingLabel(null);
              setStreamingText((prev) => (prev || '') + chunk);
            },
            onStatus: (label) => {
              setThinkingLabel(null);
              setStatusStep(label);
            },
            onMutation: ({ items, addedPlaces, toast }) => {
              setSavedItems(items);
              if (addedPlaces && addedPlaces.length > 0) {
                setPlaces((prev) => {
                  const existing = new Set(prev.map((p) => p.id));
                  return [...prev, ...addedPlaces.filter((p) => !existing.has(p.id))];
                });
              }
              if (toast) onNotify(toast);
            },
            onDone: ({ assistantMessage, action }) => {
              finished = true;
              setThinkingLabel(null);
              setStatusStep(null);
              setStreamingText(null);
              setMessages((prev) => [...prev, assistantMessage]);
              applyAction(action);
            },
          }
        );
        if (finished) return;
      }
    } catch (err) {
      console.warn('[vesper] streamCoPilot fallback:', err);
      setStreamingText(null);
      setStatusStep(null);
    }

    setThinkingLabel(null);
    setStreamingText(null);
    setStatusStep(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        blocks: [
          {
            type: 'text',
            content: `Noted for **${destination}**! You can organize your stops on the **Timeline**, inspect curved routes on **Map**, or browse stays in **Bookings**.`,
          },
        ],
      },
    ]);
  };

  const handleToggleLike = (id: string) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInspectTimelineItem = (item: TripSavedItem) => {
    if (item.type === 'place') {
      const p = places.find((x) => x.id === item.refId) || travelApi.findPlaceById(item.refId);
      if (p) setSheetTarget({ kind: 'place', item: p });
    } else if (item.type === 'activity') {
      const a = activities.find((x) => x.id === item.refId) || travelApi.findActivityById(item.refId);
      if (a) setSheetTarget({ kind: 'activity', item: a });
    } else if (item.type === 'hotel') {
      const h = hotels.find((x) => x.id === item.refId) || travelApi.findHotelById(item.refId);
      if (h) setSheetTarget({ kind: 'hotel', item: h });
    }
  };

  const TABS: {
    id: CanvasTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'discover', label: 'Discover', icon: Compass },
    { id: 'timeline', label: 'Timeline', icon: CalendarDays, badge: savedItems.length },
    { id: 'map', label: 'Map', icon: MapIcon },
    { id: 'bookings', label: 'Bookings', icon: Briefcase },
  ];

  // Fallback section grouping if discoverSections wasn't populated by live backend
  const sectionsToRender: DiscoverSection[] = discoverSections || [
    {
      key: 'museums',
      title: 'Museums & Modernism',
      intro:
        'Anchor Saturday around **Museo Nacional de Antropología** and **Casa Estudio Luis Barragán**—pair with **Museo Tamayo** in Chapultepec.',
      places: places.filter((p) => p.section === 'museums'),
    },
    {
      key: 'contemporary',
      title: 'Contemporary Art',
      intro:
        'A clean Sunday morning Polanco loop combining **Museo Jumex**, **Museo Soumaya**, and **kurimanzutto**.',
      places: places.filter((p) => p.section === 'contemporary'),
    },
    {
      key: 'food',
      title: 'Iconic Dining',
      intro:
        'Book **Pujol** or **Quintonil** early for your tasting splurge, and save Friday afternoon for sunlit seafood at **Contramar**.',
      places: places.filter((p) => p.section === 'food'),
    },
    {
      key: 'landmarks',
      title: 'Historic Landmarks',
      intro: 'Architectural essentials in Centro Histórico right along your morning walk.',
      places: places.filter((p) => p.section === 'landmarks'),
    },
  ];

  return (
    <div className="relative h-dvh w-full flex overflow-hidden bg-[#F7F6F1]">
      {/* ── LEFT 66% (Desktop) / 100% (Mobile): LIVING TRIP CANVAS ──────── */}
      <div className="flex-1 lg:w-[66%] lg:flex-none h-full flex flex-col min-w-0 relative">
        {/* Top Workspace Navigation Bar */}
        <header className="shrink-0 h-[56px] px-3.5 sm:px-6 flex items-center justify-between gap-2 border-b border-black/[0.06] bg-[#F7F6F1]">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={onOpenSidebar}
              className="p-1.5 -ml-1 rounded-lg hover:bg-black/[0.05] text-[#14191F] cursor-pointer shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </button>
            <BrandMark size={26} className="shrink-0" />
            <div className="font-editorial text-[20px] sm:text-[22px] font-medium text-[#14191F] leading-none shrink-0">
              Vesper
            </div>
          </div>

          {/* Desktop 4-Tab Canvas Switcher */}
          <nav
            className="hidden lg:flex items-center gap-1 rounded-full p-1 border"
            style={{
              backgroundColor: 'var(--v-canvas-subtle)',
              borderColor: 'var(--v-border)',
            }}
            aria-label="Trip canvas views"
          >
            {TABS.map((t) => {
              const active = activeTab === t.id && !sheetTarget;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSheetTarget(null);
                    setActiveTab(t.id);
                    if (t.id !== 'discover') setTasteCalibrated(true);
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all cursor-pointer ${
                    active ? 'bg-[#0E2034] shadow-2xs' : 'text-[#5A626A] hover:text-[#14191F]'
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                  {t.badge !== undefined && t.badge > 0 && (
                    <span
                      className={`min-w-[17px] h-[17px] px-1 rounded-full font-tabular text-[10.5px] font-semibold flex items-center justify-center ${
                        active ? 'bg-white/20' : 'bg-black/[0.08] text-[#14191F]'
                      }`}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right: Share Link + Compact Theme Switcher + Live Trip Total */}
          <div className="flex items-center gap-1.5 shrink-0">
            {liveTripSlug && (
              <button
                type="button"
                onClick={() => {
                  const url = `${window.location.origin}/t/${liveTripSlug}`;
                  navigator.clipboard?.writeText(url).catch(() => {});
                  onNotify(`Copied share link: /t/${liveTripSlug}`);
                }}
                title="Copy shareable trip link"
                aria-label="Copy shareable trip link"
                className="w-8 h-8 rounded-full bg-white hover:bg-black/[0.04] border border-black/[0.09] flex items-center justify-center text-[#2C333A] transition-colors cursor-pointer shrink-0"
              >
                <Share2 className="w-3.5 h-3.5 text-[#5A626A]" />
              </button>
            )}
            <ThemeSwitcher theme={theme} onChange={onChangeTheme} compact />
            {totalCost > 0 && (
              <button
                onClick={() => setShowBookingModal(true)}
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#0E2034] font-tabular text-[12px] font-semibold cursor-pointer shadow-2xs"
              >
                <span>${totalCost.toLocaleString()}</span>
              </button>
            )}
          </div>
        </header>

        {/* Active Canvas Stage + Scoped Contextual Sheet Overlay */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          {activeTab === 'map' ? (
            <div className="h-full w-full p-3 sm:p-4 pb-20 lg:pb-4">
              <InteractiveMap
                mapStage="pins"
                theme={theme}
                center={mapCenter}
                days={days}
                places={places}
                hotels={hotels}
                savedItems={savedItems}
                showHotelPins={true}
                highlightedId={hoveredEntityId}
                focusedDay={focusedMapDay}
                onSelectPlace={(p) => setSheetTarget({ kind: 'place', item: p })}
                onSelectHotel={(h) => setSheetTarget({ kind: 'hotel', item: h })}
              />
            </div>
          ) : (
            <div className="h-full w-full overflow-y-auto thin-scrollbar px-4 sm:px-7 py-5 sm:py-6">
              {activeTab === 'discover' &&
                (!tasteCalibrated ? (
                  <div className="py-2 pb-24 lg:pb-8">
                    <TasteCard
                      destination={destination}
                      dates={datesLabel}
                      initialProfile={tasteProfile || savedDefaultTaste}
                      onSubmit={handleTasteSubmit}
                    />
                  </div>
                ) : isComposingCatalog ? (
                  <div className="max-w-[860px] mx-auto space-y-6 pb-20">
                    <div className="rounded-[22px] bg-white border border-black/[0.08] p-5 flex items-center gap-3 shadow-2xs">
                      <Loader2 className="w-5 h-5 animate-spin text-[#C85A17] shrink-0" />
                      <div>
                        <div className="text-[14.5px] font-semibold text-[#14191F]">
                          Curating {destination} around your taste...
                        </div>
                        <div className="text-[12.5px] text-[#7B828A]">
                          Pulling verified places, real photography, ratings & stays.
                        </div>
                      </div>
                    </div>
                    {[1, 2].map((row) => (
                      <div key={row} className="space-y-3">
                        <div className="h-6 w-48 rounded-lg bg-[#ECEAE2] skeleton-pulse" />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                          {[1, 2, 3].map((card) => (
                            <div
                              key={card}
                              className="h-[250px] rounded-[20px] bg-white border border-black/[0.07] skeleton-pulse"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="max-w-[860px] mx-auto space-y-8 pb-24 lg:pb-12">
                    {/* Active Preference Summary Banner */}
                    <div className="rounded-[20px] bg-white border border-black/[0.08] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#C85A17]">
                          <Sparkles className="w-3 h-3" />
                          <span>
                            {tripTitle} · Curated for {tasteProfile?.travelers || travelersLabel}
                          </span>
                        </div>
                        <div className="text-[13.5px] text-[#2C333A]">
                          <strong>{tasteProfile?.pace || 'Balanced'}</strong> pace ·{' '}
                          <strong>{tasteProfile?.splurge || 'Iconic'}</strong> style ·{' '}
                          {(
                            tasteProfile?.vibes || [
                              'Museums & Art',
                              'Architecture',
                              'Iconic Dining',
                            ]
                          ).join(', ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setTasteCalibrated(false)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F3F2EC] hover:bg-[#ECEAE2] text-[12px] font-medium text-[#2C333A] cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Retune</span>
                        </button>
                        <button
                          onClick={() =>
                            runOrganizeItinerary(`Auto-route my ${destination} trip into days`)
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0E2034] hover:bg-[#17304D] text-[12px] font-medium cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Auto-route trip</span>
                        </button>
                      </div>
                    </div>

                    {activities.length > 0 && (
                      <ActivityCarousel
                        title={activitiesTitle}
                        activities={activities.slice(0, 5)}
                        likedIds={likedIds}
                        onToggleLike={handleToggleLike}
                        onOpenActivity={(act) => setSheetTarget({ kind: 'activity', item: act })}
                        onHoverId={setHoveredEntityId}
                      />
                    )}

                    {sectionsToRender
                      .filter((sec) => sec.places.length > 0)
                      .map((sec) => (
                        <PlaceCarousel
                          key={sec.key}
                          title={sec.title}
                          intro={sec.intro}
                          places={sec.places}
                          savedRefIds={savedRefIds}
                          likedIds={likedIds}
                          onToggleSave={handleToggleSavePlace}
                          onToggleLike={handleToggleLike}
                          onSelectPlace={(p) => setSheetTarget({ kind: 'place', item: p })}
                          onHoverId={setHoveredEntityId}
                        />
                      ))}
                  </div>
                ))}

              {activeTab === 'timeline' && (
                <CanvasTimeline
                  tripTitle={tripTitle}
                  tripSlug={liveTripSlug}
                  destination={destination}
                  datesLabel={datesLabel}
                  travelers={travelersLabel}
                  heroImage={heroImage}
                  days={days}
                  items={savedItems}
                  isOrganizing={isOrganizing}
                  onSearchFlights={() => {
                    setBookingsSubTab('flights');
                    setActiveTab('bookings');
                  }}
                  onSearchHotels={() => {
                    setBookingsSubTab('stays');
                    setActiveTab('bookings');
                  }}
                  onOrganizeItinerary={() =>
                    runOrganizeItinerary(`Organize my ${destination} stops into a routed timeline`)
                  }
                  onExploreDiscover={() => setActiveTab('discover')}
                  onInspectItem={handleInspectTimelineItem}
                  onRemoveItem={(id) => {
                    const next = savedItems.filter((item) => item.id !== id);
                    setSavedItems(next);
                    persistItems(next);
                  }}
                  onUpdateItemTime={(id, day, time) => {
                    const next = savedItems.map((item) =>
                      item.id === id ? { ...item, day, time } : item
                    );
                    setSavedItems(next);
                    persistItems(next);
                  }}
                  onOpenBookingCheckout={() => setShowBookingModal(true)}
                  onOpenMapDay={(day) => {
                    setFocusedMapDay(day);
                    setActiveTab('map');
                  }}
                  onNotify={onNotify}
                />
              )}

              {activeTab === 'bookings' && (
                <CanvasBookings
                  subTab={bookingsSubTab}
                  onChangeSubTab={setBookingsSubTab}
                  homeAirport={homeAirport}
                  onChangeHomeAirport={onChangeHomeAirport}
                  loyaltyPrograms={loyaltyPrograms}
                  onOpenLoyaltyWallet={onOpenLoyaltyWallet}
                  destination={destination}
                  datesLabel={datesLabel}
                  travelers={travelersLabel}
                  hotels={hotels}
                  items={savedItems}
                  likedIds={likedIds}
                  onToggleLike={handleToggleLike}
                  onOpenHotel={(h, openRooms = false) =>
                    setSheetTarget({ kind: 'hotel', item: h, focusRooms: openRooms })
                  }
                  onAddFlights={handleAddFlights}
                  onOpenCheckout={() => setShowBookingModal(true)}
                  onHoverId={setHoveredEntityId}
                />
              )}
            </div>
          )}

          {/* Contextual Floating Editorial Sheet (keeps Right Co-Pilot LIVE!) */}
          <AnimatePresence>
            {sheetTarget && (
              <ContextualEditorialSheet
                key={`${sheetTarget.kind}-${sheetTarget.item.id}`}
                target={sheetTarget}
                destination={destination}
                days={days}
                isPlaceSaved={
                  sheetTarget.kind === 'place' ? savedRefIds.has(sheetTarget.item.id) : false
                }
                isLiked={likedIds.has(sheetTarget.item.id)}
                onClose={() => setSheetTarget(null)}
                onToggleLike={handleToggleLike}
                onToggleSavePlace={handleToggleSavePlace}
                onAddActivity={handleAddActivity}
                onAddHotel={handleAddHotel}
                onAskVesper={(q) => {
                  setMobileCopilotOpen(true);
                  handleCoPilotSend(q);
                }}
                onNotify={onNotify}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Native Bottom Tab Bar (< 1024px) */}
        <nav
          className="lg:hidden shrink-0 border-t border-black/[0.08] bg-[#F7F6F1]/95 backdrop-blur-md px-2 pt-1.5 pb-safe grid grid-cols-4 z-40"
          aria-label="Mobile navigation"
        >
          {TABS.map((t) => {
            const active = activeTab === t.id && !sheetTarget;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSheetTarget(null);
                  setActiveTab(t.id);
                  if (t.id !== 'discover') setTasteCalibrated(true);
                }}
                className={`relative flex flex-col items-center justify-center py-1 rounded-xl transition-colors cursor-pointer ${
                  active ? 'text-[#14191F]' : 'text-[#7B828A]'
                }`}
              >
                <div className="relative">
                  <t.icon className="w-[19px] h-[19px]" />
                  {t.badge !== undefined && t.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#0E2034] font-tabular text-[9.5px] font-bold flex items-center justify-center">
                      {t.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[10.5px] mt-0.5 ${active ? 'font-semibold' : 'font-medium'}`}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Mobile Floating Vesper Co-Pilot FAB (< 1024px) */}
        {!mobileCopilotOpen && (
          <button
            type="button"
            onClick={() => {
              setMobileCopilotOpen(true);
              setHasUnreadCopilot(false);
            }}
            className="lg:hidden fixed bottom-[76px] right-4 z-40 w-13 h-13 rounded-full shadow-[0_10px_28px_rgba(0,0,0,0.28)] flex items-center justify-center active:scale-95 transition-transform cursor-pointer border-2"
            style={{
              backgroundColor: 'var(--v-cta)',
              borderColor: 'var(--v-surface)',
            }}
            aria-label="Open Vesper AI Co-Pilot"
          >
            <BrandMark size={38} />
            {hasUnreadCopilot && (
              <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-white" />
            )}
          </button>
        )}
      </div>

      {/* ── RIGHT 34% (Desktop): PERSISTENT VESPER AI CO-PILOT RAIL ─────── */}
      <aside className="hidden lg:block lg:w-[34%] h-full border-l border-black/[0.08] shrink-0">
        <CoPilotRail
          messages={messages}
          streamingText={streamingText}
          thinkingLabel={thinkingLabel}
          statusStep={statusStep}
          sheetTarget={sheetTarget}
          onSend={handleCoPilotSend}
        />
      </aside>

      {/* ── MOBILE CO-PILOT BOTTOM SHEET (< 1024px) ─────────────────────── */}
      <AnimatePresence>
        {mobileCopilotOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-[1050] bg-black/45 backdrop-blur-xs flex flex-col justify-end"
            onClick={() => setMobileCopilotOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="h-[82dvh] w-full rounded-t-[26px] overflow-hidden shadow-2xl border-t border-black/[0.1]"
            >
              <CoPilotRail
                messages={messages}
                streamingText={streamingText}
                thinkingLabel={thinkingLabel}
                statusStep={statusStep}
                sheetTarget={sheetTarget}
                isMobileSheet
                onCloseMobile={() => setMobileCopilotOpen(false)}
                onSend={handleCoPilotSend}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ONE-CLICK CHECKOUT MODAL ────────────────────────────────────── */}
      <AnimatePresence>
        {showBookingModal && (
          <BookingCheckoutModal
            tripTitle={tripTitle}
            destination={destination}
            datesLabel={datesLabel}
            travelers={travelersLabel}
            items={savedItems}
            loyaltyPrograms={loyaltyPrograms}
            onOpenLoyaltyWallet={onOpenLoyaltyWallet}
            onClose={() => setShowBookingModal(false)}
            onSuccess={() => onNotify(`Trip confirmed for ${destination}!`)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
