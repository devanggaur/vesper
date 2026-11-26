import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import type { ChatBlock, TripSavedItem } from '../../src/types/travel';
import type { TripDayRecord } from './supabase';

/**
 * Vesper Gemini Concierge Engine (`@google/genai` Interactions API)
 * -----------------------------------------------------------------
 * Uses the modern `ai.interactions.create()` surface with structured JSON outputs
 * (`response_format`) and an automatic model fallback chain (`gemini-3.5-flash-lite` ->
 * `gemini-4-hydrogen` -> `gemini-3.5-flash`) so transient capacity spikes never break UX.
 */

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const aiBeta = new GoogleGenAI({ apiKey: config.geminiApiKey, apiVersion: 'v1beta' });

/** Short-circuit models that recently hit 429 rate-limit backoff or timed out (30-minute cooldown). */
const MODEL_COOLDOWN_MS = 30 * 60 * 1000;
const modelCooldownUntil = new Map<string, number>();

function isModelCoolingDown(model: string): boolean {
  const until = modelCooldownUntil.get(model);
  if (!until) return false;
  if (Date.now() >= until) {
    modelCooldownUntil.delete(model);
    return false;
  }
  return true;
}

function markModelCooldown(model: string, err: unknown): void {
  const msg = (err as Error)?.message || '';
  if (/429|rate limit|quota|timed out|404/i.test(msg)) {
    modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function runStructuredJson<T>(
  prompt: string,
  systemInstruction: string,
  schema: Record<string, unknown>,
  options?: { enableSearchGrounding?: boolean; timeoutMs?: number; models?: readonly string[] }
): Promise<T> {
  let lastError: unknown;
  const useSearch = Boolean(options?.enableSearchGrounding && config.geminiEnableSearchGrounding);
  const timeoutMs = options?.timeoutMs ?? config.geminiTimeoutMs;
  const modelList = options?.models ?? config.geminiModels;

  for (const model of modelList) {
    if (isModelCoolingDown(model) && model !== modelList[modelList.length - 1]) continue;
    try {
      const interaction = await withTimeout(
        ai.interactions.create({
          model,
          system_instruction: systemInstruction,
          input: prompt,
          ...(useSearch ? { tools: [{ type: 'google_search' }] } : {}),
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema,
          },
          store: false,
        }),
        timeoutMs,
        `gemini:${model}`
      );

      const rawText = (interaction.output_text || '').trim();
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      return JSON.parse(cleaned) as T;
    } catch (err) {
      lastError = err;
      markModelCooldown(model, err);
      console.warn(`[gemini] model ${model} failed, trying fallback:`, (err as Error)?.message?.slice(0, 140));
    }
  }

  throw lastError ?? new Error('All Gemini models failed');
}

export interface ParsedTripIntent {
  destination: string;
  country: string;
  tripTitle: string;
  extractedDates?: string;
  tripMode: 'city' | 'roadtrip';
  roadTripDefaults?: {
    startCity: string;
    transportMode: 'drive_home' | 'fly_drive';
    overnightTowns: string[];
  };
  days: TripDayRecord[];
  welcomeSummary: string;
  searchQueries: {
    hero: string;
    activities: string;
    hotels: string;
  };
}

const DAY_COLORS = ['#C05A2B', '#2563EB', '#0F766E', '#7C3AED', '#D97706'];

/**
 * Strict explicit check for road-trip prompts: only activates Road Trip Mode when
 * the user explicitly asks for a road trip, scenic drive, or driving route.
 */
export function detectRoadTripPrompt(prompt: string): boolean {
  return /\b(road\s*trip|roadtrip|scenic\s+drive|driving\s+(tour|trip|loop|route|itinerary)|drive\s+from|driving\s+from|car\s+trip|campervan|rv\s+trip)\b/i.test(
    prompt
  );
}

/**
 * Step 1 (Called on Landing -> Workspace transition):
 * Extracts clean destination, evocative trip title, tripMode (city vs. roadtrip),
 * day plan skeleton (with route legs & overnight towns for road trips), and Google Places queries.
 */
export async function parseTripPrompt(
  userPrompt: string,
  datesLabel: string,
  travelers: string
): Promise<ParsedTripIntent> {
  const regexRoadTrip = detectRoadTripPrompt(userPrompt);
  const schema = {
    type: 'object',
    properties: {
      destination: { type: 'string', description: 'Primary city, region, or scenic corridor name, e.g. Kyoto, Banff, or Pacific Coast Highway' },
      country: { type: 'string', description: 'Country name, e.g. Japan, Canada, or USA' },
      tripTitle: { type: 'string', description: 'Short editorial trip title, 3-5 words, e.g. Pacific Coast Highway Drive' },
      extractedDates: {
        type: 'string',
        description:
          'ONLY populate if the user explicitly mentioned a date, date range, month, season, or holiday in their prompt (e.g. "Jun 18 – 20", "Mid-October", "Thanksgiving"). Return empty string "" if the user did NOT mention when they are going—never invent dates.',
      },
      tripMode: {
        type: 'string',
        enum: ['city', 'roadtrip'],
        description: 'Use "roadtrip" whenever the prompt involves driving between multiple towns, scenic highways, loops, national park road trips, or driving from an origin city.',
      },
      startCity: {
        type: 'string',
        description: 'For road trips: starting city (e.g. "San Francisco" or "Calgary"). Empty string for city trips.',
      },
      transportMode: {
        type: 'string',
        enum: ['drive_home', 'fly_drive'],
        description: 'For road trips: "drive_home" if starting from a stated home city (like "from San Francisco"), or "fly_drive" if flying into a distant park/region and renting a car.',
      },
      dayLabels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Short calendar or day label like "Fri, Jun 19" or "Day 1"' },
            short: { type: 'string', description: 'Very short pill label like "Fri" or "Day 1"' },
            themeLabel: { type: 'string', description: '2-4 word neighborhood/theme focus for that day' },
            legFrom: { type: 'string', description: 'For road trips: departure town for this day (e.g. "San Francisco"). Omit or empty for city trips.' },
            legTo: { type: 'string', description: 'For road trips: arrival town for this day (e.g. "Carmel-by-the-Sea"). Omit or empty for city trips.' },
            overnightTown: { type: 'string', description: 'For road trips: town where travelers sleep this night (e.g. "Big Sur"). Omit or empty for city trips.' },
            estDriveMinutes: { type: 'number', description: 'For road trips: realistic total driving minutes for this day (e.g. 135). 0 for city trips.' },
            estDriveMiles: { type: 'number', description: 'For road trips: realistic total driving miles for this day (e.g. 118). 0 for city trips.' },
          },
          required: ['key', 'short', 'themeLabel'],
        },
        description: '3 to 5 days matching the prompt or date range',
      },
      welcomeSummary: {
        type: 'string',
        description:
          'Warm, human 2-3 sentence Vesper welcome note that reacts genuinely to the destination and time of year (like a well-traveled friend excited to plan this with you), and invites them to set their quick vibe preferences on the left. May use **bold** and *italics*.',
      },
      heroQuery: { type: 'string', description: 'Best Google Places query for an iconic landmark photo of this destination' },
      activitiesQuery: { type: 'string', description: 'Google Places query for guided tours/experiences/landmarks in this destination' },
      hotelsQuery: { type: 'string', description: 'Google Places query for top boutique hotels or lodges in this destination' },
    },
    required: [
      'destination',
      'country',
      'tripTitle',
      'tripMode',
      'dayLabels',
      'welcomeSummary',
      'heroQuery',
      'activitiesQuery',
      'hotelsQuery',
    ],
  };

  const result = await runStructuredJson<{
    destination: string;
    country: string;
    tripTitle: string;
    extractedDates?: string;
    tripMode?: 'city' | 'roadtrip';
    startCity?: string;
    transportMode?: 'drive_home' | 'fly_drive';
    dayLabels: Array<{
      key: string;
      short: string;
      themeLabel: string;
      legFrom?: string;
      legTo?: string;
      overnightTown?: string;
      estDriveMinutes?: number;
      estDriveMiles?: number;
    }>;
    welcomeSummary: string;
    heroQuery: string;
    activitiesQuery: string;
    hotelsQuery: string;
  }>(
    `User request: "${userPrompt}"\nSelected dates: "${datesLabel || 'Not specified'}"\nTravelers: "${travelers}"`,
    regexRoadTrip
      ? 'You are Vesper, an editorial AI travel planner. The user explicitly requested a road trip. Parse the prompt into clean structured trip metadata with tripMode="roadtrip", realistic startCity, transportMode, and legFrom, legTo, overnightTown, estDriveMinutes, and estDriveMiles on every day! Keep dayLabels between 3 and 5 days using generic "Day 1", "Day 2", etc. unless the user explicitly gave calendar dates. Never fabricate dates if the user did not mention them (leave extractedDates=""). Use crisp, warm editorial phrasing.'
      : 'You are Vesper, an editorial AI travel planner. Parse any travel prompt worldwide into clean structured trip metadata with tripMode="city". Keep dayLabels between 3 and 5 days using generic "Day 1", "Day 2", etc. unless the user explicitly gave calendar dates. Never fabricate dates if the user did not mention them (leave extractedDates=""). Use crisp, warm editorial phrasing.',
    schema
  );

  // Only activate Road Trip Mode when the user explicitly asked for a road trip / driving trip
  const tripMode: 'city' | 'roadtrip' = regexRoadTrip ? 'roadtrip' : 'city';

  const days: TripDayRecord[] = (result.dayLabels || []).slice(0, 5).map((d, idx) => ({
    key: d.key,
    short: d.short,
    themeLabel: d.themeLabel,
    dotColor: DAY_COLORS[idx % DAY_COLORS.length],
    ...(tripMode === 'roadtrip' && d.legFrom ? { legFrom: d.legFrom } : {}),
    ...(tripMode === 'roadtrip' && d.legTo ? { legTo: d.legTo } : {}),
    ...(tripMode === 'roadtrip' && d.overnightTown ? { overnightTown: d.overnightTown } : {}),
    ...(tripMode === 'roadtrip' && d.estDriveMinutes ? { estDriveMinutes: Math.round(d.estDriveMinutes) } : {}),
    ...(tripMode === 'roadtrip' && d.estDriveMiles ? { estDriveMiles: Math.round(d.estDriveMiles) } : {}),
  }));

  if (days.length === 0) {
    days.push(
      { key: 'Day 1', short: 'Day 1', themeLabel: 'Arrival & First Walk', dotColor: DAY_COLORS[0] },
      { key: 'Day 2', short: 'Day 2', themeLabel: 'Core Highlights', dotColor: DAY_COLORS[1] },
      { key: 'Day 3', short: 'Day 3', themeLabel: 'Local Gems & Departure', dotColor: DAY_COLORS[2] }
    );
  }

  const overnightTowns = Array.from(
    new Set(days.map((d) => d.overnightTown || d.legTo).filter((t): t is string => Boolean(t && t.trim())))
  );

  return {
    destination: result.destination || 'Mexico City',
    country: result.country || '',
    tripTitle: result.tripTitle || `${result.destination} Escape`,
    extractedDates: typeof result.extractedDates === 'string' ? result.extractedDates.trim() : '',
    tripMode,
    ...(tripMode === 'roadtrip'
      ? {
          roadTripDefaults: {
            startCity: result.startCity?.trim() || days[0]?.legFrom || '',
            transportMode: result.transportMode === 'fly_drive' ? 'fly_drive' : 'drive_home',
            overnightTowns,
          },
        }
      : {}),
    days,
    welcomeSummary: result.welcomeSummary,
    searchQueries: {
      hero: result.heroQuery || `${result.destination} iconic landmark`,
      activities: result.activitiesQuery || `best tours and experiences in ${result.destination}`,
      hotels: result.hotelsQuery || `best boutique hotels in ${result.destination}`,
    },
  };
}

