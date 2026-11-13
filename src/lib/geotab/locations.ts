import "server-only";
import { geotabConfigured, fetchGeotabSnapshots } from "./client";
import { assembleLocations, type AssembleInput } from "./assemble";
import { stampSampleSnapshots } from "./sample";
import { attachDrivingRoutes } from "./route-attach";
import type { FleetLocationsResponse, GeotabVehicleSnapshot } from "./types";

const TTL_MS = 30_000;
let cache: { at: number; snapshots: GeotabVehicleSnapshot[] } | null = null;

export async function loadFleetSnapshots(): Promise<{ sample: boolean; asOf: string; snapshots: GeotabVehicleSnapshot[] }> {
  if (!geotabConfigured()) {
    const sample = stampSampleSnapshots();
    return { sample: true, asOf: sample.asOf, snapshots: sample.snapshots };
  }
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { sample: false, asOf: new Date(cache.at).toISOString(), snapshots: cache.snapshots };
  }
  const snapshots = await fetchGeotabSnapshots();
  cache = { at: Date.now(), snapshots };
  return { sample: false, asOf: new Date().toISOString(), snapshots };
}

export async function buildFleetLocations(input: Omit<AssembleInput, "sample" | "asOf" | "snapshots">): Promise<FleetLocationsResponse> {
  const { sample, asOf, snapshots } = await loadFleetSnapshots();
  const assembled = assembleLocations({ ...input, sample, asOf, snapshots });
  return { ...assembled, vehicles: await attachDrivingRoutes(assembled.vehicles, assembled.visits, asOf) };
}

/** Test helper. */
export function clearFleetSnapshotCache() {
  cache = null;
}
