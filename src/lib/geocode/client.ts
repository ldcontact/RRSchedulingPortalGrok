import "server-only";
import { formatBatchInput, formatGeocodeLine, parseBatchResponse, parseOnelineResponse, type AddressParts, type BatchGeocodeRow, type GeocodeResult } from "./parse";

const BASE = "https://geocoding.geo.census.gov/geocoder";
const BENCHMARK = "Public_AR_Current";
const UA = "RR-Scheduler/1.0 (geocoding)";
const SINGLE_TIMEOUT_MS = 5_000;
const BATCH_TIMEOUT_MS = 60_000;

const errorResult = (status: GeocodeResult["status"] = "error"): GeocodeResult => ({ status, lat: null, lng: null, matchedAddress: null, matchType: null });

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { accept: "application/json, text/plain, */*", "user-agent": UA, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(t);
  }
}

/** Single-line Census geocode. Never throws; timeouts and HTTP errors become status=error. */
export async function geocodeOneline(parts: AddressParts | string, timeoutMs = SINGLE_TIMEOUT_MS): Promise<GeocodeResult> {
  const address = typeof parts === "string" ? parts.trim() : formatGeocodeLine(parts);
  if (!address) return errorResult("no_match");
  const url = `${BASE}/locations/onelineaddress?${new URLSearchParams({ address, benchmark: BENCHMARK, format: "json" })}`;
  try {
    const res = await fetchWithTimeout(url, { method: "GET" }, timeoutMs);
    if (!res.ok) return errorResult("error");
    return parseOnelineResponse(await res.json());
  } catch {
    return errorResult("error");
  }
}

/** Batch Census geocode. Chunks are the caller's responsibility (max 10,000; we use 1,000). */
export async function geocodeBatch(rows: { id: string; address: string | null; city: string | null; state: string | null; zip: string | null }[], timeoutMs = BATCH_TIMEOUT_MS): Promise<BatchGeocodeRow[]> {
  if (!rows.length) return [];
  const csv = formatBatchInput(rows);
  const body = new FormData();
  body.set("benchmark", BENCHMARK);
  body.set("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
  try {
    const res = await fetchWithTimeout(`${BASE}/locations/addressbatch`, { method: "POST", body }, timeoutMs);
    if (!res.ok) {
      return rows.map((r) => ({ id: r.id, input: formatGeocodeLine(r), status: "error" as const, lat: null, lng: null, matchedAddress: null, matchType: null }));
    }
    const text = await res.text();
    const parsed = parseBatchResponse(text);
    const byId = new Map(parsed.map((p) => [p.id, p]));
    return rows.map((r) => byId.get(r.id) ?? { id: r.id, input: formatGeocodeLine(r), status: "error", lat: null, lng: null, matchedAddress: null, matchType: null });
  } catch {
    return rows.map((r) => ({ id: r.id, input: formatGeocodeLine(r), status: "error" as const, lat: null, lng: null, matchedAddress: null, matchType: null }));
  }
}
