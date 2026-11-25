import {
  ActivityItem,
  BookingType,
  PlaceItem,
  TripDayMeta,
  TripSavedItem,
} from '../types/travel';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const SHORT_TO_FULL_DAY: Record<string, (typeof WEEKDAY_NAMES)[number]> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
};

export interface BookingBadgeStyle {
  label: string;
  shortLabel: string;
  needsBooking: boolean;
  tone: 'neutral' | 'amber' | 'terracotta' | 'indigo';
}

/**
 * Infers a realistic booking type for both freshly Gemini-curated places and older
 * cached trips that pre-date explicit `bookingType` metadata.
 */
export function inferPlaceBookingType(place: Pick<PlaceItem, 'name' | 'category' | 'section' | 'bookingType' | 'priceTier'>): BookingType {
  if (place.bookingType) return place.bookingType;
  const hay = `${place.name} ${place.category}`.toLowerCase();

  if (
    /\b(museum|museu|museo|palace|palácio|castle|castelo|monastery|mosteiro|cathedral|basilica|tower|torre|gallery|casa|observatory|opera|theatre|theater|botanical|aquarium|oceanarium|zoo)\b/.test(
      hay
    )
  ) {
    return 'timed_ticket';
  }
  if (
    /\b(park|plaza|square|garden|miradouro|viewpoint|neighborhood|district|promenade|beach|market|mercado|bridge|street|arch|boulevard|trail|lookout)\b/.test(
      hay
    )
  ) {
    return 'walk_in';
  }
  if (place.section === 'food' || /\b(restaurant|bistro|osteria|trattoria|taverna|tasting|steakhouse|sushi|omakase|dining|wine bar|rooftop)\b/.test(hay)) {
    if (/\b(cafe|café|coffee|bakery|pastel|pastéis|pastry|gelato|ice cream|taqueria|street food|ramen|market)\b/.test(hay)) {
      return 'walk_in';
    }
    return 'reservation';
  }
  if (place.section === 'museums') {
    return 'timed_ticket';
  }
  return 'walk_in';
}

export function inferActivityBookingType(act: Pick<ActivityItem, 'title' | 'category' | 'bookingType'>): BookingType {
  if (act.bookingType) return act.bookingType;
  const hay = `${act.title} ${act.category}`.toLowerCase();
  if (/museum|palace|castle|monastery|cathedral|gallery|tower/.test(hay)) {
    return 'timed_ticket';
  }
  return 'guided_tour';
}

export function getBookingTypeMeta(bookingType: BookingType): BookingBadgeStyle {
  switch (bookingType) {
    case 'walk_in':
      return {
        label: 'Free / Walk-in',
        shortLabel: 'Walk-in',
        needsBooking: false,
        tone: 'neutral',
      };
    case 'timed_ticket':
      return {
        label: 'Ticket needed',
        shortLabel: 'Ticket',
        needsBooking: true,
        tone: 'amber',
      };
    case 'guided_tour':
      return {
        label: 'Guided tour',
        shortLabel: 'Tour ticket',
        needsBooking: true,
        tone: 'terracotta',
      };
    case 'reservation':
      return {
        label: 'Reserve table',
        shortLabel: 'Reserve',
        needsBooking: true,
        tone: 'indigo',
      };
  }
}

export function getEffectiveBookingType(item: TripSavedItem): BookingType {
  if (item.bookingMeta?.bookingType) return item.bookingMeta.bookingType;
  if (item.type === 'activity') return 'guided_tour';
  return 'walk_in';
}

export function itemNeedsBookingAction(item: TripSavedItem): boolean {
  if (item.type === 'hotel' || item.type === 'flight') return true;
  const bt = getEffectiveBookingType(item);
  return bt !== 'walk_in';
}

export interface HoursAvailabilityReport {
  hasData: boolean;
  hasClosureConflict: boolean;
  closedWeekdays: string[];
  closedOnTripDays: string[];
  openOnTripDays: Array<{ dayKey: string; weekday: string; hours: string }>;
  headline: string;
  detail: string;
}

/**
 * Matches real Google Places `weekdayDescriptions` (e.g. "Monday: Closed", "Tuesday: 10:00 AM – 6:00 PM")
 * against the user's actual trip days (e.g. "Fri, Oct 9", "Mon, Oct 12") to flag closures automatically.
 */