export interface CuratedNamedPick {
  name: string;
  town?: string;
  dayIndex?: number;
  whySpecial: string;
  insiderTip: string;
  bestTime: string;
  bookingType?: 'walk_in' | 'timed_ticket' | 'guided_tour' | 'reservation';
  advanceLeadTime?: string;
  estimatedCostUsd?: number;
}

export interface CuratedHotelPick {
  name: string;
  overnightTown?: string;
  pickLabel: string;
  whyChoose: string;
  noiseAndRoomTip: string;
}

export interface RoadTripLegBlueprint {
  dayIndex: number;
  legFrom: string;
  legTo: string;
  overnightTown: string;
  themeLabel: string;
  estDriveMinutes: number;
  estDriveMiles: number;
}

export interface DiscoverPlanBlueprint {
  sections: Array<{
    key: 'museums' | 'contemporary' | 'food' | 'landmarks';
    title: string;
    intro: string;
    placesQuery: string;
    namedPicks: CuratedNamedPick[];
  }>;
  activitiesTitle: string;
  activitiesQuery: string;
  namedExperiences: CuratedNamedPick[];
  hotelsQuery: string;
  namedHotels: CuratedHotelPick[];
  roadTripLegs?: RoadTripLegBlueprint[];
  copilotMessage: string;
  suggestions: string[];
}

