/** Earth radius in meters (mean). */
const R = 6_371_000;
const ARRIVE_METERS = 150;

export const ARRIVAL_RADIUS_M = ARRIVE_METERS;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isArrived(vehicle: { status: "driving" | "stopped" | "offline"; lat: number; lng: number }, visit: { lat: number; lng: number } | null | undefined, radiusM = ARRIVE_METERS): boolean {
  if (!visit || vehicle.status !== "stopped") return false;
  return haversineMeters({ lat: vehicle.lat, lng: vehicle.lng }, visit) <= radiusM;
}

export function metersToMiles(m: number): number {
  return m / 1609.344;
}

export function formatDistance(meters: number): string {
  const miles = metersToMiles(meters);
  if (miles < 0.05) return "On site";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/** Rough driving ETA from distance and speed; falls back to 25 mph when stopped/unknown. */
export function etaMinutes(meters: number, speedMph: number | null): number {
  const mph = speedMph && speedMph > 3 ? speedMph : 25;
  return Math.max(1, Math.round((metersToMiles(meters) / mph) * 60));
}

export function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}
