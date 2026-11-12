import "server-only";
import {
  ADDRESS_BIAS,
  ADDRESS_SUGGEST_LIMIT,
  ADDRESS_SUGGEST_MIN_CHARS,
  ILLINOIS_BBOX,
  parseCensusMatch,
  parseNominatimHit,
  parsePhotonFeature,
  prepareAddressQuery,
  rankAndDedupe,
  shouldQueryNominatim,
  type AddressSuggestion,
  type CensusMatch,
  type NominatimHit,
  type PhotonFeature,
} from "@/lib/address-suggest";

const UA = "RR-Scheduler/1.0 (address-autocomplete; retrofitrebates.com)";
const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const PHOTON_TIMEOUT_MS = 4_000;
const NOMINATIM_TIMEOUT_MS = 5_000;
const CACHE_MS = 60_000;
const PHOTON_GAP_MS = 200;
const NOMINATIM_GAP_MS = 1_100;
const USER_MAX_PER_MIN = 40;

const cache = new Map<string, { at: number; items: AddressSuggestion[] }>();
const lastCall = { photon: 0, nominatim: 0 };
const userHits = new Map<string, number[]>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(kind: "photon" | "nominatim") {
  const gap = kind === "nominatim" ? NOMINATIM_GAP_MS : PHOTON_GAP_MS;
  const wait = lastCall[kind] + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall[kind] = Date.now();
}

export function allowUserQuery(userId: string, now = Date.now()): boolean {
  const windowStart = now - 60_000;
  const next = (userHits.get(userId) ?? []).filter((t) => t > windowStart);
  if (next.length >= USER_MAX_PER_MIN) {
    userHits.set(userId, next);
    return false;
  }
  next.push(now);
  userHits.set(userId, next);
  return true;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": UA },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function queryPhoton(prepared: string): Promise<AddressSuggestion[]> {
  await throttle("photon");
  const params = new URLSearchParams({
    q: prepared,
    lat: String(ADDRESS_BIAS.lat),
    lon: String(ADDRESS_BIAS.lng),
    limit: "15",
    lang: "en",
    bbox: `${ILLINOIS_BBOX.minLon},${ILLINOIS_BBOX.minLat},${ILLINOIS_BBOX.maxLon},${ILLINOIS_BBOX.maxLat}`,
  });
  const data = await fetchJson(`${PHOTON}?${params}`, PHOTON_TIMEOUT_MS);
  const features = (data && typeof data === "object" ? (data as { features?: PhotonFeature[] }).features : null) ?? [];
  let items = features.map((f, i) => parsePhotonFeature(f, i)).filter((x): x is AddressSuggestion => !!x);
  // Soft bbox can over-filter; retry with location bias only if we got nothing.
  if (!items.length) {
    await throttle("photon");
    const retry = new URLSearchParams({
      q: prepared, lat: String(ADDRESS_BIAS.lat), lon: String(ADDRESS_BIAS.lng), limit: "15", lang: "en",
    });
    const data2 = await fetchJson(`${PHOTON}?${retry}`, PHOTON_TIMEOUT_MS);
    const feats = (data2 && typeof data2 === "object" ? (data2 as { features?: PhotonFeature[] }).features : null) ?? [];
    items = feats.map((f, i) => parsePhotonFeature(f, i)).filter((x): x is AddressSuggestion => !!x);
  }
  return items;
}

async function queryNominatim(prepared: string): Promise<AddressSuggestion[]> {
  await throttle("nominatim");
  const params = new URLSearchParams({
    q: prepared,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "us",
    limit: "8",
    viewbox: `${ILLINOIS_BBOX.minLon},${ILLINOIS_BBOX.maxLat},${ILLINOIS_BBOX.maxLon},${ILLINOIS_BBOX.minLat}`,
    bounded: "0",
  });
  const data = await fetchJson(`${NOMINATIM}?${params}`, NOMINATIM_TIMEOUT_MS);
  const rows = Array.isArray(data) ? (data as NominatimHit[]) : [];
  return rows.map((h, i) => parseNominatimHit(h, i)).filter((x): x is AddressSuggestion => !!x);
}

export async function suggestAddresses(raw: string): Promise<{ items: AddressSuggestion[]; degraded: boolean }> {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length < ADDRESS_SUGGEST_MIN_CHARS) return { items: [], degraded: false };
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { items: hit.items, degraded: false };

  const prepared = prepareAddressQuery(trimmed);
  let degraded = false;
  let photon: AddressSuggestion[] = [];
  try {
    photon = await queryPhoton(prepared);
  } catch {
    degraded = true;
  }
  let nominatim: AddressSuggestion[] = [];
  if (shouldQueryNominatim(trimmed, photon) || (photon.length === 0 && /^\s*\d/.test(trimmed) && trimmed.replace(/[^a-z0-9]/gi, "").length >= 10)) {
    try {
      nominatim = await queryNominatim(prepared);
    } catch {
      degraded = true;
    }
  }
  if (photon.length === 0 && nominatim.length === 0) {
    // still mark degraded only if we failed to talk to a provider; empty is a valid miss
  }
  const items = rankAndDedupe([...nominatim, ...photon], trimmed, ADDRESS_SUGGEST_LIMIT);
  cache.set(key, { at: Date.now(), items });
  return { items, degraded };
}

export async function completeSuggestedAddress(s: {
  street: string; city: string; state: string; zip: string; lat?: number | null; lng?: number | null;
}): Promise<AddressSuggestion> {
  const fallback: AddressSuggestion = {
    id: "picked",
    label: "",
    street: s.street,
    unit: null,
    city: s.city,
    state: s.state,
    zip: s.zip,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    source: "photon",
  };
  const line = [s.street, s.city, s.state, s.zip].filter(Boolean).join(", ");
  fallback.label = [fallback.street, [fallback.city, [fallback.state, fallback.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  if (!line) return fallback;
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${new URLSearchParams({
    address: line, benchmark: "Public_AR_Current", format: "json",
  })}`;
  const json = await fetchJson(url, 5_000);
  if (!json) return fallback;
  return completeFromCensusJson(json, fallback);
}

/** Census completion that also parses official components when the raw JSON is available. */
export function completeFromCensusJson(json: unknown, fallback: AddressSuggestion): AddressSuggestion {
  const matches = json && typeof json === "object"
    ? ((json as { result?: { addressMatches?: CensusMatch[] } }).result?.addressMatches ?? [])
    : [];
  if (!matches.length) return fallback;
  const parsed = parseCensusMatch(matches[0]);
  if (!parsed) return fallback;
  return {
    ...parsed,
    street: fallback.street || parsed.street,
    city: fallback.city || parsed.city,
    state: fallback.state || parsed.state,
    zip: parsed.zip || fallback.zip,
    lat: parsed.lat ?? fallback.lat,
    lng: parsed.lng ?? fallback.lng,
  };
}
