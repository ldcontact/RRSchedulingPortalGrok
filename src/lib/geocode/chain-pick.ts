import {
  rankAndDedupe,
  ILLINOIS_BBOX,
  type AddressSuggestion,
} from "@/lib/address-suggest";
import type { AddressParts } from "./parse";

export function houseNumber(s: string | null | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

/** Skip names, bare state/city, or other lines with no house number. */
export function sparseAddressReason(parts: AddressParts): string | null {
  const addr = (parts.address ?? "").trim();
  if (!addr) return "no street address";
  if (!/\d/.test(addr)) return "address has no house number";
  return null;
}

export function inIllinoisBbox(lat: number, lng: number): boolean {
  return lat >= ILLINOIS_BBOX.minLat && lat <= ILLINOIS_BBOX.maxLat
    && lng >= ILLINOIS_BBOX.minLon && lng <= ILLINOIS_BBOX.maxLon;
}

export function isStreetLevelMatch(s: Pick<AddressSuggestion, "street" | "lat" | "lng">, wantHouse: string | null): boolean {
  if (s.lat == null || s.lng == null) return false;
  if (!inIllinoisBbox(s.lat, s.lng)) return false;
  const got = houseNumber(s.street);
  if (wantHouse) return !!got && got === wantHouse;
  return !!got;
}

export function pickStreetMatch(items: AddressSuggestion[], query: string, wantHouse: string | null): AddressSuggestion | null {
  const ranked = rankAndDedupe(items, query, 15);
  return ranked.find((s) => isStreetLevelMatch(s, wantHouse)) ?? null;
}
