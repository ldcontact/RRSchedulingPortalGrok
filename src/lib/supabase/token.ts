import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, assertSupabaseConfigured } from "@/lib/env";
import type { UserDb } from "@/lib/data/supabase-repo";

/**
 * Supabase client acting as the user who owns `accessToken` (a Supabase Auth JWT),
 * using the public publishable/anon key, so row-level security applies exactly as
 * on the website. Never the service-role key. No session is stored or refreshed.
 */
export function createTokenClient(accessToken: string): UserDb {
  assertSupabaseConfigured();
  return createSupabaseClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Same shape the cookie client exposes to the repo; only the auth transport differs.
  }) as unknown as UserDb;
}
