import { etaMinutes, formatDistance, haversineMeters, isArrived } from "./distance";
import { parseDurationLabel, snapshotSpeedMph } from "./parse";
import { sampleVisitPins } from "./sample";
import type { FleetLocationsResponse, FleetMapping, FleetNearestVisit, FleetPerson, FleetVehicle, FleetVisitPin, GeotabVehicleSnapshot } from "./types";

export type AssembleInput = {
  sample: boolean;
  asOf: string;
  snapshots: GeotabVehicleSnapshot[];
  mappings: FleetMapping[];
  people: FleetPerson[];
  jobs: { id: string; title: string; customer_name: string; address: string | null; starts_at: string; ends_at: string; assignees: { id: string }[] }[];
  scope: "all" | "own";
  viewerId: string;
};

export function assembleLocations(input: AssembleInput): FleetLocationsResponse {
  const peopleById = new Map(input.people.map((p) => [p.id, p]));
  const mapByDevice = new Map(input.mappings.map((m) => [m.geotab_device_id, m]));
  const visits: FleetVisitPin[] = input.sample ? sampleVisitPins(input.jobs) : [];
  const snaps = input.scope === "own"
    ? input.snapshots.filter((s) => mapByDevice.get(s.id)?.profile_id === input.viewerId)
    : input.snapshots;

  const vehicles: FleetVehicle[] = snaps.map((s) => {
    const mapping = mapByDevice.get(s.id);
    const profile = mapping?.profile_id ? peopleById.get(mapping.profile_id) ?? null : null;
    const speedMph = snapshotSpeedMph(s);
    return {
      id: s.id,
      name: s.name,
      label: mapping?.label ?? null,
      status: s.status,
      speedMph,
      latitude: s.latitude,
      longitude: s.longitude,
      heading: s.heading,
      lastUpdate: s.lastUpdate,
      isDeviceCommunicating: s.isDeviceCommunicating,
      stoppedForLabel: s.status === "stopped" ? parseDurationLabel(s.currentStateDuration) : null,
      geotabDriverName: s.geotabDriverName,
      profile,
      nearestVisit: nearestVisit(s, profile?.id, visits, speedMph),
    };
  });

  return { sample: input.sample, asOf: input.asOf, geocoding: "unavailable", vehicles, visits };
}

function nearestVisit(s: GeotabVehicleSnapshot, profileId: string | undefined, visits: FleetVisitPin[], speedMph: number | null): FleetNearestVisit | null {
  if (!profileId) return null;
  const candidates = visits.filter((v) => v.assigneeIds.includes(profileId));
  let best: { v: FleetVisitPin; d: number } | null = null;
  for (const v of candidates) {
    const d = haversineMeters({ lat: s.latitude, lng: s.longitude }, { lat: v.latitude, lng: v.longitude });
    if (!best || d < best.d) best = { v, d };
  }
  if (!best) return null;
  const arrived = isArrived({ status: s.status, lat: s.latitude, lng: s.longitude }, { lat: best.v.latitude, lng: best.v.longitude });
  return {
    jobId: best.v.jobId,
    title: best.v.title,
    customerName: best.v.customerName,
    address: best.v.address,
    distanceMeters: Math.round(best.d),
    distanceLabel: formatDistance(best.d),
    etaMinutes: arrived ? 0 : etaMinutes(best.d, speedMph),
    kind: arrived ? "onsite" : "enroute",
  };
}