/**
 * Step 2 (Upgrade #1 — Multi-Source Insider Curation + Google Places Verification):
 * Acts as a Michelin / Infatuation / Condé Nast Traveler editor to select SPECIFIC real,
 * taste-matched named venues, experiences, and boutique stays (avoiding generic tourist traps)
 * complete with `whySpecial`, `insiderTip`, and `noiseAndRoomTip`. Each named pick is then
 * verified against Google Places API (New) for real coordinates, hours, ratings & photography.
 */
export async function buildDiscoverBlueprint(
  destination: string,
  country: string,
  datesLabel: string,
  taste: {
    travelers: string;
    vibes: string[];
    pace: string;
    splurge: string;
    tripMode?: 'city' | 'roadtrip';
    roadTrip?: {
      startCity: string;
      transportMode: 'drive_home' | 'fly_drive';
      maxDriveHoursPerDay: 'under_2h' | '2_to_4h' | '4h_plus';
      overnightTowns?: string[];
    };
  },
  loyaltyContext?: { hotelPrograms: string[]; airlinePrograms: string[] },
  daysCount = 3
): Promise<DiscoverPlanBlueprint> {
  const isRoadTrip = taste.tripMode === 'roadtrip';
  const namedPickSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Exact real venue, overlook, bakery, or landmark name on Google Maps' },
      ...(isRoadTrip
        ? {
            town: { type: 'string', description: 'Exact town or area along the route for accurate Google Maps lookup (e.g. "Big Sur, CA" or "Carmel-by-the-Sea")' },
            dayIndex: { type: 'number', description: `0-based day index (0 to ${Math.max(0, daysCount - 1)}) matching which route leg this stop sits on` },
          }
        : {}),
      whySpecial: { type: 'string', description: '1 crisp insider sentence (under 20 words)' },
      insiderTip: { type: 'string', description: '1 short practical tip (under 15 words)' },
      bestTime: { type: 'string', description: '12-hour time like "10:00 AM" or "7:30 PM"' },
      bookingType: {
        type: 'string',
        enum: ['walk_in', 'timed_ticket', 'guided_tour', 'reservation'],
        description:
          'walk_in for free/open sights, overlooks, parks, beaches, viewpoints & casual cafés; timed_ticket for museums/monuments/parks requiring tickets; guided_tour for bookable tours/experiences; reservation for sit-down restaurants needing a table.',
      },
      advanceLeadTime: {
        type: 'string',
        description: 'Short booking window, e.g. "No booking needed", "Book 2-3 weeks ahead", or "Reserve 1-2 weeks ahead"',
      },
      estimatedCostUsd: {
        type: 'number',
        description: 'Estimated per-person ticket/entry cost in USD (0 for free walk-ins or restaurants)',
      },
    },
    required: isRoadTrip
      ? ['name', 'town', 'dayIndex', 'whySpecial', 'insiderTip', 'bestTime', 'bookingType', 'advanceLeadTime', 'estimatedCostUsd']
      : ['name', 'whySpecial', 'insiderTip', 'bestTime', 'bookingType', 'advanceLeadTime', 'estimatedCostUsd'],
  };

  const schema = {
    type: 'object',
    properties: {
      ...(isRoadTrip
        ? {
            roadTripLegs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  dayIndex: { type: 'number' },
                  legFrom: { type: 'string', description: 'Starting town for this day' },
                  legTo: { type: 'string', description: 'Ending town for this day' },
                  overnightTown: { type: 'string', description: 'Town where travelers sleep this night' },
                  themeLabel: { type: 'string', description: 'Short 2-4 word scenic leg theme' },
                  estDriveMinutes: { type: 'number', description: 'Realistic driving minutes respecting maxDriveHoursPerDay' },
                  estDriveMiles: { type: 'number', description: 'Realistic driving miles for this leg' },
                },
                required: ['dayIndex', 'legFrom', 'legTo', 'overnightTown', 'themeLabel', 'estDriveMinutes', 'estDriveMiles'],
              },
              description: `Exactly ${daysCount} sequential driving legs from startCity along the corridor`,
            },
          }
        : {}),
      activitiesTitle: { type: 'string', description: 'Short heading for curated experiences' },
      activitiesQuery: { type: 'string', description: 'Fallback Places query' },
      namedExperiences: {
        type: 'array',
        items: namedPickSchema,
        description: '3 specific real signature experiences/walks/scenic stops',
      },
      hotelsQuery: { type: 'string', description: 'Fallback Places query for stays' },
      namedHotels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Exact real hotel or lodge name' },
            ...(isRoadTrip
              ? {
                  overnightTown: {
                    type: 'string',
                    description: 'Exact overnightTown from roadTripLegs that this stay serves (include at least 1 standout stay per distinct overnightTown)',
                  },
                }
              : {}),
            pickLabel: { type: 'string', description: '2-word badge like "Design icon", "Quiet gem", "Coastal lodge"' },
            whyChoose: { type: 'string', description: '1 crisp insider sentence (under 18 words)' },
            noiseAndRoomTip: { type: 'string', description: '1 short room/sleep/parking tip (under 15 words)' },
          },
          required: isRoadTrip
            ? ['name', 'overnightTown', 'pickLabel', 'whyChoose', 'noiseAndRoomTip']
            : ['name', 'pickLabel', 'whyChoose', 'noiseAndRoomTip'],
        },
        description: isRoadTrip
          ? '4 to 6 real acclaimed stays distributed across EVERY distinct overnightTown along the route'
          : '4 real acclaimed hotels matching the splurge tier',
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: ['museums', 'contemporary', 'food', 'landmarks'] },
            title: { type: 'string', description: '2-4 word editorial section title (for road trips, reflect scenic stops, pit stops, food, and towns along the drive)' },
            intro: { type: 'string', description: '1 insider sentence with **bold** highlights' },
            placesQuery: { type: 'string', description: 'Fallback Places query' },
            namedPicks: {
              type: 'array',
              items: namedPickSchema,
              description: '3 specific, real, high-taste venues distributed cleanly along the corridor/city',
            },
          },
          required: ['key', 'title', 'intro', 'placesQuery', 'namedPicks'],
        },
      },
      copilotMessage: {
        type: 'string',
        description:
          'A warm, editorial 2-paragraph kickoff message (65-100 words, separated by \\n\\n). Paragraph 1 reacts naturally to the destination, season/dates, and traveler vibe like a cultured well-traveled friend. Paragraph 2 highlights 2-3 specific **bold** standout spots or stays you chose and *why* they fit their pace/style, ending with one genuine conversational question.',
      },
      suggestions: {
        type: 'array',
        items: { type: 'string' },
        description: '3 short follow-up prompt pills',
      },
    },
    required: isRoadTrip
      ? [
          'roadTripLegs',
          'activitiesTitle',
          'activitiesQuery',
          'namedExperiences',
          'hotelsQuery',
          'namedHotels',
          'sections',
          'copilotMessage',
          'suggestions',
        ]
      : [
          'activitiesTitle',
          'activitiesQuery',
          'namedExperiences',
          'hotelsQuery',
          'namedHotels',
          'sections',
          'copilotMessage',
          'suggestions',
        ],
  };

  const hotelLoyaltyNote =
    loyaltyContext && loyaltyContext.hotelPrograms.length > 0
      ? `\nTraveler's Hotel Loyalty Programs: ${loyaltyContext.hotelPrograms.join(', ')} (Include 1–2 top-tier properties from these chains in namedHotels alongside standout independent boutiques, and mention points eligibility in whyChoose!)`
      : '';

  const maxDriveLabel =
    taste.roadTrip?.maxDriveHoursPerDay === 'under_2h'
      ? 'Under 2 hours driving per day'
      : taste.roadTrip?.maxDriveHoursPerDay === '4h_plus'
      ? '4+ hours driving per day is fine'
      : '2 to 4 hours driving per day';

  const roadTripPromptBlock = isRoadTrip
    ? `\nTRIP MODE: ROAD TRIP (${daysCount} days)\nStarting city: ${taste.roadTrip?.startCity || destination}\nTransport: ${taste.roadTrip?.transportMode === 'fly_drive' ? 'Fly in & rent a car' : 'Driving from home (no flights)'}\nDaily driving limit: ${maxDriveLabel}`
    : '';

  const systemInstruction = isRoadTrip
    ? `You are Vesper, an elite road-trip editor (Condé Nast Traveler, Road & Track, Eater). Design a logical, sequential ${daysCount}-day scenic driving route in roadTripLegs respecting the daily driving limit, with real overnightTowns along the highway. Return 4 distinct sections (keys: museums, contemporary, food, landmarks — retitle them for the road trip, e.g. "Scenic Overlooks & Parks", "Small Towns & Detours", "Roadside Bakeries & Dining", "Iconic Stops Along the Way") with 3 SPECIFIC real stops each distributed across dayIndex 0..${Math.max(0, daysCount - 1)} with accurate "town" fields! Also return 4–6 real namedHotels covering EVERY distinct overnightTown along the corridor (tag each with its exact overnightTown). Never invent fake places.`
    : 'You are Vesper, an elite travel editor (Michelin Guide, Eater, Condé Nast Traveler). Return 4 distinct sections (keys: museums, contemporary, food, landmarks — tailor titles to the destination & vibes) with 3 SPECIFIC real venues each, 3 real experiences, and 4 real hotels matching the splurge style (respecting hotel loyalty programs when provided). Include a natural mix of free walk_in spots (viewpoints, neighborhoods, parks, casual cafés) AND timed_ticket museums/monuments plus reservation dining, accurately tagging bookingType, advanceLeadTime, and estimatedCostUsd on each pick. Be crisp and punchy; never invent fake names.';

  try {
    return await runStructuredJson<DiscoverPlanBlueprint>(
      `Destination: ${destination}${country ? `, ${country}` : ''}\nDates: ${datesLabel}\nTravelers: ${taste.travelers}\nVibes: ${taste.vibes.join(', ')}\nPace: ${taste.pace}\nSplurge style: ${taste.splurge}${roadTripPromptBlock}${hotelLoyaltyNote}`,
      systemInstruction,
      schema,
      { enableSearchGrounding: true, timeoutMs: 11000, models: config.geminiChatModels }
    );
  } catch (err) {
    console.warn('[gemini] buildDiscoverBlueprint using deterministic Google Places fallback:', (err as Error)?.message);
    const vibeLead = taste.vibes[0] || 'culture & architecture';
    return {
      activitiesTitle: `Guided Walks & Local Experiences in ${destination}`,
      activitiesQuery: `best tours and experiences in ${destination}`,
      namedExperiences: [],
      hotelsQuery: `${taste.splurge === 'Iconic' ? 'luxury boutique' : 'boutique'} hotels in ${destination}`,
      namedHotels: [],
      sections: [
        {
          key: 'museums',
          title: 'Culture & Heritage',
          intro: `Signature cultural highlights across **${destination}** tailored around **${vibeLead}**.`,
          placesQuery: `best museums temples and cultural sights in ${destination}`,
          namedPicks: [],
        },
        {
          key: 'contemporary',
          title: 'Design & Architecture',
          intro: `Architectural landmarks, studios, and atmospheric neighborhoods in **${destination}**.`,
          placesQuery: `famous architecture design galleries gardens in ${destination}`,
          namedPicks: [],
        },
        {
          key: 'food',
          title: 'Memorable Dining',
          intro: `Standout local restaurants and culinary favorites in **${destination}** matching a **${taste.splurge.toLowerCase()}** style.`,
          placesQuery: `best restaurants dining in ${destination}`,
          namedPicks: [],
        },
        {
          key: 'landmarks',
          title: 'Iconic Landmarks',
          intro: `Unmissable scenic views and historic districts to anchor your **${destination}** route.`,
          placesQuery: `top iconic landmarks scenic viewpoints in ${destination}`,
          namedPicks: [],
        },
      ],
      copilotMessage: `Composed your **${destination}** canvas for **${taste.travelers}** around **${taste.vibes
        .slice(0, 3)
        .join(', ')}** at a **${taste.pace.toLowerCase()}** pace. Tap **+** on any spot to collect it, or hit **Auto-route trip** and I’ll cluster everything by neighborhood.`,
      suggestions: [
        `Auto-route my ${destination} trip into days`,
        `Find quiet boutique hotels in ${destination}`,
        'View my stops on the Map',
      ],
    };
  }
}

