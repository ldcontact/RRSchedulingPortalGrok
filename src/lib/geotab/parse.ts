import { kmhToMph } from "./distance";
import type { FleetStatus, GeotabVehicleSnapshot } from "./types";

type Dict = Record<string, unknown>;
const obj = (v: unknown): Dict => (v && typeof v === "object" ? (v as Dict) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
};

export function entityId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  const o = obj(value);
  return str(o.id) ?? str(o.Id);
}

export function parseDurationLabel(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  // Geotab TimeSpan often looks like "00:36:12.0000000" or "1.02:15:00"
  const m = s.match(/^(?:(\d+)\.)?(\d+):(\d+):(\d+)/);
  if (!m) return s;
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2]) + days * 24;
  const minutes = Number(m[3]);
  if (hours >= 1) return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
  if (minutes >= 1) return `${minutes} min`;
  return "just now";
}

export function vehicleStatus(info: Dict): FleetStatus {
  if (info.isDeviceCommunicating === false) return "offline";
  if (info.isDriving === true) return "driving";
  return "stopped";
}

/** Join Device records with DeviceStatusInfo (status.device is often just { id }). */
export function mergeDeviceSnapshots(devices: unknown[], statuses: unknown[], drivers: Record<string, string> = {}): GeotabVehicleSnapshot[] {
  const names = new Map<string, string>();
  for (const d of devices) {
    const o = obj(d);
    const id = entityId(o);
    if (id) names.set(id, str(o.name) ?? str(o.Name) ?? id);
  }
  const byId = new Map<string, GeotabVehicleSnapshot>();
  for (const s of statuses) {
    const o = obj(s);
    const id = entityId(o.device) ?? entityId(o);
    if (!id) continue;
    const lat = num(o.latitude);
    const lng = num(o.longitude);
    if (lat == null || lng == null) continue;
    const driverId = entityId(o.driver);
    const speed = num(o.speed);
    const status = vehicleStatus(o);
    byId.set(id, {
      id,
      name: names.get(id) ?? id,
      status,
      speedKmh: status === "driving" ? speed : speed && speed > 0 ? speed : 0,
      latitude: lat,
      longitude: lng,
      heading: num(o.bearing) ?? num(o.heading),
      lastUpdate: str(o.dateTime),
      isDeviceCommunicating: o.isDeviceCommunicating !== false,
      currentStateDuration: str(o.currentStateDuration),
      geotabDriverName: (driverId && drivers[driverId]) || str(obj(o.driver).name) || str(obj(o.driver).firstName) || null,
    });
  }
  // Devices with no status yet still appear if we have a name-only record? Skip — no position.
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function snapshotSpeedMph(v: GeotabVehicleSnapshot): number | null {
  if (v.status !== "driving" || v.speedKmh == null || Number.isNaN(v.speedKmh)) return null;
  return Math.round(kmhToMph(v.speedKmh));
}

/** LoginResult.path is "ThisServer" or a hostname to follow. */
export function resolveGeotabServer(current: string, path: unknown): string {
  const p = str(path);
  if (!p || p === "ThisServer") return current;
  return p.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export function isInvalidUserError(err: unknown): boolean {
  const o = obj(err);
  const data = obj(o.data);
  const name = str(o.name) ?? str(o.type) ?? str(data.type) ?? str(data.name) ?? "";
  const msg = (str(o.message) ?? str(o.error) ?? "").toLowerCase();
  return name.includes("InvalidUser") || msg.includes("invalid user") || msg.includes("incorrect login") || msg.includes("invalid session");
}
