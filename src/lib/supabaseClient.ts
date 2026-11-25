import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-safe Supabase Auth client using public publishable keys (`VITE_SUPABASE_*`).
 * All database reads/writes continue flowing through our backend `/api/*` endpoints
 * with the user's JWT attached via `Authorization: Bearer <token>`.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseBrowser: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

/** Returns the active Supabase access token if the user is signed in, or `null` for guests. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabaseBrowser) return null;
  try {
    const { data } = await supabaseBrowser.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
