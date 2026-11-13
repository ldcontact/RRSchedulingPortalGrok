import { etaMinutes, haversineMeters } from "./distance";

const OSRM_URL = process.env.OSRM_URL || "https://router.project-osrm.org";
const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 2_500;
const CONCURRENCY = 2;
/** Round coordinates so small GPS jitter reuses the cache (~11 m). */
const PRECISION = 4;

export type DrivingRoute = {
  meters: number;
  minutes: number;
  source: "osrm" | "straight-line";
  route: [number, number][];
};

type CacheEntry = { at: number; value: DrivingRoute };
const cache = new Map<string, CacheEntry>();

export function routeCacheKey(from: { lat: number; lng: number }, jobId: string): string {
  return `${jobId}:${from.lat.toFixed(PRECISION)},${from.lng.toFixed(PRECISION)}`;
}

export function clearRouteCache() {
  cache.clear();
}

function fallback(from: { lat: number; lng: number }, to: { lat: number; lng: number }, speedMph: number | null): DrivingRoute {
  const meters = haversineMeters(from, to);
  return { meters, minutes: etaMinutes(meters, speedMph), source: "straight-line", route: [] };
}

export async function fetchDrivingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  speedMph: number | null,
  jobId: string,
): Promise<DrivingRoute> {
  const key = routeCacheKey(from, jobId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const straight = fallback(from, to, speedMph);
  const url = `${OSRM_URL.replace(/\/$/, "")}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { accept: "application/json", "user-agent": "RRScheduler-fleet-route/1.0" },
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      cache.set(key, { at: Date.now(), value: straight });
      return straight;
    }
    const body = (await res.json()) as {
      code?: string;
      routes?: { distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }[];
    };
    const route = body.routes?.[0];
    if (body.code !== "Ok" || !route || route.distance == null || route.duration == null) {
      cache.set(key, { at: Date.now(), value: straight });
      return straight;
    }
    const value: DrivingRoute = {
      meters: route.distance,
      minutes: Math.max(1, Math.round(route.duration / 60)),
      source: "osrm",
      route: (route.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng]),
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    cache.set(key, { at: Date.now(), value: straight });
    return straight;
  }
}

export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

export const ROUTE_CONCURRENCY = CONCURRENCY;

export { fallback as straightLineRoute };
