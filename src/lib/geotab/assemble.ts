import { buildNearestVisit, pickNextVisitToday } from "./next-visit";
import { parkedSinceIso, parseDurationLabel, snapshotSpeedMph } from "./parse";
import { sampleVisitPins } from "./sample";
import type { FleetLocationsResponse, FleetMapping, FleetNearestVisit, FleetPerson, FleetVehicle, FleetVisitPin, GeotabVehicleSnapshot } from "./types";

export type AssembleInput = {
  sample: boolean;
  asOf: string;
  snapshots: GeotabVehicleSnapshot[];
  mappings: FleetMapping[];
  people: FleetPerson[];
  jobs: {
    id: string; title: string; customer_name: string; address: string | null; starts_at: string; ends_at: string;
    assignees: { id: string; full_name?: string; color?: string; avatar_url?: string | null }[];
    latitude?: number | null; longitude?: number | null;
    project_id?: string | null; project_name?: string | null; project_type?: import("@/lib/types").ProjectType;
    kind?: import("@/lib/types").JobKind; status?: import("@/lib/types").JobStatus;
  }[];
  scope: "all" | "own";
  viewerId: string;
};

export function assembleLocations(input: AssembleInput): FleetLocationsResponse {
  const peopleById = new Map(input.people.map((p) => [p.id, p]));
  const mapByDevice = new Map(input.mappings.map((m) => [m.geotab_device_id, m]));
  const visits: FleetVisitPin[] = visitPinsFromJobs(input.jobs, input.sample);
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
      parkedSince: s.status === "stopped" ? parkedSinceIso(s.lastUpdate, s.currentStateDuration) : null,
      geotabDriverName: s.geotabDriverName,
      profile,
      nearestVisit: nextVisitFor(s, profile?.id, visits, speedMph, input.asOf),
    };
  });

  return { sample: input.sample, asOf: input.asOf, geocoding: "census", vehicles, visits };
}

function visitMeta(j: AssembleInput["jobs"][number]): Pick<FleetVisitPin, "projectId" | "projectName" | "projectType" | "kind" | "status" | "assignees" | "assigneeIds"> {
  const assignees = j.assignees.map((a) => ({
    id: a.id,
    full_name: a.full_name || a.id,
    color: a.color || "#64748b",
    avatar_url: a.avatar_url ?? null,
  }));
  return {
    projectId: j.project_id ?? null,
    projectName: j.project_name ?? null,
    projectType: j.project_type ?? "lighting",
    kind: j.kind ?? "install",
    status: j.status ?? "scheduled",
    assignees,
    assigneeIds: assignees.map((a) => a.id),
  };
}

export function visitPinsFromJobs(jobs: AssembleInput["jobs"], sample: boolean): FleetVisitPin[] {
  return jobs.flatMap((j) => {
    const meta = visitMeta(j);
    if (j.latitude != null && j.longitude != null) {
      return [{
        jobId: j.id, title: j.title, customerName: j.customer_name, address: j.address,
        startsAt: j.starts_at, endsAt: j.ends_at, latitude: j.latitude, longitude: j.longitude,
        ...meta,
      }];
    }
    return sample ? sampleVisitPins([j]).map((pin) => ({ ...pin, ...meta })) : [];
  });
}

function nextVisitFor(s: GeotabVehicleSnapshot, profileId: string | undefined, visits: FleetVisitPin[], speedMph: number | null, asOf: string): FleetNearestVisit | null {
  if (!profileId) return null;
  const visit = pickNextVisitToday(visits, profileId, { status: s.status, lat: s.latitude, lng: s.longitude }, asOf);
  if (!visit) return null;
  return buildNearestVisit({
    visit,
    vehicle: { status: s.status, lat: s.latitude, lng: s.longitude, lastUpdate: s.lastUpdate, currentStateDuration: s.currentStateDuration },
    asOf,
    speedMph,
  });
}
