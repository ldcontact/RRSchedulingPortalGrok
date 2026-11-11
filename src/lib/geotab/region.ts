/** Continental US bounds (CONUS, excluding Alaska and Hawaii). */
export const CONUS = { minLat: 24.396, maxLat: 49.384, minLng: -124.848, maxLng: -66.885 };

/** Default map frame when no recent in-region vehicles or visits are available. */
export const CHICAGO_CENTER: [number, number] = [41.95, -87.95];
export const CHICAGO_DEFAULT_ZOOM = 10;
export const CHICAGO_BOUNDS: [[number, number], [number, number]] = [
  [41.62, -88.35],
  [42.20, -87.62],
];

export const RECENT_PING_MS = 7 * 24 * 60 * 60 * 1000;

export type GeoPoint = { latitude: number; longitude: number };

export function hasValidCoordinates(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function isInContinentalUS(lat: number, lng: number): boolean {
  return lat >= CONUS.minLat && lat <= CONUS.maxLat && lng >= CONUS.minLng && lng <= CONUS.maxLng;
}

/** Pin a vehicle only when its last position is a valid continental-US coordinate. */
export function isMappablePoint(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return hasValidCoordinates(lat, lng) && isInContinentalUS(lat!, lng!);
}

export function isRecentPing(lastUpdate: string | null | undefined, asOf?: string | null, nowMs = Date.now()): boolean {
  if (!lastUpdate) return false;
  const t = Date.parse(lastUpdate);
  if (!Number.isFinite(t)) return false;
  const ref = asOf ? Date.parse(asOf) : nowMs;
  const origin = Number.isFinite(ref) ? ref : nowMs;
  const age = origin - t;
  // Allow a little clock skew forward; reject anything older than 7 days.
  return age <= RECENT_PING_MS && age >= -60 * 60 * 1000;
}

/** Include in auto-fit when the point is mappable and the last ping is recent (or still communicating with a recent/unknown ping). */
export function includeInAutoFit(v: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  lastUpdate?: string | null;
  isDeviceCommunicating?: boolean;
  status?: string;
}, asOf?: string | null, nowMs = Date.now()): boolean {
  if (!isMappablePoint(v.latitude, v.longitude)) return false;
  if (isRecentPing(v.lastUpdate, asOf, nowMs)) return true;
  // Communicating but no timestamp: keep in the Chicago-area fit rather than dropping them.
  if (!v.lastUpdate && v.isDeviceCommunicating) return true;
  return false;
}

export function autoFitPoints(
  vehicles: { latitude: number; longitude: number; lastUpdate?: string | null; isDeviceCommunicating?: boolean; status?: string }[],
  visits: GeoPoint[],
  asOf?: string | null,
  nowMs = Date.now(),
): GeoPoint[] {
  const pts: GeoPoint[] = [];
  for (const v of vehicles) {
    if (includeInAutoFit(v, asOf, nowMs)) pts.push({ latitude: v.latitude, longitude: v.longitude });
  }
  for (const v of visits) {
    if (isMappablePoint(v.latitude, v.longitude)) pts.push({ latitude: v.latitude, longitude: v.longitude });
  }
  return pts;
}
