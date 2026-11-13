/** Parse US Census Geocoder responses. Pure; safe to import from tests and Node scripts. */

export const GEOCODE_STATUSES = ["matched", "no_match", "tie", "error"] as const;
export type GeocodeStatus = (typeof GEOCODE_STATUSES)[number];

export type GeocodeResult = {
  status: GeocodeStatus;
  lat: number | null;
  lng: number | null;
  matchedAddress: string | null;
  matchType: string | null;
};

export type BatchGeocodeRow = GeocodeResult & { id: string; input: string };

export const emptyGeocode = (): { lat: null; lng: null; geocoded_at: null; geocode_status: null } => ({
  lat: null, lng: null, geocoded_at: null, geocode_status: null,
});

export type AddressParts = { address?: string | null; city?: string | null; state?: string | null; zip?: string | null };

/** Coordinates posted by AddressFields (hidden geo_lat / geo_lng inputs). */
export function parsePickedCoords(fd: FormData, latName = "geo_lat", lngName = "geo_lng"): { lat: number; lng: number } | null {
  const latRaw = String(fd.get(latName) ?? "").trim();
  const lngRaw = String(fd.get(lngName) ?? "").trim();
  if (!latRaw || !lngRaw) return null;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** One-line form used by /locations/onelineaddress (and as a change detector). */
export function formatGeocodeLine(p: AddressParts | null | undefined): string {
  if (!p) return "";
  return [p.address, [p.city, p.state].filter(Boolean).join(", "), p.zip].filter((s) => (s ?? "").toString().trim()).join(", ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim();
}

export function addressChanged(a: AddressParts | null | undefined, b: AddressParts | null | undefined): boolean {
  const norm = (p: AddressParts | null | undefined) =>
    [(p?.address ?? "").trim(), (p?.city ?? "").trim(), (p?.state ?? "").trim().toUpperCase(), (p?.zip ?? "").trim()].join("|");
  return norm(a) !== norm(b);
}

export function shouldGeocode(existing: { geocode_status?: GeocodeStatus | null; lat?: number | null } | null, next: AddressParts, prev: AddressParts | null, isNew: boolean): "geocode" | "clear" | "skip" {
  if (!formatGeocodeLine(next)) return existing && (existing.lat != null || existing.geocode_status) ? "clear" : "skip";
  if (isNew || !prev || addressChanged(prev, next)) return "geocode";
  if (!existing?.geocode_status || existing.geocode_status === "error") return "geocode";
  return "skip";
}

/** RFC 4180-ish CSV line (quoted fields, escaped quotes). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Batch coordinates come as a single "lng,lat" field, not two columns. */
export function parseCensusLngLat(raw: string | null | undefined): { lat: number; lng: number } | null {
  if (!raw) return null;
  const parts = raw.split(",").map((s) => Number(s.trim()));
  if (parts.length < 2) return null;
  const [lng, lat] = parts;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function parseBatchLine(line: string): BatchGeocodeRow {
  const cols = parseCsvLine(line.trim());
  const id = cols[0] ?? "";
  const input = cols[1] ?? "";
  const flag = (cols[2] ?? "").trim();
  const base = { id, input, lat: null as number | null, lng: null as number | null, matchedAddress: null as string | null, matchType: null as string | null };
  if (/^no_match$/i.test(flag)) return { ...base, status: "no_match" };
  if (/^tie$/i.test(flag)) {
    return { ...base, status: "tie", matchType: cols[3] || null, matchedAddress: cols[4] || null };
  }
  if (/^match$/i.test(flag)) {
    const coords = parseCensusLngLat(cols[5]);
    return {
      ...base,
      status: coords ? "matched" : "error",
      matchType: cols[3] || null,
      matchedAddress: cols[4] || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };
  }
  return { ...base, status: "error" };
}

export function parseBatchResponse(csv: string): BatchGeocodeRow[] {
  return csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(parseBatchLine);
}

export function parseOnelineResponse(json: unknown): GeocodeResult {
  const empty: GeocodeResult = { status: "no_match", lat: null, lng: null, matchedAddress: null, matchType: null };
  if (!json || typeof json !== "object") return { ...empty, status: "error" };
  const result = (json as { result?: { addressMatches?: unknown } }).result;
  const matches = result?.addressMatches;
  if (!Array.isArray(matches) || matches.length === 0) return empty;
  if (matches.length > 1) return { ...empty, status: "tie" };
  const m = matches[0] && typeof matches[0] === "object" ? matches[0] as { matchedAddress?: unknown; coordinates?: { x?: unknown; y?: unknown } } : {};
  const lat = Number(m.coordinates?.y);
  const lng = Number(m.coordinates?.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ...empty, status: "error" };
  return {
    status: "matched",
    lat,
    lng,
    matchedAddress: typeof m.matchedAddress === "string" ? m.matchedAddress : null,
    matchType: null,
  };
}

/** Pick stored coords for a visit: ticket site if that address is set, otherwise the customer. */
export function visitCoords(
  customer: { lat?: number | null; lng?: number | null; geocode_status?: GeocodeStatus | null } | null | undefined,
  site?: { lat?: number | null; lng?: number | null; geocode_status?: GeocodeStatus | null; site_address?: string | null } | null,
): { latitude: number | null; longitude: number | null } {
  const useSite = !!(site && (site.site_address ?? "").trim());
  const src = useSite ? site : customer;
  if (src && src.geocode_status === "matched" && src.lat != null && src.lng != null) {
    return { latitude: src.lat, longitude: src.lng };
  }
  return { latitude: null, longitude: null };
}

/** Format a batch input row: Unique ID, Street, City, State, ZIP (no header). */
export function formatBatchInput(rows: { id: string; address: string | null; city: string | null; state: string | null; zip: string | null }[]): string {
  const esc = (s: string) => /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return rows.map((r) => [r.id, r.address ?? "", r.city ?? "", r.state ?? "", r.zip ?? ""].map((v) => esc(String(v).trim())).join(",")).join("\n") + (rows.length ? "\n" : "");
}

export function isPendingGeocode(row: { address?: string | null; site_address?: string | null; lat?: number | null; geocode_status?: GeocodeStatus | null }): boolean {
  const line = (row.address ?? row.site_address ?? "").trim();
  if (!line) return false;
  if (row.geocode_status === "no_match" || row.geocode_status === "tie" || row.geocode_status === "matched") return false;
  return row.lat == null; // null status or error
}