export interface OrganizedScheduleResult {
  assignments: Array<{
    itemId: string;
    day: string;
    time: string;
  }>;
  summaryIntro: string;
  summaryBullets: string[];
  summaryOutro: string;
  suggestions: string[];
}

/**
 * Step 3 (Spatial Itinerary Auto-Routing):
 * Clusters saved stops by neighborhood/coordinates into realistic chronological times across the trip's days.
 */
export async function organizeStopsWithGemini(
  destination: string,
  days: TripDayRecord[],
  items: TripSavedItem[]
): Promise<OrganizedScheduleResult> {
  const schema = {
    type: 'object',
    properties: {
      assignments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            itemId: { type: 'string' },
            day: { type: 'string', description: 'Must exactly match one of the provided day keys' },
            time: { type: 'string', description: '12-hour start time like "9:30 AM", "1:30 PM", or "7:30 PM"' },
          },
          required: ['itemId', 'day', 'time'],
        },
      },
      summaryIntro: { type: 'string' },
      summaryBullets: {
        type: 'array',
        items: { type: 'string' },
        description: 'One concise **Day:** bullet per scheduled day showing the chronological route with → arrows',
      },
      summaryOutro: { type: 'string' },
      suggestions: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['assignments', 'summaryIntro', 'summaryBullets', 'summaryOutro', 'suggestions'],
  };

  const stopList = items.filter((i) => i.type === 'place' || i.type === 'activity');
  const hasUnscheduled = stopList.some((i) => !i.day || i.day === 'Any time');

  const compactStops = stopList.map((i) => {
    const locked = Boolean(hasUnscheduled && i.day && i.day !== 'Any time' && i.time);
    return {
      itemId: i.id,
      title: i.title,
      type: i.type,
      area: i.subtitle || '',
      coords: i.coords,
      currentDay: i.day,
      currentTime: i.time || null,
      locked,
    };
  });

  return runStructuredJson<OrganizedScheduleResult>(
    `Destination: ${destination}\nAvailable days:\n${days.map((d) => `- "${d.key}" (${d.themeLabel})`).join('\n')}\n\nStops to route:\n${JSON.stringify(compactStops, null, 2)}`,
    'You are Vesper, a spatial travel router. Group nearby stops (using coordinates and neighborhood) onto the same day to minimize transit time. CRITICAL: Any stop with "locked": true was manually pinned by the traveler—keep its exact currentDay and currentTime unchanged and route all other stops smoothly around it. Put museums/parks/tours in the morning/afternoon and restaurants at lunch (12:30–2:00 PM) or dinner (7:00–8:30 PM). Every stop MUST receive a valid day key from the list and a 12-hour time string.',
    schema
  );
}

