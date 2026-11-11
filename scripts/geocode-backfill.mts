/**
 * Backfill customer and service-request coordinates via the US Census batch geocoder
 * (benchmark Public_AR_Current, /locations/addressbatch, chunks of 1,000).
 *
 * Default is dry-run (counts only, no Census calls, no writes). Never prints secrets.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/geocode-backfill.mts --dry-run
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/geocode-backfill.mts --mock-db=.mock-db.json --dry-run
 *
 * --apply        Write results (requires Supabase URL + SUPABASE_SERVICE_ROLE_KEY).
 *                Do not use this against production.
 * --chunk=1000   Batch size (max 10,000).
 * --mock-db=PATH Count (or, with --apply-mock, update) a local .mock-db.json file.
 * --apply-mock   Write Census results back to the mock JSON file (local only).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { formatBatchInput, formatGeocodeLine, isPendingGeocode, parseBatchResponse, type GeocodeStatus } from "../src/lib/geocode/parse.ts";

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
const BENCHMARK = "Public_AR_Current";
const UA = "RR-Scheduler/1.0 (geocode-backfill)";
const MAX_CHUNK = 10_000;

type AddrRow = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  geocoded_at: string | null;
  geocode_status: GeocodeStatus | null;
  kind: "customer" | "service_request";
};

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  if (hit === `--${name}`) return "true";
  return hit.slice(name.length + 3);
}

function supabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
}

function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function asStatus(v: unknown): GeocodeStatus | null {
  return v === "matched" || v === "no_match" || v === "tie" || v === "error" ? v : null;
}

function pending(rows: AddrRow[]): AddrRow[] {
  return rows.filter((r) => isPendingGeocode({
    address: r.kind === "customer" ? r.address : r.kind === "service_request" ? r.address : r.address,
    site_address: r.kind === "service_request" ? r.address : null,
    lat: r.lat,
    geocode_status: r.geocode_status,
  }) && formatGeocodeLine(r));
}

function printCounts(source: string, customers: AddrRow[], tickets: AddrRow[]) {
  const pc = pending(customers);
  const pt = pending(tickets);
  console.log(`Source: ${source}`);
  console.log(`Customers: ${customers.length} with an address, ${pc.length} would be geocoded`);
  console.log(`Service requests: ${tickets.length} with a site address, ${pt.length} would be geocoded`);
  console.log(`Total to geocode: ${pc.length + pt.length}`);
  return { customers: pc, tickets: pt };
}

async function censusBatch(rows: AddrRow[], chunk: number): Promise<Map<string, { lat: number | null; lng: number | null; geocode_status: GeocodeStatus; geocoded_at: string }>> {
  const out = new Map<string, { lat: number | null; lng: number | null; geocode_status: GeocodeStatus; geocoded_at: string }>();
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const csv = formatBatchInput(slice);
    const body = new FormData();
    body.set("benchmark", BENCHMARK);
    body.set("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(CENSUS, { method: "POST", body, headers: { "user-agent": UA }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`Census batch HTTP ${res.status}`);
      const parsed = parseBatchResponse(await res.text());
      const at = new Date().toISOString();
      for (const row of parsed) {
        out.set(row.id, { lat: row.lat, lng: row.lng, geocode_status: row.status, geocoded_at: at });
      }
    } finally {
      clearTimeout(timer);
    }
    if (i + chunk < rows.length) await new Promise((r) => setTimeout(r, 1000));
  }
  return out;
}

function loadMock(path: string): { customers: AddrRow[]; tickets: AddrRow[]; raw: Record<string, unknown> } {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const customers = ((raw.customers as Record<string, unknown>[]) ?? [])
    .filter((c) => String(c.address ?? "").trim())
    .map((c) => ({
      id: String(c.id), address: (c.address as string | null) ?? null, city: (c.city as string | null) ?? null,
      state: (c.state as string | null) ?? null, zip: (c.zip as string | null) ?? null,
      lat: typeof c.lat === "number" ? c.lat : null, lng: typeof c.lng === "number" ? c.lng : null,
      geocoded_at: (c.geocoded_at as string | null) ?? null, geocode_status: asStatus(c.geocode_status),
      kind: "customer" as const,
    }));
  const tickets = ((raw.service_requests as Record<string, unknown>[]) ?? [])
    .filter((c) => String(c.site_address ?? "").trim())
    .map((c) => ({
      id: String(c.id), address: (c.site_address as string | null) ?? null, city: (c.site_city as string | null) ?? null,
      state: (c.site_state as string | null) ?? null, zip: (c.site_zip as string | null) ?? null,
      lat: typeof c.lat === "number" ? c.lat : null, lng: typeof c.lng === "number" ? c.lng : null,
      geocoded_at: (c.geocoded_at as string | null) ?? null, geocode_status: asStatus(c.geocode_status),
      kind: "service_request" as const,
    }));
  return { customers, tickets, raw };
}

async function loadSupabase(): Promise<{ customers: AddrRow[]; tickets: AddrRow[] }> {
  const url = supabaseUrl();
  const key = serviceKey();
  if (!url) throw new Error("Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL to use Supabase (values are not printed).");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
  const headers = { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" };
  const getAll = async (path: string) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`Supabase read failed (HTTP ${res.status}).`);
    return await res.json() as Record<string, unknown>[];
  };
  const customers = (await getAll("customers?select=id,address,city,state,zip,lat,lng,geocoded_at,geocode_status&address=not.is.null"))
    .filter((c) => String(c.address ?? "").trim())
    .map((c) => ({
      id: String(c.id), address: (c.address as string | null) ?? null, city: (c.city as string | null) ?? null,
      state: (c.state as string | null) ?? null, zip: (c.zip as string | null) ?? null,
      lat: typeof c.lat === "number" ? c.lat : null, lng: typeof c.lng === "number" ? c.lng : null,
      geocoded_at: (c.geocoded_at as string | null) ?? null, geocode_status: asStatus(c.geocode_status),
      kind: "customer" as const,
    }));
  const tickets = (await getAll("service_requests?select=id,site_address,site_city,site_state,site_zip,lat,lng,geocoded_at,geocode_status&site_address=not.is.null"))
    .filter((c) => String(c.site_address ?? "").trim())
    .map((c) => ({
      id: String(c.id), address: (c.site_address as string | null) ?? null, city: (c.site_city as string | null) ?? null,
      state: (c.site_state as string | null) ?? null, zip: (c.site_zip as string | null) ?? null,
      lat: typeof c.lat === "number" ? c.lat : null, lng: typeof c.lng === "number" ? c.lng : null,
      geocoded_at: (c.geocoded_at as string | null) ?? null, geocode_status: asStatus(c.geocode_status),
      kind: "service_request" as const,
    }));
  return { customers, tickets };
}

async function patchSupabase(rows: { table: string; id: string; patch: Record<string, unknown> }[]) {
  const url = supabaseUrl();
  const key = serviceKey();
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=minimal" };
  for (const row of rows) {
    const res = await fetch(`${url}/rest/v1/${row.table}?id=eq.${row.id}`, { method: "PATCH", headers, body: JSON.stringify(row.patch) });
    if (!res.ok) throw new Error(`Supabase write failed (HTTP ${res.status}).`);
  }
}

async function main() {
  const dry = arg("dry-run", arg("apply") || arg("apply-mock") ? undefined : "true") === "true";
  const apply = arg("apply") === "true";
  const applyMock = arg("apply-mock") === "true";
  const chunk = Math.min(MAX_CHUNK, Math.max(1, Number(arg("chunk", "1000")) || 1000));
  const mockPath = arg("mock-db");

  if (apply && applyMock) {
    console.error("Use either --apply (Supabase) or --apply-mock (local JSON), not both.");
    process.exit(1);
  }
  if (apply) {
    console.error("Refusing to guess: --apply writes to whichever Supabase project the env points at. This script will not run --apply in this session unless you intend a non-production database.");
    // Still allow the flag for a local supabase, but require an explicit --i-know-this-is-not-prod
    if (arg("i-know-this-is-not-prod") !== "true") {
      console.error("Pass --i-know-this-is-not-prod if you are sure the env is not production. Default stays dry-run.");
      process.exit(1);
    }
  }

  let source: string;
  let customers: AddrRow[];
  let tickets: AddrRow[];
  let mockRaw: Record<string, unknown> | null = null;
  const mockFile = mockPath ? resolve(mockPath) : resolve(".mock-db.json");

  if (mockPath || (!supabaseUrl() && existsSync(mockFile))) {
    if (!existsSync(mockFile)) {
      console.error(`Mock database file not found.`);
      process.exit(1);
    }
    const loaded = loadMock(mockFile);
    customers = loaded.customers;
    tickets = loaded.tickets;
    mockRaw = loaded.raw;
    source = `local mock file (${customers.length + tickets.length} addressed rows)`;
  } else {
    const loaded = await loadSupabase();
    customers = loaded.customers;
    tickets = loaded.tickets;
    source = "Supabase (read-only until --apply)";
  }

  const { customers: pc, tickets: pt } = printCounts(source, customers, tickets);
  if (dry && !apply && !applyMock) return;

  const all = [...pc, ...pt];
  if (!all.length) {
    console.log("Nothing to geocode.");
    return;
  }
  console.log(`Calling Census in chunks of ${chunk}…`);
  // Prefix ids so customer and ticket primary keys cannot collide in one batch.
  const tagged = all.map((r) => ({ ...r, batchId: r.kind === "customer" ? `c:${r.id}` : `s:${r.id}` }));
  const results = await censusBatch(tagged.map((r) => ({ ...r, id: r.batchId })), chunk);
  const atCustomers = (mockRaw?.customers as Record<string, unknown>[] | undefined) ?? [];
  const atTickets = (mockRaw?.service_requests as Record<string, unknown>[] | undefined) ?? [];
  let updated = 0;
  const supabasePatches: { table: string; id: string; patch: Record<string, unknown> }[] = [];
  for (const r of tagged) {
    const hit = results.get(r.batchId);
    if (!hit) continue;
    updated += 1;
    if (applyMock && mockRaw) {
      const list = r.kind === "customer" ? atCustomers : atTickets;
      const row = list.find((x) => String(x.id) === r.id);
      if (row) Object.assign(row, hit);
    }
    if (apply) {
      supabasePatches.push({ table: r.kind === "customer" ? "customers" : "service_requests", id: r.id, patch: hit });
    }
  }
  if (applyMock && mockRaw && mockPath) {
    writeFileSync(resolve(mockPath), JSON.stringify(mockRaw, null, 2));
    console.log(`Wrote ${updated} geocode results to the mock file.`);
  } else if (apply) {
    await patchSupabase(supabasePatches);
    console.log(`Wrote ${updated} geocode results to Supabase.`);
  } else {
    console.log(`Census returned ${updated} rows (not written; pass --apply-mock or --apply to save).`);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : "Backfill failed";
  console.error(msg);
  process.exit(1);
});
