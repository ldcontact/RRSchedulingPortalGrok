import { dayKey, TZ } from "@/lib/time";
import { etaMinutes, formatDistance, haversineMeters, isArrived } from "./distance";
import { parseDurationMs } from "./parse";
import type { FleetNearestVisit, FleetStatus, FleetVisitPin } from "./types";

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
}

export function formatDriveMinutes(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} hr ${rem} min` : `${h} hr`;
}

export function formatEtaSummary(etaAt: string, startsAt: string, asOf?: string): { summary: string; late: boolean } {
  const eta = Date.parse(etaAt);
  const start = Date.parse(startsAt);
  const when = `Arrives ~${clock(etaAt)}`;
  if (!Number.isFinite(eta) || !Number.isFinite(start)) {
    return { summary: when, late: false };
  }
  const startIsToday = !asOf || dayKey(startsAt) === dayKey(asOf);
  const startHasPassed = !asOf || start <= Date.parse(asOf);
  const deltaMin = Math.round((eta - start) / 60_000);
  if (deltaMin >= 1) {
    // Late only for a visit that starts today, after that start has passed.
    if (!startIsToday || !startHasPassed) return { summary: when, late: false };
    return { summary: `${when}, ${formatDriveMinutes(deltaMin)} late`, late: true };
  }
  if (!startIsToday) return { summary: when, late: false };
  if (deltaMin <= -1) return { summary: `${when}, ${formatDriveMinutes(-deltaMin)} early`, late: false };
  return { summary: `${when}, on time`, late: false };
}

export function onSiteSinceIso(lastUpdate: string | null, durationRaw: unknown, asOf: string): string | null {
  const end = Date.parse(lastUpdate || asOf);
  if (!Number.isFinite(end)) return null;
  const ms = parseDurationMs(durationRaw);
  return new Date(end - (ms ?? 0)).toISOString();
}

export function formatOnSiteSince(iso: string): string {
  return `On site since ${clock(iso)}`;
}

/** Today's remaining or in-progress visit for this tech, preferring a site they are already at. */
export function pickNextVisitToday(
  visits: FleetVisitPin[],
  profileId: string,
  vehicle: { status: FleetStatus; lat: number; lng: number },
  asOf: string,
): FleetVisitPin | null {
  const now = Date.parse(asOf);
  if (!Number.isFinite(now)) return null;
  const today = dayKey(asOf);
  const mine = visits.filter((v) => v.assigneeIds.includes(profileId) && Date.parse(v.endsAt) > now && dayKey(v.startsAt) === today);
  if (!mine.length) return null;
  const onSite = mine.find((v) => isArrived(vehicle, { lat: v.latitude, lng: v.longitude }));
  if (onSite) return onSite;
  const current = mine.filter((v) => Date.parse(v.startsAt) <= now);
  const upcoming = mine.filter((v) => Date.parse(v.startsAt) > now);
  const pool = current.length ? current : upcoming;
  pool.sort((a, b) => {
    const da = haversineMeters({ lat: vehicle.lat, lng: vehicle.lng }, { lat: a.latitude, lng: a.longitude });
    const db = haversineMeters({ lat: vehicle.lat, lng: vehicle.lng }, { lat: b.latitude, lng: b.longitude });
    if (current.length) return da - db || a.startsAt.localeCompare(b.startsAt);
    return a.startsAt.localeCompare(b.startsAt) || da - db;
  });
  return pool[0] ?? null;
}

export function buildNearestVisit(opts: {
  visit: FleetVisitPin;
  vehicle: { status: FleetStatus; lat: number; lng: number; lastUpdate: string | null; currentStateDuration: string | null };
  asOf: string;
  speedMph: number | null;
  driving?: { meters: number; minutes: number; source: "osrm" | "straight-line"; route: [number, number][] };
}): FleetNearestVisit {
  const { visit: v, vehicle, asOf, speedMph, driving } = opts;
  const straight = haversineMeters({ lat: vehicle.lat, lng: vehicle.lng }, { lat: v.latitude, lng: v.longitude });
  const arrived = isArrived(vehicle, { lat: v.latitude, lng: v.longitude });
  const straightLabel = formatDistance(straight);
  const driveMeters = driving?.meters ?? straight;
  const driveLabel = formatDistance(driveMeters);
  const source = driving?.source ?? "straight-line";
  if (arrived) {
    const since = onSiteSinceIso(vehicle.lastUpdate, vehicle.currentStateDuration, asOf);
    return {
      jobId: v.jobId,
      title: v.title,
      customerName: v.customerName,
      address: v.address,
      startsAt: v.startsAt,
      distanceMeters: Math.round(straight),
      distanceLabel: "On site",
      straightLineMeters: Math.round(straight),
      straightLineLabel: straightLabel,
      drivingDistanceMeters: Math.round(driveMeters),
      drivingDistanceLabel: driveLabel,
      driveSource: source,
      etaMinutes: 0,
      etaAt: null,
      etaSummary: null,
      late: false,
      kind: "onsite",
      onSiteSince: since,
      onSiteSinceLabel: since ? formatOnSiteSince(since) : "On site",
      route: [],
    };
  }
  const minutes = driving?.minutes ?? etaMinutes(driveMeters, speedMph);
  const etaAt = new Date(Date.parse(asOf) + minutes * 60_000).toISOString();
  const eta = formatEtaSummary(etaAt, v.startsAt, asOf);
  return {
    jobId: v.jobId,
    title: v.title,
    customerName: v.customerName,
    address: v.address,
    startsAt: v.startsAt,
    distanceMeters: Math.round(driveMeters),
    distanceLabel: driveLabel,
    straightLineMeters: Math.round(straight),
    straightLineLabel: formatDistance(straight),
    drivingDistanceMeters: Math.round(driveMeters),
    drivingDistanceLabel: driveLabel,
    driveSource: source,
    etaMinutes: minutes,
    etaAt,
    etaSummary: eta.summary,
    late: eta.late,
    kind: "enroute",
    onSiteSince: null,
    onSiteSinceLabel: null,
    route: driving?.route ?? [],
  };
}

export function visitPinColor(visit: { assignees: { color?: string }[] }, fallback = "#d97706"): string {
  const color = visit.assignees[0]?.color?.trim();
  return color || fallback;
}