export interface CoPilotResponse {
  reply: string;
  bullets?: string[];
  suggestions: string[];
  action?: {
    type: 'none' | 'switch_tab' | 'organize' | 'open_bookings_stays' | 'open_bookings_flights' | 'open_map';
    tab?: 'discover' | 'timeline' | 'map' | 'bookings';
  };
}

/**
 * Step 4 (Context-Aware Live Co-Pilot):
 * Answers any traveler question about the active destination, open sheet entity, or itinerary,
 * and emits optional UI navigation actions so Vesper drives the canvas smoothly.
 */
export async function generateCoPilotTurn(params: {
  destination: string;
  country?: string;
  datesLabel: string;
  travelers?: string;
  tasteProfile?: Record<string, unknown> | null;
  userMessage: string;
  savedItems: TripSavedItem[];
  activeTab: string;
  inspectingEntity?: { kind: string; name: string; details?: string } | null;
  recentHistory: Array<{ role: string; text: string }>;
}): Promise<{ blocks: ChatBlock[]; action?: CoPilotResponse['action'] }> {
  const schema = {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description:
          'Warm, human, opinionated travel concierge reply (2 short paragraphs or warm opener + concrete insider advice). Use **bold** for place names & *italics* for subtle emphasis. End with one natural follow-up question when helpful.',
      },
      bullets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional 2-4 rich, sensory bullet points when comparing spots, neighborhoods, or timing tips',
      },
      suggestions: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 natural follow-up prompt pills',
      },
      actionType: {
        type: 'string',
        enum: ['none', 'organize', 'open_bookings_stays', 'open_bookings_flights', 'open_map', 'switch_discover', 'switch_timeline'],
        description: 'UI action if the user explicitly asked to route days, see the map, browse stays, or search flights',
      },
    },
    required: ['reply', 'suggestions', 'actionType'],
  };

  const contextPayload = {
    destination: params.destination,
    country: params.country || undefined,
    dates: params.datesLabel,
    travelers: params.travelers || undefined,
    tasteProfile: params.tasteProfile || null,
    activeTab: params.activeTab,
    currentlyInspecting: params.inspectingEntity || null,
    savedStops: params.savedItems.map((i) => ({
      type: i.type,
      title: i.title,
      day: i.day,
      time: i.time || null,
      price: i.price || null,
    })),
    recentConversation: params.recentHistory.slice(-6),
  };

  const res = await runStructuredJson<{
    reply: string;
    bullets?: string[];
    suggestions: string[];
    actionType: string;
  }>(
    `Trip context:\n${JSON.stringify(contextPayload, null, 2)}\n\nUser says: "${params.userMessage}"`,
    'You are Vesper, a warm, well-traveled friend and boutique hotel concierge embedded beside an interactive trip canvas. Speak naturally with genuine warmth, sensory specificity, and clear personal taste—never like a dry booking bot. Avoid hollow filler ("Great question!", "Certainly!"). Tailor every suggestion to their tasteProfile, season, and pace, and close naturally with one helpful question when appropriate. Never invent fake confirmation numbers.',
    schema,
    { models: config.geminiChatModels }
  );

  const blocks: ChatBlock[] = [];
  if (res.bullets && res.bullets.length > 0) {
    blocks.push({ type: 'bullets', intro: res.reply, items: res.bullets });
  } else {
    blocks.push({ type: 'text', content: res.reply });
  }
  if (res.suggestions && res.suggestions.length > 0) {
    blocks.push({ type: 'suggestions', items: res.suggestions.slice(0, 3) });
  }

  let action: CoPilotResponse['action'] = { type: 'none' };
  if (res.actionType === 'organize') action = { type: 'organize' };
  else if (res.actionType === 'open_bookings_stays') action = { type: 'open_bookings_stays' };
  else if (res.actionType === 'open_bookings_flights') action = { type: 'open_bookings_flights' };
  else if (res.actionType === 'open_map') action = { type: 'open_map' };
  else if (res.actionType === 'switch_discover') action = { type: 'switch_tab', tab: 'discover' };
  else if (res.actionType === 'switch_timeline') action = { type: 'switch_tab', tab: 'timeline' };

  return { blocks, action };
}

