import { JOB_KIND_LABEL, PROJECT_TYPES, PROJECT_TYPE_LABEL, type ProjectType } from "@/lib/types";
import type { FleetStatus, FleetVehicle, FleetVisitPin } from "@/lib/geotab/types";

export type JobFilterKey = ProjectType | "warranty" | "service";
export type VehicleFilterKey = Extract<FleetStatus, "driving" | "stopped">;

export const JOB_FILTER_ORDER: JobFilterKey[] = [...PROJECT_TYPES, "warranty", "service"];
export const VEHICLE_FILTER_ORDER: VehicleFilterKey[] = ["driving", "stopped"];

export const JOB_FILTER_LABEL: Record<JobFilterKey, string> = {
  ...PROJECT_TYPE_LABEL,
  warranty: JOB_KIND_LABEL.warranty,
  service: JOB_KIND_LABEL.service,
};

export const VEHICLE_FILTER_LABEL: Record<VehicleFilterKey, string> = {
  driving: "Driving",
  stopped: "Stopped",
};

const JOB_KEYS = new Set<string>(JOB_FILTER_ORDER);
const VEHICLE_KEYS = new Set<string>(VEHICLE_FILTER_ORDER);

function parseList<T extends string>(raw: string | null, allowed: Set<string>): T[] {
  if (!raw) return [];
  const out: T[] = [];
  for (const part of raw.split(",")) {
    const k = part.trim();
    if (k && allowed.has(k) && !out.includes(k as T)) out.push(k as T);
  }
  return out;
}

export function parseFilterQuery(sp: { get(name: string): string | null }): { types: JobFilterKey[]; vehicles: VehicleFilterKey[] } {
  return {
    types: parseList<JobFilterKey>(sp.get("types"), JOB_KEYS),
    vehicles: parseList<VehicleFilterKey>(sp.get("vehicles"), VEHICLE_KEYS),
  };
}

export function serializeFilterQuery(types: JobFilterKey[], vehicles: VehicleFilterKey[]): string {
  const parts: string[] = [];
  if (types.length) parts.push(`types=${types.join(",")}`);
  if (vehicles.length) parts.push(`vehicles=${vehicles.join(",")}`);
  return parts.join("&");
}

export function visitMatchesFilters(v: FleetVisitPin, types: JobFilterKey[]): boolean {
  if (!types.length) return true;
  return types.some((key) => (key === "warranty" || key === "service" ? v.kind === key : v.projectType === key));
}

export function vehicleMatchesFilters(v: FleetVehicle, vehicles: VehicleFilterKey[]): boolean {
  if (!vehicles.length) return true;
  return vehicles.includes(v.status as VehicleFilterKey);
}

export function jobFilterCounts(visits: FleetVisitPin[]): Record<JobFilterKey, number> {
  const counts = Object.fromEntries(JOB_FILTER_ORDER.map((k) => [k, 0])) as Record<JobFilterKey, number>;
  for (const v of visits) {
    counts[v.projectType] += 1;
    if (v.kind === "warranty" || v.kind === "service") counts[v.kind] += 1;
  }
  return counts;
}

export function vehicleFilterCounts(vehicles: FleetVehicle[]): Record<VehicleFilterKey, number> {
  return {
    driving: vehicles.filter((v) => v.status === "driving").length,
    stopped: vehicles.filter((v) => v.status === "stopped").length,
  };
}

export function visibleJobFilters(counts: Record<JobFilterKey, number>): JobFilterKey[] {
  return JOB_FILTER_ORDER.filter((k) => counts[k] > 0);
}

export function toggleFilter<T extends string>(current: T[], key: T): T[] {
  return current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
}
