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
  options?: { enableSearchGrounding?: boolean; timeoutMs?: number }
): Promise<T> {
  let lastError: unknown;
  const useSearch = Boolean(options?.enableSearchGrounding && config.geminiEnableSearchGrounding);
  const timeoutMs = options?.timeoutMs ?? config.geminiTimeoutMs;

  for (const model of config.geminiModels) {
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
      console.warn(`[gemini] model ${model} failed, trying fallback:`, (err as Error)?.message?.slice(0, 140));
    }
  }

  throw lastError ?? new Error('All Gemini models failed');
}

export interface ParsedTripIntent {
  destination: string;
  country: string;
  tripTitle: string;
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
 * Step 1 (Called on Landing -> Workspace transition):
 * Extracts clean destination, evocative trip title, day plan skeleton, and Google Places queries
 * from any open-ended user prompt (e.g. "5-day family road trip in Banff" or "Kyoto timber & tea").
 */
export async function parseTripPrompt(
  userPrompt: string,
  datesLabel: string,
  travelers: string
): Promise<ParsedTripIntent> {
  const schema = {
    type: 'object',
    properties: {
      destination: { type: 'string', description: 'Primary city, region, or park name, e.g. Kyoto or Banff' },
      country: { type: 'string', description: 'Country name, e.g. Japan or Canada' },
      tripTitle: { type: 'string', description: 'Short editorial trip title, 3-5 words, e.g. Kyoto Timber & Tea' },
      dayLabels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Short calendar or day label like "Fri, Jun 19" or "Day 1"' },
            short: { type: 'string', description: 'Very short pill label like "Fri" or "Day 1"' },
            themeLabel: { type: 'string', description: '2-4 word neighborhood/theme focus for that day' },
          },
          required: ['key', 'short', 'themeLabel'],
        },
        description: '3 to 5 days matching the prompt or date range',
      },
      welcomeSummary: {
        type: 'string',
        description: 'Warm 2-sentence Vesper welcome note referencing the exact destination and dates. May use **bold**.',
      },
      heroQuery: { type: 'string', description: 'Best Google Places query for an iconic landmark photo of this destination' },
      activitiesQuery: { type: 'string', description: 'Google Places query for guided tours/experiences/landmarks in this destination' },
      hotelsQuery: { type: 'string', description: 'Google Places query for top boutique hotels or lodges in this destination' },
    },
    required: [
      'destination',
      'country',
      'tripTitle',
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
    dayLabels: Array<{ key: string; short: string; themeLabel: string }>;
    welcomeSummary: string;
    heroQuery: string;
    activitiesQuery: string;
    hotelsQuery: string;
  }>(
    `User request: "${userPrompt}"\nSelected dates: "${datesLabel}"\nTravelers: "${travelers}"`,
    'You are Vesper, an editorial AI travel planner. Parse any travel prompt worldwide into clean structured trip metadata. Keep dayLabels between 3 and 5 days (default 3 days for weekends). Use crisp, warm editorial phrasing.',
    schema
  );

  const days: TripDayRecord[] = (result.dayLabels || []).slice(0, 5).map((d, idx) => ({
    key: d.key,
    short: d.short,
    themeLabel: d.themeLabel,
    dotColor: DAY_COLORS[idx % DAY_COLORS.length],
  }));

  if (days.length === 0) {
    days.push(
      { key: 'Day 1', short: 'Day 1', themeLabel: 'Arrival & First Walk', dotColor: DAY_COLORS[0] },
      { key: 'Day 2', short: 'Day 2', themeLabel: 'Core Highlights', dotColor: DAY_COLORS[1] },
      { key: 'Day 3', short: 'Day 3', themeLabel: 'Local Gems & Departure', dotColor: DAY_COLORS[2] }
    );
  }

  return {
    destination: result.destination || 'Mexico City',
    country: result.country || '',
    tripTitle: result.tripTitle || `${result.destination} Escape`,
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
  whySpecial: string;
  insiderTip: string;
  bestTime: string;
  bookingType?: 'walk_in' | 'timed_ticket' | 'guided_tour' | 'reservation';
  advanceLeadTime?: string;
  estimatedCostUsd?: number;
}

