import "server-only";
import {
  ADDRESS_BIAS,
  ILLINOIS_BBOX,
  parseCensusMatch,
  parseNominatimHit,
  parsePhotonFeature,
  prepareAddressQuery,
  type AddressSuggestion,
  type CensusMatch,
  type NominatimHit,
  type PhotonFeature,
} from "@/lib/address-suggest";
import { formatGeocodeLine, type AddressParts } from "./parse";
import { houseNumber, inIllinoisBbox, pickStreetMatch, sparseAddressReason } from "./chain-pick";

const UA = "RR-Scheduler/1.0 (address-autocomplete; retrofitrebates.com)";
const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const PHOTON_GAP_MS = 200;
const NOMINATIM_GAP_MS = 1_100;
const CENSUS_GAP_MS = 200;

export type ChainSource = "photon" | "nominatim" | "census";
export type ChainResult = {
  status: "matched" | "no_match" | "skipped";
  source: ChainSource | null;
  lat: number | null;
  lng: number | null;
  reason?: string;
};

const lastCall = { photon: 0, nominatim: 0, census: 0 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle(kind: keyof typeof lastCall, gap: number) {
  const wait = lastCall[kind] + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall[kind] = Date.now();
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
  await throttle("photon", PHOTON_GAP_MS);
  const params = new URLSearchParams({
    q: prepared,
    lat: String(ADDRESS_BIAS.lat),
    lon: String(ADDRESS_BIAS.lng),
    limit: "15",
    lang: "en",
    bbox: `${ILLINOIS_BBOX.minLon},${ILLINOIS_BBOX.minLat},${ILLINOIS_BBOX.maxLon},${ILLINOIS_BBOX.maxLat}`,
  });
  const data = await fetchJson(`${PHOTON}?${params}`, 4_000);
  const features = (data && typeof data === "object" ? (data as { features?: PhotonFeature[] }).features : null) ?? [];
  let items = features.map((f, i) => parsePhotonFeature(f, i)).filter((x): x is AddressSuggestion => !!x);
  if (!items.length) {
    await throttle("photon", PHOTON_GAP_MS);
    const retry = new URLSearchParams({
      q: prepared, lat: String(ADDRESS_BIAS.lat), lon: String(ADDRESS_BIAS.lng), limit: "15", lang: "en",
    });
    const data2 = await fetchJson(`${PHOTON}?${retry}`, 4_000);
    const feats = (data2 && typeof data2 === "object" ? (data2 as { features?: PhotonFeature[] }).features : null) ?? [];
    items = feats.map((f, i) => parsePhotonFeature(f, i)).filter((x): x is AddressSuggestion => !!x);
  }
  return items;
}

async function queryNominatim(prepared: string): Promise<AddressSuggestion[]> {
  await throttle("nominatim", NOMINATIM_GAP_MS);
  const params = new URLSearchParams({
    q: prepared,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "us",
    limit: "8",
    viewbox: `${ILLINOIS_BBOX.minLon},${ILLINOIS_BBOX.maxLat},${ILLINOIS_BBOX.maxLon},${ILLINOIS_BBOX.minLat}`,
    bounded: "0",
  });
  const data = await fetchJson(`${NOMINATIM}?${params}`, 5_000);
  const rows = Array.isArray(data) ? (data as NominatimHit[]) : [];
  return rows.map((h, i) => parseNominatimHit(h, i)).filter((x): x is AddressSuggestion => !!x);
}

async function queryCensus(line: string): Promise<AddressSuggestion | null> {
  await throttle("census", CENSUS_GAP_MS);
  const url = `${CENSUS}?${new URLSearchParams({ address: line, benchmark: "Public_AR_Current", format: "json" })}`;
  const json = await fetchJson(url, 5_000);
  if (!json || typeof json !== "object") return null;
  const matches = (json as { result?: { addressMatches?: CensusMatch[] } }).result?.addressMatches ?? [];
  if (!matches.length) return null;
  return parseCensusMatch(matches[0]);
}

/** Photon, then Nominatim (≈1 req/s), then Census. Street-level matches inside Illinois only. */
export async function geocodeAddressChain(parts: AddressParts): Promise<ChainResult> {
  const sparse = sparseAddressReason(parts);
  if (sparse) return { status: "skipped", source: null, lat: null, lng: null, reason: sparse };
  const line = formatGeocodeLine(parts);
  if (!line) return { status: "skipped", source: null, lat: null, lng: null, reason: "no street address" };
  const prepared = prepareAddressQuery(line);
  const want = houseNumber(parts.address);
  const photon = pickStreetMatch(await queryPhoton(prepared), prepared, want);
  if (photon?.lat != null && photon.lng != null) return { status: "matched", source: "photon", lat: photon.lat, lng: photon.lng };
  const nominatim = pickStreetMatch(await queryNominatim(prepared), prepared, want);
  if (nominatim?.lat != null && nominatim.lng != null) return { status: "matched", source: "nominatim", lat: nominatim.lat, lng: nominatim.lng };
  const census = await queryCensus(line);
  if (census?.lat != null && census.lng != null && inIllinoisBbox(census.lat, census.lng)) {
    return { status: "matched", source: "census", lat: census.lat, lng: census.lng };
  }
  return { status: "no_match", source: null, lat: null, lng: null, reason: "no street-level match" };
}