export function analyzeTripHoursAvailability(
  weekdayDescriptions: string[] | undefined,
  days: TripDayMeta[] = [],
  fallbackClosedDay?: string
): HoursAvailabilityReport {
  const byWeekday = new Map<string, string>();
  const closedWeekdays: string[] = [];

  for (const line of weekdayDescriptions || []) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const dayName = line.slice(0, colonIdx).trim();
    const hours = line.slice(colonIdx + 1).trim();
    const matched = WEEKDAY_NAMES.find((w) => w.toLowerCase() === dayName.toLowerCase());
    if (!matched) continue;
    byWeekday.set(matched, hours);
    if (/closed/i.test(hours)) {
      closedWeekdays.push(matched);
    }
  }

  if (byWeekday.size === 0) {
    if (fallbackClosedDay) {
      return {
        hasData: true,
        hasClosureConflict: false,
        closedWeekdays: [fallbackClosedDay],
        closedOnTripDays: [],
        openOnTripDays: [],
        headline: `Typically closed ${fallbackClosedDay}`,
        detail: 'Check official hours before locking your exact time slot.',
      };
    }
    return {
      hasData: false,
      hasClosureConflict: false,
      closedWeekdays: [],
      closedOnTripDays: [],
      openOnTripDays: [],
      headline: 'Check live date availability on partner site',
      detail: 'Confirm open hours and timed-entry slots for your exact trip dates.',
    };
  }

  const closedOnTripDays: string[] = [];
  const openOnTripDays: Array<{ dayKey: string; weekday: string; hours: string }> = [];

  for (const d of days) {
    const tokens = `${d.key} ${d.short}`.toLowerCase().replace(/,/g, ' ').split(/\s+/);
    let matchedDay: (typeof WEEKDAY_NAMES)[number] | undefined;
    for (const tok of tokens) {
      if (SHORT_TO_FULL_DAY[tok]) {
        matchedDay = SHORT_TO_FULL_DAY[tok];
        break;
      }
      const exact = WEEKDAY_NAMES.find((w) => w.toLowerCase() === tok);
      if (exact) {
        matchedDay = exact;
        break;
      }
    }
    if (!matchedDay) continue;
    const hours = byWeekday.get(matchedDay);
    if (!hours) continue;
    if (/closed/i.test(hours)) {
      closedOnTripDays.push(d.key);
    } else {
      openOnTripDays.push({ dayKey: d.key, weekday: matchedDay, hours });
    }
  }

  if (closedOnTripDays.length > 0) {
    const alt = openOnTripDays[0];
    return {
      hasData: true,
      hasClosureConflict: true,
      closedWeekdays,
      closedOnTripDays,
      openOnTripDays,
      headline: `Closed on ${closedOnTripDays.join(', ')}`,
      detail: alt
        ? `Best on ${alt.dayKey} (${alt.hours}).`
        : 'Closed on part of your trip — verify alternate days before booking.',
    };
  }

  if (openOnTripDays.length > 0) {
    const first = openOnTripDays[0];
    const closedNote =
      closedWeekdays.length > 0 ? ` · Closed ${closedWeekdays.map((d) => d.slice(0, 3)).join('/')}` : '';
    return {
      hasData: true,
      hasClosureConflict: false,
      closedWeekdays,
      closedOnTripDays: [],
      openOnTripDays,
      headline: `Open on your trip dates (${first.hours})`,
      detail: `Verified via Google Places hours${closedNote}.`,
    };
  }

  return {
    hasData: true,
    hasClosureConflict: false,
    closedWeekdays,
    closedOnTripDays: [],
    openOnTripDays: [],
    headline:
      closedWeekdays.length > 0
        ? `Closed ${closedWeekdays.join(', ')}`
        : 'Open daily per Google Places',
    detail: Array.from(byWeekday.entries())
      .slice(0, 3)
      .map(([k, v]) => `${k.slice(0, 3)}: ${v}`)
      .join(' · '),
  };
}

export interface VenueBookingLinks {
  official: { label: string; url: string } | null;
  partner: { label: string; url: string; partnerName: string };
}

/**
 * Builds clean dual handoff links (Official Box Office + Affiliate Partner search)
 * so travelers always have face-value direct tickets AND instant skip-the-line / tour options.
 */
export function buildVenueBookingLinks(params: {
  title: string;
  destination: string;
  bookingType: BookingType;
  officialUrl?: string;
  datesLabel?: string;
}): VenueBookingLinks {
  const { title, destination, bookingType, officialUrl } = params;
  const cleanQuery = `${title} ${destination}`.trim();
  const hasRealOfficial =
    Boolean(officialUrl) &&
    /^https?:\/\//i.test(officialUrl!) &&
    !officialUrl!.includes('google.com/maps/place');

  const official = hasRealOfficial
    ? {
        label: bookingType === 'reservation' ? 'Official restaurant site' : 'Official box office',
        url: officialUrl!,
      }
    : null;

  const gygPartnerId = (import.meta.env.VITE_GYG_PARTNER_ID as string | undefined)?.trim();
  const viatorPid = (import.meta.env.VITE_VIATOR_PARTNER_ID as string | undefined)?.trim();

  if (bookingType === 'reservation') {
    return {
      official,
      partner: {
        label: 'Find table on OpenTable / Resy',
        url: `https://www.google.com/search?q=${encodeURIComponent(`${cleanQuery} reservation OpenTable Resy`)}`,
        partnerName: 'Dining Reservations',
      },
    };
  }

  if (viatorPid) {
    return {
      official,
      partner: {
        label:
          bookingType === 'guided_tour'
            ? 'Check tour availability on Viator'
            : 'Skip-the-line & tours on Viator',
        url: `https://www.viator.com/searchResults/all?text=${encodeURIComponent(cleanQuery)}&pid=${encodeURIComponent(viatorPid)}`,
        partnerName: 'Viator',
      },
    };
  }

  const gygParams = new URLSearchParams({ q: cleanQuery });
  if (gygPartnerId) gygParams.set('partner_id', gygPartnerId);

  return {
    official,
    partner: {
      label:
        bookingType === 'guided_tour'
          ? 'Check availability on GetYourGuide'
          : 'Skip-the-line & tours (GetYourGuide)',
      url: `https://www.getyourguide.com/s/?${gygParams.toString()}`,
      partnerName: 'GetYourGuide',
    },
  };
}