export interface CuratedHotelPick {
  name: string;
  pickLabel: string;
  whyChoose: string;
  noiseAndRoomTip: string;
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
  taste: { travelers: string; vibes: string[]; pace: string; splurge: string },
  loyaltyContext?: { hotelPrograms: string[]; airlinePrograms: string[] }
): Promise<DiscoverPlanBlueprint> {
  const namedPickSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Exact real venue name on Google Maps' },
      whySpecial: { type: 'string', description: '1 crisp insider sentence (under 20 words)' },
      insiderTip: { type: 'string', description: '1 short practical tip (under 15 words)' },
      bestTime: { type: 'string', description: '12-hour time like "10:00 AM" or "7:30 PM"' },
      bookingType: {
        type: 'string',
        enum: ['walk_in', 'timed_ticket', 'guided_tour', 'reservation'],
        description:
          'walk_in for free/open sights, parks, viewpoints & casual cafés; timed_ticket for museums/monuments requiring tickets; guided_tour for bookable tours/experiences; reservation for sit-down restaurants needing a table.',
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
    required: ['name', 'whySpecial', 'insiderTip', 'bestTime', 'bookingType', 'advanceLeadTime', 'estimatedCostUsd'],
  };

  const schema = {
    type: 'object',
    properties: {
      activitiesTitle: { type: 'string', description: 'Short heading for curated experiences' },
      activitiesQuery: { type: 'string', description: 'Fallback Places query' },
      namedExperiences: {
        type: 'array',
        items: namedPickSchema,
        description: '3 specific real signature experiences/walks/cultural landmarks',
      },
      hotelsQuery: { type: 'string', description: 'Fallback Places query for stays' },
      namedHotels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Exact real hotel name' },
            pickLabel: { type: 'string', description: '2-word badge like "Design icon", "Quiet gem"' },
            whyChoose: { type: 'string', description: '1 crisp insider sentence (under 18 words)' },
            noiseAndRoomTip: { type: 'string', description: '1 short room/sleep tip (under 15 words)' },
          },
          required: ['name', 'pickLabel', 'whyChoose', 'noiseAndRoomTip'],
        },
        description: '4 real acclaimed hotels matching the splurge tier',
      },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: ['museums', 'contemporary', 'food', 'landmarks'] },
            title: { type: 'string', description: '2-3 word editorial section title' },
            intro: { type: 'string', description: '1 insider sentence with **bold** highlights' },
            placesQuery: { type: 'string', description: 'Fallback Places query' },
            namedPicks: {
              type: 'array',
              items: namedPickSchema,
              description: '3 specific, real, high-taste venues (no tourist traps)',
            },
          },
          required: ['key', 'title', 'intro', 'placesQuery', 'namedPicks'],
        },
      },
      copilotMessage: { type: 'string', description: '2 concise sentences naming 2-3 **bold** picks.' },
      suggestions: {
        type: 'array',
        items: { type: 'string' },
        description: '3 short follow-up prompt pills',
      },
    },
    required: [
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

  try {
    return await runStructuredJson<DiscoverPlanBlueprint>(
      `Destination: ${destination}${country ? `, ${country}` : ''}\nDates: ${datesLabel}\nTravelers: ${taste.travelers}\nVibes: ${taste.vibes.join(', ')}\nPace: ${taste.pace}\nSplurge style: ${taste.splurge}${hotelLoyaltyNote}`,
      'You are Vesper, an elite travel editor (Michelin Guide, Eater, Condé Nast Traveler). Return 4 distinct sections (keys: museums, contemporary, food, landmarks — tailor titles to the destination & vibes) with 3 SPECIFIC real venues each, 3 real experiences, and 4 real hotels matching the splurge style (respecting hotel loyalty programs when provided). Include a natural mix of free walk_in spots (viewpoints, neighborhoods, parks, casual cafés) AND timed_ticket museums/monuments plus reservation dining, accurately tagging bookingType, advanceLeadTime, and estimatedCostUsd on each pick. Be crisp and punchy; never invent fake names.',
      schema,
      { enableSearchGrounding: true, timeoutMs: 22000 }
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

  const compactStops = items
    .filter((i) => i.type === 'place' || i.type === 'activity')
    .map((i) => ({
      itemId: i.id,
      title: i.title,
      type: i.type,
      area: i.subtitle || '',
      coords: i.coords,
      currentDay: i.day,
      currentTime: i.time || null,
    }));

  return runStructuredJson<OrganizedScheduleResult>(
    `Destination: ${destination}\nAvailable days:\n${days.map((d) => `- "${d.key}" (${d.themeLabel})`).join('\n')}\n\nStops to route:\n${JSON.stringify(compactStops, null, 2)}`,
    'You are Vesper, a spatial travel router. Group nearby stops (using coordinates and neighborhood) onto the same day to minimize transit time. Put museums/parks/tours in the morning/afternoon and restaurants at lunch (12:30–2:00 PM) or dinner (7:00–8:30 PM). Every stop MUST receive a valid day key from the list and a 12-hour time string.',
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
  datesLabel: string;
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
        description: 'Helpful, crisp, opinionated travel concierge reply (2-4 sentences). Use **bold** for place names & key tips.',
      },
      bullets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional 2-4 crisp bullet points if comparing options or listing tips',
      },
      suggestions: {
        type: 'array',
        items: { type: 'string' },
        description: '2-3 short contextual follow-up prompt pills',
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
    dates: params.datesLabel,
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
    'You are Vesper Co-Pilot, a sharp, warm, practical travel concierge embedded next to an interactive trip canvas (Discover, Timeline, Map, Bookings). Give concrete, real-world insider advice specific to the destination and whatever place/hotel the user is currently viewing. Never invent fake confirmation numbers.',
    schema
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

export interface StreamCoPilotMetadata {
  suggestions: string[];
  action: CoPilotResponse['action'];
  mutations: ItineraryMutation[];
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
  datesLabel: string;
  days: TripDayRecord[];
  userMessage: string;
  savedItems: TripSavedItem[];
  activeTab: string;
  inspectingEntity?: { kind: string; name: string; details?: string } | null;
  recentHistory: Array<{ role: string; text: string }>;
  onTextDelta: (chunk: string) => void;
}): Promise<{ fullText: string; meta: StreamCoPilotMetadata }> {
  const validDays = params.days.map((d) => `"${d.key}" (${d.themeLabel})`).join(', ');
  const contextPayload = {
    destination: params.destination,
    dates: params.datesLabel,
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
    recentConversation: params.recentHistory.slice(-6),
  };

  const systemInstruction = `You are Vesper Co-Pilot, a sharp, warm editorial travel concierge embedded beside an interactive trip canvas (Discover, Timeline, Map, Bookings).

Respond concisely (2–4 sentences, or short bullets when helpful). You may use **bold** for place names and key tips.

If the user asks to ADD a place/restaurant/attraction, REMOVE a stop, MOVE/RESCHEDULE a stop, or SWAP a stop on their itinerary, confirm the change naturally in your reply AND include the exact mutation(s) inside the trailing metadata block.

Valid day keys for this trip: ${validDays} (or "Any time" if unspecified).

ALWAYS end your response with a single trailing metadata block in this EXACT format (no markdown code fences around it):
${META_OPEN}
{"suggestions":["short follow-up 1","short follow-up 2"],"action":"none","mutations":[]}
${META_CLOSE}

Where:
- "action" is one of: "none", "organize", "open_bookings_stays", "open_bookings_flights", "open_map", "switch_discover", "switch_timeline"
- "mutations" is an array of zero or more objects:
  - {"op":"add_place","query":"Exact real place name","day":"Exact valid day key","time":"10:30 AM"}
  - {"op":"remove_item","titleQuery":"Part of existing stop title"}
  - {"op":"move_item","titleQuery":"Part of existing stop title","day":"Exact valid day key","time":"4:00 PM"}
(For a swap request, emit a "remove_item" followed by an "add_place". If you emit any mutation, set "action":"switch_timeline" unless the user asked for the map.)`;

  const inputPrompt = `Trip context:\n${JSON.stringify(contextPayload, null, 2)}\n\nUser says: "${params.userMessage}"`;

  let lastError: unknown;

  for (const model of config.geminiModels) {
    let rawAccumulated = '';
    let emittedLen = 0;
    let enteredMeta = false;

    try {
      const stream = await withTimeout(
        ai.interactions.create({
          model,
          system_instruction: systemInstruction,
          input: inputPrompt,
          stream: true,
          store: false,
        }),
        config.geminiTimeoutMs,
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
          };
          let action: CoPilotResponse['action'] = { type: 'none' };
          if (parsed.action === 'organize') action = { type: 'organize' };
          else if (parsed.action === 'open_bookings_stays') action = { type: 'open_bookings_stays' };
          else if (parsed.action === 'open_bookings_flights') action = { type: 'open_bookings_flights' };
          else if (parsed.action === 'open_map') action = { type: 'open_map' };
          else if (parsed.action === 'switch_discover') action = { type: 'switch_tab', tab: 'discover' };
          else if (parsed.action === 'switch_timeline') action = { type: 'switch_tab', tab: 'timeline' };

          parsedMeta = {
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
            action,
            mutations: Array.isArray(parsed.mutations) ? parsed.mutations : [],
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
      // Only retry next model if we haven't already streamed text to the client
      if (emittedLen > 0) break;
      console.warn(`[gemini-stream] model ${model} failed, trying fallback:`, (err as Error)?.message?.slice(0, 140));
    }
  }

  throw lastError ?? new Error('Streaming Co-Pilot failed across all models');
}
