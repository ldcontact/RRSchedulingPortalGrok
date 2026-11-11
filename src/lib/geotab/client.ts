import "server-only";
import { entityId, mergeDeviceSnapshots } from "./parse";
import { geotabEnv, GeotabRpc } from "./rpc";
import type { GeotabVehicleSnapshot } from "./types";

let rpc: GeotabRpc | null = null;

export function geotabConfigured(): boolean {
  return geotabEnv() != null;
}

function client(): GeotabRpc {
  const env = geotabEnv();
  if (!env) throw new Error("Geotab is not configured");
  if (!rpc || rpc.credentials?.database !== env.database || rpc.credentials?.userName !== env.userName) {
    rpc = new GeotabRpc(env);
  }
  return rpc;
}

export async function fetchGeotabSnapshots(): Promise<GeotabVehicleSnapshot[]> {
  const api = client();
  const [devices, statuses] = await Promise.all([api.getDevices(), api.getDeviceStatusInfo()]);
  const driverIds = statuses.map((s) => entityId((s as { driver?: unknown }).driver)).filter((id): id is string => !!id);
  const users = await api.getUsersByIds(driverIds).catch(() => [] as unknown[]);
  const drivers: Record<string, string> = {};
  for (const u of users) {
    if (!u || typeof u !== "object") continue;
    const o = u as { id?: string; name?: string; firstName?: string; lastName?: string };
    const id = o.id;
    if (!id) continue;
    const name = o.name || [o.firstName, o.lastName].filter(Boolean).join(" ");
    if (name) drivers[id] = name;
  }
  return mergeDeviceSnapshots(devices, statuses, drivers);
}

/** Test helper: drop the cached session (does not print or return it). */
export function resetGeotabSession() {
  rpc = null;
}
