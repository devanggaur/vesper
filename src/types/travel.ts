export type AppView = 'landing' | 'workspace';

export type BookingType = 'walk_in' | 'timed_ticket' | 'guided_tour' | 'reservation';
export type BookingStatus = 'not_needed' | 'needed' | 'booked';

export interface ItemBookingMeta {
  bookingType: BookingType;
  status: BookingStatus;
  confirmationCode?: string;
  advanceLeadTime?: string;
  officialUrl?: string;
  estimatedCostUsd?: number;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ActivityItem {
  id: string;
  title: string;
  shortTitle: string;
  rating: number;
  reviews: number;
  duration: string;
  pricePerPerson: number;
  tagline: string;
  description: string;
  aboutHeading: string;
  aboutBody: string[];
  highlights: string[];
  image: string;
  gallery: string[];
  coords: Coordinates;
  slots: {
    id: string;
    time: string;
    endTime: string;
    spotsLeft: number;
    pricePerPerson: number;
  }[];
  category: string;
  bookingType?: BookingType;
  advanceLeadTime?: string;
  website?: string;
  weekdayDescriptions?: string[];
}

export interface PlaceItem {
  id: string;
  name: string;
  category: string;
  section: 'museums' | 'contemporary' | 'food' | 'landmarks';
  rating: number;
  reviews: number;
  priceTier?: string;
  shortDescription: string;
  editorialSummary: string;
  image: string;
  gallery: string[];
  photoCredit: string;
  coords: Coordinates;
  hours: {
    closedDay?: string;
    openSchedule: string;
    weekdayDescriptions?: string[];
  };
  details: {
    goodForChildren?: boolean;
    restroom?: boolean;
    parking?: string;
    accessibility?: string;
    reservationNote?: string;
  };
  website: string;
  phone: string;
  neighborhood: string;
  suggestedDay?: string;
  suggestedTime?: string;
  bookingType?: BookingType;
  advanceLeadTime?: string;
  estimatedCostUsd?: number;
}

export interface HotelRoom {
  id: string;
  name: string;
  sqft: number;
  beds: string;
  images: string[];
  rates: {
    id: string;
    label: string;
    subtitle: string;
    price: number;
    delta?: string;
  }[];
  description: string;
}

export interface HotelDeepDiveSection {
  id: string;
  label: string;
  title: string;
  items: {
    heading: string;
    body: string;
  }[];
  image?: string;
  reviewsSample?: {
    author: string;
    initials: string;
    text: string;
    rating: string;
  }[];
}

export interface HotelItem {
  id: string;
  name: string;
  neighborhood: string;
  rating: number;
  reviews: number;
  stars: number;
  priceTotal: number;
  tagline: string;
  shortDescription: string;
  pickLabel?: string;
  whyChoose?: string;
  accolade?: string;
  website?: string;
  bookingUrl?: string;
  pricePerNight?: number;
  livePricing?: boolean;
  freeCancellation?: boolean;
  amenities?: string[];
  image: string;
  gallery: string[];
  coords: Coordinates;
  highlights: {
    icon: 'map' | 'bed' | 'sparkle' | 'building' | 'washer' | 'tree';
    title: string;
    description: string;
  }[];
  rooms: HotelRoom[];
  deepDive: HotelDeepDiveSection[];
}

export interface FlightOption {
  id: string;
  airline: string;
  flightNumber: string;
  departTime: string;
  arriveTime: string;
  arriveNextDay?: boolean;
  fromCode: string;
  toCode: string;
  duration: string;
  stops: string;
  stopDetails?: string;
  priceRoundTrip: number;
  direction: 'outbound' | 'return';
  airlineLogo?: string;
  departureToken?: string;
  bookingUrl?: string;
}

export interface FareClass {
  id: string;
  name: string;
  price: number;
  delta: number;
  features: {
    label: string;
    included: boolean;
    note?: string;
  }[];
}

export interface TripSavedItem {
  id: string;
  refId: string;
  type: 'activity' | 'place' | 'hotel' | 'flight';
  title: string;
  subtitle?: string;
  image: string;
  day: string;
  time?: string;
  price?: number;
  coords?: Coordinates;
  flightDetails?: {
    outbound: FlightOption;
    inbound: FlightOption;
    fareName: string;
    passengers: number;
  };
  hotelDetails?: {
    checkIn: string;
    checkOut: string;
    roomName: string;
  };
  bookingMeta?: ItemBookingMeta;
}

export type ChatBlock =
  | { type: 'text'; content: string }
  | { type: 'bullets'; intro?: string; items: string[]; outro?: string }
  | { type: 'suggestions'; items: string[] };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  blocks?: ChatBlock[];
}

export interface TripDayMeta {
  key: string;
  short: string;
  themeLabel: string;
  dotColor: string;
}

export interface DiscoverSection {
  key: 'museums' | 'contemporary' | 'food' | 'landmarks';
  title: string;
  intro: string;
  places: PlaceItem[];
}

export interface TripCatalogPayload {
  activitiesTitle: string;
  activities: ActivityItem[];
  places: PlaceItem[];
  sections: DiscoverSection[];
  hotels: HotelItem[];
}

export interface TripSummary {
  id: string;
  slug: string;
  title: string;
  destination: string;
  country: string;
  datesLabel: string;
  travelers: string;
  heroImage: string;
  updatedAt: string;
}

export interface LiveTripMetadata {
  id: string;
  slug: string;
  title: string;
  destination: string;
  country: string;
  prompt: string;
  datesLabel: string;
  days: TripDayMeta[];
  center: Coordinates;
  heroImage: string;
  travelers: string;
  isOwner?: boolean;
  ownerName?: string | null;
  tasteProfile?: {
    travelers: string;
    vibes: string[];
    pace: 'Unhurried' | 'Balanced' | 'Packed';
    splurge: 'Smart' | 'Elevated' | 'Iconic';
  } | null;
  catalog?: TripCatalogPayload | null;
}

export interface CoPilotAction {
  type: 'none' | 'switch_tab' | 'organize' | 'open_bookings_stays' | 'open_bookings_flights' | 'open_map';
  tab?: 'discover' | 'timeline' | 'map' | 'bookings';
}

/**
 * Saved hotel or airline loyalty account (member number only — never passwords).
 */
export interface LoyaltyProgramEntry {
  id: string;
  category: 'hotel' | 'airline';
  provider: string;
  programName: string;
  memberNumber: string;
  tier?: string;
}

export type CollabEntityKind = 'hotel' | 'place' | 'activity';

export interface TripVote {
  entityId: string;
  entityKind: CollabEntityKind;
  voterKey: string;
  voterName: string;
  vote: 'up' | 'down';
  createdAt: string;
}

export interface TripNote {
  id: string;
  entityId: string;
  entityKind: CollabEntityKind;
  authorKey: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface CollaboratorIdentity {
  key: string;
  name: string;
}
