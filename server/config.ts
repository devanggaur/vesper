import 'dotenv/config';

/**
 * Validated runtime configuration for the Vesper backend API.
 * All secrets stay strictly server-side and are never shipped to the browser bundle.
 */
export const config = {
  port: Number(process.env.PORT || 8787),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  /** Optional Phase 3 live GDS / Hotel API keys (falls back cleanly when unset) */
  amadeusClientId: process.env.AMADEUS_CLIENT_ID || '',
  amadeusClientSecret: process.env.AMADEUS_CLIENT_SECRET || '',
  amadeusBaseUrl: process.env.AMADEUS_BASE_URL || 'https://test.api.amadeus.com',
  liteApiKey: process.env.LITEAPI_KEY || '',
  /** Optional Affiliate Partner IDs / Basic API keys for Experiences & Tickets */
  viatorPartnerId: process.env.VIATOR_PARTNER_ID || '',
  gygPartnerId: process.env.GYG_PARTNER_ID || '',
  viatorApiKey: process.env.VIATOR_API_KEY || '',
  viatorApiBaseUrl: process.env.VIATOR_API_BASE_URL || 'https://api.viator.com/partner',
  /** Live Google Flights & Google Hotels real-time pricing + direct booking links */
  serpApiKey: process.env.SERPAPI_API_KEY || '',
  /** Fast, low-cost model chain for structured JSON parsing & spatial auto-routing */
  geminiModels: [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-3.5-flash',
  ] as const,
  /** Richer conversational & editorial model chain for live Ask Vesper chat and Discover curation */
  geminiChatModels: [
    'gemini-3.8-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
  ] as const,
  /** Per-attempt timeout (ms) before failing over to next model */
  geminiTimeoutMs: 10000,
  /**
   * Enable live Google Search grounding on Discover curation (requires Paid-tier Gemini quota;
   * free-tier keys have 0 search-grounding quota and gracefully use Gemini's curated knowledge).
   */
  geminiEnableSearchGrounding: process.env.GEMINI_ENABLE_SEARCH_GROUNDING === 'true',
};

export function assertConfig(): void {
  const missing: string[] = [];
  if (!config.geminiApiKey) missing.push('GEMINI_API_KEY');
  if (!config.googlePlacesApiKey) missing.push('GOOGLE_PLACES_API_KEY');
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    console.warn(`[vesper-api] Missing env vars: ${missing.join(', ')}`);
  }
}
