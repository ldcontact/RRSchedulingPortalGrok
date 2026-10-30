/**
 * Runtime configuration.
 *
 * DEV MOCK MODE (NEXT_PUBLIC_RR_MOCK_MODE=1) swaps Supabase for a local JSON
 * file and a "pick a demo user" login so the UI can run without any accounts.
 * It is for local development only and refuses to run in production unless
 * RR_ALLOW_MOCK_IN_PRODUCTION=1 is also set (e.g. for a throwaway demo).
 */
export const MOCK_MODE = process.env.NEXT_PUBLIC_RR_MOCK_MODE === "1";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function assertMockAllowed() {
  if (MOCK_MODE && process.env.NODE_ENV === "production" && process.env.RR_ALLOW_MOCK_IN_PRODUCTION !== "1") {
    throw new Error("Dev mock mode is disabled in production. Unset NEXT_PUBLIC_RR_MOCK_MODE and configure Supabase.");
  }
}

export function assertSupabaseConfigured() {
  if (!MOCK_MODE && (!SUPABASE_URL || !SUPABASE_KEY)) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or ANON_KEY), or set NEXT_PUBLIC_RR_MOCK_MODE=1 for local dev.",
    );
  }
}