export type ItineraryMutation =
  | { op: 'add_place'; query: string; day: string; time?: string }
  | { op: 'remove_item'; titleQuery: string }
  | { op: 'move_item'; titleQuery: string; day: string; time?: string };

export interface RecommendedPlaceSpec {
  query: string;
  note?: string;
  category?: string;
  suggestedDay?: string;
  bestTime?: string;
}

export interface RecommendedHotelSpec {
  query: string;
  neighborhood?: string;
  note?: string;
  pickLabel?: string;
  noiseAndRoomTip?: string;
}

export interface StreamCoPilotMetadata {
  suggestions: string[];
  action: CoPilotResponse['action'];
  mutations: ItineraryMutation[];
  placesTitle?: string;
  recommendedPlaces: RecommendedPlaceSpec[];
  hotelsTitle?: string;
  recommendedHotels: RecommendedHotelSpec[];
}

const META_OPEN = '<<<VESPER_META';
const META_CLOSE = 'VESPER_META>>>';

/**
 * Streams a live Co-Pilot reply token-by-token using `@google/genai` `interactions.create({ stream: true })`.
 * Human-readable markdown streams immediately via `onTextDelta`, while a trailing delimited
 * `<<<VESPER_META ... VESPER_META>>>` block is stripped server-side and parsed into structured
 * follow-up suggestions, UI navigation actions, and real itinerary mutations (add/move/remove stops).
 */
