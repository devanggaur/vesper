/**
 * Instant 0ms client-side destination extractor for the Taste Calibration header
 * so users immediately see "How should Lisbon feel?" instead of waiting 2-3s for
 * Gemini + Google Places to resolve the hero photo and coordinates.
 *
 * Returns `""` for genuinely open-ended prompts (e.g. "Somewhere warm with beaches")
 * so the UI falls back naturally to "How should your trip feel?".
 */

const LOWERCASE_WORDS = new Set(['of', 'the', 'and', 'de', 'da', 'do', 'del', 'la', 'le', 'du', 'by', 'on', 'sur', 'in']);

const GENERIC_NON_PLACES = new Set([
  'somewhere',
  'anywhere',
  'a trip',
  'my trip',
  'the beach',
  'beach',
  'beaches',
  'mountains',
  'europe',
  'asia',
  'weekend',
  'vacation',
  'getaway',
  'holiday',
  'road trip',
  'city break',
  'warm weather',
  'the coast',
]);

function titleCasePlace(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word, idx) => {
      if (/^[A-Z]{2,4}$/.test(word)) return word; // Keep acronyms like NYC, UK, PCH, USA
      const lower = word.toLowerCase();
      if (idx > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function cleanCandidate(raw: string): string {
  const s = raw
    // Strip trailing date / duration / focus clauses (including "for food and art", "food and architecture")
    .replace(
      /\b(for\s+|(?:in|on)\s+(?:early|mid|late)?[\s-]*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|spring|summer|fall|autumn|winter|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b|with\s+|focused\s+on\b|featuring\b|including\b|under\s+\$|around\s+\$|this\s+weekend|next\s+month|next\s+week|\d+\s*-?\s*day|\d+\s+nights?|\b(food|dining|art|architecture|wine|beaches?|hiking|culture|museums?|nightlife|shopping)\b).*$/i,
      ''
    )
    .replace(/\b(road\s*trip|trip|getaway|weekend|vacation|holiday|itinerary|adventure|escape|break|tour|loop|drive|and|&)\s*$/i, '')
    .replace(/^[,.\-–—:\s]+|[,.\-–—:\s!?]+$/g, '')
    .trim();

  // Reject overly long fragments or generic non-places
  if (!s || s.length < 2 || s.length > 42 || s.split(/\s+/).length > 6) return '';
  if (GENERIC_NON_PLACES.has(s.toLowerCase())) return '';
  if (/^(somewhere|anywhere|a\s+warm|a\s+quiet|a\s+romantic|a\s+relaxing|a\s+cheap|a\s+budget)\b/i.test(s)) {
    return '';
  }

  return titleCasePlace(s);
}

export function extractQuickDestination(prompt: string): string {
  const text = prompt.trim();
  if (!text) return '';

  // 1. Named corridor phrases (e.g. "Pacific Coast Highway")
  const corridorMatch = text.match(
    /\b(Pacific Coast Highway|Amalfi Coast|Cinque Terre|Big Sur|Lake Como|Lake Louise|Banff(?:\s+and\s+Lake\s+Louise)?|Great Ocean Road|Ring Road|Blue Ridge Parkway|Scottish Highlands|Swiss Alps|Napa Valley|Sonoma Valley)\b/i
  );
  if (corridorMatch) {
    return titleCasePlace(corridorMatch[1]);
  }

  // 2. Explicit preposition patterns ("trip to Lisbon", "weekend in Mexico City", "through Tuscany")
  const prepPatterns = [
    /\b(?:to|in|through|across|around|visiting|exploring)\s+([A-Za-zÀ-ÿ0-9'&.-]+(?:\s+[A-Za-zÀ-ÿ0-9'&.-]+){0,5})/i,
  ];
  for (const re of prepPatterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const cleaned = cleanCandidate(m[1]);
      if (cleaned) return cleaned;
    }
  }

  // 3. Leading place name before trip descriptors ("Kyoto 4-day trip", "Lisbon food & tiles", "Tokyo")
  const stripped = text
    .replace(/^(hey\s+vesper,?\s*|vesper,?\s*|plan\s+(me\s+)?(a\s+)?(\d+\s*-?\s*day\s+)?)/i, '')
    .trim();
  const leading = cleanCandidate(stripped);
  if (leading && leading.split(/\s+/).length <= 3) {
    return leading;
  }

  return '';
}

