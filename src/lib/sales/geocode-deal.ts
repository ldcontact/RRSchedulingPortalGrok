import "server-only";
import { MOCK_MODE } from "@/lib/env";
import { addressChanged, formatGeocodeLine, type AddressParts } from "@/lib/geocode/parse";
import { geocodeAddressChain } from "@/lib/geocode/chain";

/** Decide whether to geocode, clear, or leave a deal's coordinates alone. */
export async function coordsForDeal(
  next: AddressParts,
  prev: AddressParts | null,
  isNew: boolean,
  existing: { lat: number | null; lng: number | null } | null,
): Promise<{ lat: number | null; lng: number | null } | "skip"> {
  if (MOCK_MODE) return "skip";
  // Keep coordinates already provided (e.g. an autocomplete pick).
  if (isNew && existing?.lat != null && existing.lng != null) return "skip";
  const line = formatGeocodeLine(next);
  if (!line) return existing && (existing.lat != null || existing.lng != null) ? { lat: null, lng: null } : "skip";
  if (!isNew && prev && !addressChanged(prev, next) && existing?.lat != null && existing.lng != null) return "skip";
  const result = await geocodeAddressChain(next);
  if (result.status === "matched" && result.lat != null && result.lng != null) {
    return { lat: result.lat, lng: result.lng };
  }
  // Address changed or is new but didn't resolve: don't keep a stale pin.
  if (isNew || !prev || addressChanged(prev, next)) return { lat: null, lng: null };
  return "skip";
}