export async function streamCoPilotTurn(params: {
  destination: string;
  country?: string;
  datesLabel: string;
  travelers?: string;
  tasteProfile?: Record<string, unknown> | null;
  days: TripDayRecord[];
  userMessage: string;
  savedItems: TripSavedItem[];
  activeTab: string;
  inspectingEntity?: { kind: string; name: string; details?: string } | null;
  groupSummary?: {
    topVotes: Array<{ entityId: string; kind: string; upvotes: number; downvotes: number; voters: string[] }>;
    recentNotes: Array<{ entityId: string; author: string; body: string }>;
  };
  recentHistory: Array<{ role: string; text: string }>;
  onTextDelta: (chunk: string) => void;
}): Promise<{ fullText: string; meta: StreamCoPilotMetadata }> {
  const validDays = params.days
    .map((d) =>
      d.legFrom && d.legTo
        ? `"${d.key}" (${d.legFrom} -> ${d.legTo}, overnight ${d.overnightTown || d.legTo})`
        : `"${d.key}" (${d.themeLabel})`
    )
    .join(', ');
  const contextPayload = {
    destination: params.destination,
    country: params.country || undefined,
    dates: params.datesLabel,
    travelers: params.travelers || undefined,
    tasteProfile: params.tasteProfile || null,
    validDayKeys: params.days.map((d) => d.key),
    activeTab: params.activeTab,
    currentlyInspecting: params.inspectingEntity || null,
    savedStops: params.savedItems.map((i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      day: i.day,
      time: i.time || null,
    })),
    ...(params.groupSummary &&
    (params.groupSummary.topVotes.length > 0 || params.groupSummary.recentNotes.length > 0)
      ? { groupVotesAndNotes: params.groupSummary }
      : {}),
    recentConversation: params.recentHistory.slice(-6),
  };

  const systemInstruction = `You are Vesper, a warm, deeply knowledgeable travel friend and boutique hotel concierge sitting beside an interactive map and trip workspace.

VOICE & WARMTH (MOST IMPORTANT):
- Write like a cultured, genuinely enthusiastic friend who just spent a month in ${params.destination} and loves sharing their favorite corners—never like a terse booking assistant or form receipt.
- Open naturally by acknowledging the mood, season, or question (never hollow filler like "Great question!", "Certainly!", or "I'd be happy to help!").
- Give concrete, sensory, opinionated details: *why* a spot is worth going, the best light or crowd window, what to order, or how it flows with the rest of their day and their tasteProfile (pace, vibes, splurge style, travelers).
- Use **bold** for specific venue/hotel/neighborhood names and *italics* lightly for nuance or atmosphere. Never use raw headings (#) or walls of text.

INTERACTIVE PLACE CARDS (CRITICAL):
- Whenever the user asks about restaurants, cafes, coffee shops, bakeries, bars, food spots, viewpoints, museums, galleries, shops, parks, beaches, or ANY visitable daytime/evening spot that could be added to their daily itinerary, ALWAYS return 2 to 5 real, specific venue names in "recommendedPlaces" (plus a crisp 2–5 word "placesTitle" like "Coffee & Pastries in Chiado" or "Sunset Drinks & Dinner").
- Because Vesper automatically verifies each venue via Google Places and renders interactive photo cards (real photos, star ratings, 1-click "+ Add to Trip", dossier view, and live map pins) directly beneath your message:
  - Keep your streamed prose warm, evocative, and concise: a 2–3 sentence opener capturing the vibe & timing (mentioning 1–2 standout details), followed by one short conversational question. Do NOT duplicate long bullet-by-bullet descriptions for places that will appear as interactive cards right below!

INTERACTIVE HOTEL CARDS (CRITICAL — NEVER PUT HOTELS IN recommendedPlaces):
- Whenever the user asks for hotels, boutique stays, resorts, hostels, places to stay, or where to stay during the trip:
  - NEVER put hotels or accommodations in "recommendedPlaces" (places are strictly for restaurants, cafes, bars, museums, and attractions!).
  - ALWAYS return 2 to 5 real, specific hotels in "recommendedHotels" (plus a crisp 2–5 word "hotelsTitle" like "Boutique Hotels in Chiado" or "Top Stays in Lisbon"), each with a concise "note" on why it fits their trip, a "pickLabel", and a "noiseAndRoomTip".
  - Because Vesper renders proper interactive hotel cards (with nightly & total trip rates for their dates, star class, guest score, neighborhood, "View rooms" + "View more", and live price pins on the map) right beneath your reply, keep your streamed prose warm and concise (2–3 sentences on neighborhoods/vibe + 1 short closing question).
  - Leave "action":"none" when returning "recommendedHotels" unless the user explicitly asks to open the full Bookings Studio or filter all hotels (then use "action":"open_bookings_stays"). For flight searches, use "action":"open_bookings_flights".

- Only leave both "recommendedPlaces" and "recommendedHotels" empty for pure logistics/general advice (e.g., transit, packing, weather) or quick itinerary edits.

ITINERARY MUTATIONS:
If the user explicitly asks to ADD a place/restaurant/attraction, REMOVE a stop, MOVE/RESCHEDULE a stop, or SWAP a stop on their itinerary, confirm the change naturally in your reply AND include the exact mutation(s) inside the trailing metadata block.

Valid day keys for this trip: ${validDays} (or "Any time" if unspecified).

ALWAYS end your response with a single trailing metadata block in this EXACT format (no markdown code fences around it):
${META_OPEN}
{"suggestions":["short follow-up 1","short follow-up 2"],"action":"none","mutations":[],"placesTitle":"","recommendedPlaces":[],"hotelsTitle":"","recommendedHotels":[]}
${META_CLOSE}

Where:
- "action" is one of: "none", "organize", "open_bookings_stays", "open_bookings_flights", "open_map", "switch_discover", "switch_timeline"
- "placesTitle" is a short editorial heading (e.g., "Coffee Spots in Chiado") when "recommendedPlaces" is non-empty.
- "recommendedPlaces" is an array of 0 to 5 real visitable spots (NEVER hotels/lodging) to render as interactive photo cards:
  - {"query":"Exact real venue name (and neighborhood if helpful)","note":"One vivid sentence on why to go or what to order.","category":"food|cafe|bar|museum|viewpoint|landmark|shop","suggestedDay":"Exact valid day key","bestTime":"9:30 AM"}
- "hotelsTitle" is a short editorial heading (e.g., "Boutique Stays in Lisbon") when "recommendedHotels" is non-empty.
- "recommendedHotels" is an array of 0 to 5 real hotels/stays to render as interactive hotel cards with nightly & total pricing:
  - {"query":"Exact real hotel name","neighborhood":"Chiado","note":"One vivid sentence on why stay here.","pickLabel":"Best overall|Design favorite|Quiet sanctuary|Great value","noiseAndRoomTip":"Request an upper courtyard room for quiet nights."}
- "mutations" is an array of zero or more objects:
  - {"op":"add_place","query":"Exact real place name","day":"Exact valid day key","time":"10:30 AM"}
  - {"op":"remove_item","titleQuery":"Part of existing stop title"}
  - {"op":"move_item","titleQuery":"Part of existing stop title","day":"Exact valid day key","time":"4:00 PM"}
(For a swap request, emit a "remove_item" followed by an "add_place". If you emit any mutation, set "action":"switch_timeline" unless the user asked for the map.)`;

  const inputPrompt = `Trip context:\n${JSON.stringify(contextPayload, null, 2)}\n\nUser says: "${params.userMessage}"`;

  let lastError: unknown;

  for (let i = 0; i < config.geminiChatModels.length; i++) {
    const model = config.geminiChatModels[i];
    const isLastModel = i === config.geminiChatModels.length - 1;
    if (isModelCoolingDown(model) && !isLastModel) {
      continue;
    }
    let rawAccumulated = '';
    let emittedLen = 0;
    let enteredMeta = false;
    const connectTimeoutMs = isLastModel ? 14000 : 4500;

    try {
      const stream = await withTimeout(
        ai.interactions.create({
          model,
          system_instruction: systemInstruction,
          input: inputPrompt,
          stream: true,
          store: false,
        }),
        connectTimeoutMs,
        `gemini-stream:${model}`
      );

      for await (const event of stream) {
        if (event.event_type === 'step.delta' && event.delta?.type === 'text') {
          const piece = event.delta.text || '';
          if (!piece) continue;
          rawAccumulated += piece;

          if (!enteredMeta) {
            const metaIdx = rawAccumulated.indexOf(META_OPEN);
            if (metaIdx !== -1) {
              enteredMeta = true;
              const safeText = rawAccumulated.slice(emittedLen, metaIdx);
              if (safeText) {
                params.onTextDelta(safeText);
                emittedLen = metaIdx;
              }
            } else {
              // Keep a small tail buffer equal to META_OPEN.length so we never leak partial `<<<VESPER_META`
              const safeEnd = Math.max(emittedLen, rawAccumulated.length - META_OPEN.length);
              if (safeEnd > emittedLen) {
                params.onTextDelta(rawAccumulated.slice(emittedLen, safeEnd));
                emittedLen = safeEnd;
              }
            }
          }
        }
      }

      // Flush any remaining visible text if the model omitted the metadata block
      let visibleText = rawAccumulated;
      let parsedMeta: StreamCoPilotMetadata = {
        suggestions: [],
        action: { type: 'none' },
        mutations: [],
        placesTitle: undefined,
        recommendedPlaces: [],
        hotelsTitle: undefined,
        recommendedHotels: [],
      };

      const metaStart = rawAccumulated.indexOf(META_OPEN);
      if (metaStart !== -1) {
        visibleText = rawAccumulated.slice(0, metaStart).trim();
        const metaEnd = rawAccumulated.indexOf(META_CLOSE, metaStart + META_OPEN.length);
        const jsonSlice = (
          metaEnd !== -1
            ? rawAccumulated.slice(metaStart + META_OPEN.length, metaEnd)
            : rawAccumulated.slice(metaStart + META_OPEN.length)
        )
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        try {
          const parsed = JSON.parse(jsonSlice) as {
            suggestions?: string[];
            action?: string;
            mutations?: ItineraryMutation[];
            placesTitle?: string;
            recommendedPlaces?: RecommendedPlaceSpec[];
            hotelsTitle?: string;
            recommendedHotels?: RecommendedHotelSpec[];
          };
          let action: CoPilotResponse['action'] = { type: 'none' };
          if (parsed.action === 'organize') action = { type: 'organize' };
          else if (parsed.action === 'open_bookings_stays') action = { type: 'open_bookings_stays' };
          else if (parsed.action === 'open_bookings_flights') action = { type: 'open_bookings_flights' };
          else if (parsed.action === 'open_map') action = { type: 'open_map' };
          else if (parsed.action === 'switch_discover') action = { type: 'switch_tab', tab: 'discover' };
          else if (parsed.action === 'switch_timeline') action = { type: 'switch_tab', tab: 'timeline' };

          const cleanRecommended = Array.isArray(parsed.recommendedPlaces)
            ? parsed.recommendedPlaces
                .filter(
                  (p): p is RecommendedPlaceSpec =>
                    Boolean(p && typeof p.query === 'string' && p.query.trim().length > 1)
                )
                .slice(0, 5)
            : [];

          const cleanHotels = Array.isArray(parsed.recommendedHotels)
            ? parsed.recommendedHotels
                .filter(
                  (h): h is RecommendedHotelSpec =>
                    Boolean(h && typeof h.query === 'string' && h.query.trim().length > 1)
                )
                .slice(0, 5)
            : [];

          parsedMeta = {
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
            action,
            mutations: Array.isArray(parsed.mutations) ? parsed.mutations : [],
            placesTitle:
              typeof parsed.placesTitle === 'string' && parsed.placesTitle.trim()
                ? parsed.placesTitle.trim()
                : undefined,
            recommendedPlaces: cleanRecommended,
            hotelsTitle:
              typeof parsed.hotelsTitle === 'string' && parsed.hotelsTitle.trim()
                ? parsed.hotelsTitle.trim()
                : undefined,
            recommendedHotels: cleanHotels,
          };
        } catch (parseErr) {
          console.warn('[gemini-stream] metadata JSON parse skipped:', (parseErr as Error)?.message);
        }
      } else if (emittedLen < rawAccumulated.length) {
        params.onTextDelta(rawAccumulated.slice(emittedLen));
      }

      return { fullText: visibleText.trim(), meta: parsedMeta };
    } catch (err) {
      lastError = err;
      markModelCooldown(model, err);
      // Only retry next model if we haven't already streamed text to the client
      if (emittedLen > 0) break;
      console.warn(`[gemini-stream] model ${model} failed, trying fallback:`, (err as Error)?.message?.slice(0, 140));
    }
  }

  throw lastError ?? new Error('Streaming Co-Pilot failed across all models');
}

