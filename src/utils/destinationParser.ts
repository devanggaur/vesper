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
      /\b(for\s+|in\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter)\b|on\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun)\b|with\s+|focused\s+on\b|featuring\b|including\b|under\s+\$|around\s+\$|this\s+weekend|next\s+month|next\s+week|\d+\s*-?\s*day|\d+\s+nights?|\b(food|dining|art|architecture|wine|beaches?|hiking|culture|museums?|nightlife|shopping)\b).*$/i,
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