const MONTH_ABBR: Record<string, string> = {
  jan: 'Jan',
  january: 'Jan',
  feb: 'Feb',
  february: 'Feb',
  mar: 'Mar',
  march: 'Mar',
  apr: 'Apr',
  april: 'Apr',
  may: 'May',
  jun: 'Jun',
  june: 'Jun',
  jul: 'Jul',
  july: 'Jul',
  aug: 'Aug',
  august: 'Aug',
  sep: 'Sep',
  sept: 'Sep',
  september: 'Sep',
  oct: 'Oct',
  october: 'Oct',
  nov: 'Nov',
  november: 'Nov',
  dec: 'Dec',
  december: 'Dec',
};

/**
 * Instant 0ms client-side date extractor: ONLY returns a date/timeframe string when the
 * user explicitly mentioned when they want to travel (date range, specific date, month,
 * season, or holiday). Returns `""` when no dates were mentioned so Taste Calibration never
 * fabricates phantom dates.
 */
export function extractQuickDates(prompt: string): string {
  const text = prompt.trim();
  if (!text) return '';

  const monthToken =
    '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  // 1. Explicit range: "Jun 19 - 21", "June 18 to June 22", "Oct 9 – 12"
  const rangeRe = new RegExp(
    `\\b(${monthToken})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:[-–—]|to|through)\\s*(?:(${monthToken})\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    'i'
  );
  const rangeMatch = text.match(rangeRe);
  if (rangeMatch) {
    const m1 = MONTH_ABBR[rangeMatch[1].toLowerCase()] || rangeMatch[1];
    const d1 = rangeMatch[2];
    const m2 = rangeMatch[3] ? MONTH_ABBR[rangeMatch[3].toLowerCase()] || rangeMatch[3] : '';
    const d2 = rangeMatch[4];
    return m2 && m2 !== m1 ? `${m1} ${d1} – ${m2} ${d2}` : `${m1} ${d1} – ${d2}`;
  }

  // 2. Single explicit date: "on June 18th", "Oct 12", "18 June"
  const singleRe = new RegExp(`\\b(${monthToken})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
  const singleMatch = text.match(singleRe);
  if (singleMatch) {
    const m = MONTH_ABBR[singleMatch[1].toLowerCase()] || singleMatch[1];
    return `${m} ${singleMatch[2]}`;
  }

  // 3. Explicit month with optional qualifier: "mid-October", "early May", "in September"
  const monthOnlyRe = new RegExp(`\\b(?:(early|mid|late)[\\s-]+)?(${monthToken})\\b`, 'i');
  const monthMatch = text.match(monthOnlyRe);
  if (monthMatch) {
    const qual = monthMatch[1]
      ? `${monthMatch[1].charAt(0).toUpperCase()}${monthMatch[1].slice(1).toLowerCase()}-`
      : '';
    const fullMonth =
      monthMatch[2].charAt(0).toUpperCase() + monthMatch[2].slice(1).toLowerCase();
    return `${qual}${fullMonth}`;
  }

  // 4. Explicit relative timeframe, season, or holiday
  const relativeMatch = text.match(
    /\b(this\s+weekend|next\s+weekend|next\s+week|next\s+month|thanksgiving|christmas|new\s+year(?:'s)?|memorial\s+day|labor\s+day|spring\s+break|spring|summer|fall|autumn|winter)\b/i
  );
  if (relativeMatch) {
    const raw = relativeMatch[1].trim();
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  return '';
}