/**
 * Transcribes a short spoken travel prompt using Gemini multimodal audio understanding.
 * Powers the universal fallback path when a browser doesn't support Web Speech API (e.g., Firefox).
 */
export async function transcribeVoiceAudio(
  audioBase64: string,
  mimeType = 'audio/webm'
): Promise<string> {
  // Normalize codec suffixes like "audio/webm;codecs=opus" -> "audio/webm"
  const cleanMime = (mimeType.split(';')[0] || 'audio/webm').trim().toLowerCase();
  let lastError: unknown;

  for (const model of config.geminiModels) {
    if (isModelCoolingDown(model) && model !== config.geminiModels[config.geminiModels.length - 1]) {
      continue;
    }
    try {
      const interaction = await withTimeout(
        aiBeta.interactions.create({
          model,
          input: [
            {
              type: 'text',
              text: 'Transcribe the spoken audio verbatim into clean text with proper punctuation and accurate place-name spelling. Return ONLY the exact words spoken. If the audio is silent, noise-only, or has no intelligible human speech, return an empty string—never invent or guess text.',
            },
            {
              type: 'audio',
              data: audioBase64,
              mime_type: cleanMime,
            },
          ],
          store: false,
        }),
        14000,
        `gemini-audio:${model}`
      );
      return (interaction.output_text || '').trim().replace(/^["']|["']$/g, '').trim();
    } catch (err) {
      lastError = err;
      markModelCooldown(model, err);
      console.warn(
        `[gemini-audio] model ${model} failed, trying fallback:`,
        (err as Error)?.message?.slice(0, 140)
      );
    }
  }

  throw lastError ?? new Error('Voice transcription failed across all models');
}
