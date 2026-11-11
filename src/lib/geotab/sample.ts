import type { FleetVisitPin, GeotabVehicleSnapshot } from "./types";

/** Fictional Schaumburg-area positions used when Geotab env vars are missing. */
export const SAMPLE_AS_OF = "2026-11-11T16:18:00.000Z";

export const SAMPLE_VEHICLES: GeotabVehicleSnapshot[] = [
  { id: "gt-t1", name: "Truck 1 – Ford Transit", status: "driving", speedKmh: 45, latitude: 42.022, longitude: -88.008, heading: 120, lastUpdate: "2026-11-11T16:17:00.000Z", isDeviceCommunicating: true, currentStateDuration: null, geotabDriverName: null },
  { id: "gt-t2", name: "Truck 2", status: "stopped", speedKmh: 0, latitude: 42.05516, longitude: -88.08235, heading: 80, lastUpdate: "2026-11-11T15:42:00.000Z", isDeviceCommunicating: true, currentStateDuration: "00:36:00", geotabDriverName: null },
  { id: "gt-v3", name: "Van 3", status: "driving", speedKmh: 30.6, latitude: 42.079, longitude: -87.992, heading: 50, lastUpdate: "2026-11-11T16:17:00.000Z", isDeviceCommunicating: true, currentStateDuration: null, geotabDriverName: null },
  { id: "gt-car", name: "Car – Luke", status: "stopped", speedKmh: 0, latitude: 42.0298, longitude: -88.0875, heading: 0, lastUpdate: "2026-11-11T16:15:00.000Z", isDeviceCommunicating: true, currentStateDuration: "01:12:00", geotabDriverName: null },
  { id: "gt-t4", name: "Truck 4", status: "offline", speedKmh: 0, latitude: 42.005, longitude: -88.078, heading: 0, lastUpdate: "2026-11-11T13:02:00.000Z", isDeviceCommunicating: false, currentStateDuration: null, geotabDriverName: null },
  { id: "gt-v5", name: "Van 5", status: "driving", speedKmh: 58, latitude: 41.992, longitude: -87.912, heading: 95, lastUpdate: "2026-11-11T16:16:00.000Z", isDeviceCommunicating: true, currentStateDuration: null, geotabDriverName: null },
];

/** Default device → profile links for DEV MOCK MODE (overridable via fleet_vehicles). */
export const SAMPLE_DEFAULT_MAP: { geotab_device_id: string; label: string | null; profile_id: string }[] = [
  { geotab_device_id: "gt-t1", label: null, profile_id: "u-tech1" },   // Carlos
  { geotab_device_id: "gt-t2", label: null, profile_id: "u-tech4" },   // Emily — on site at Golf Road today
  { geotab_device_id: "gt-v3", label: null, profile_id: "u-tech2" },   // Jake
  { geotab_device_id: "gt-car", label: null, profile_id: "u-admin" },  // Luke
  { geotab_device_id: "gt-t4", label: null, profile_id: "u-tech3" },   // Andre (offline)
];

/**
 * Sample visit pins keyed by mock job id. Live data cannot pin visits: jobs/customers
 * store address text only, no lat/lng columns.
 */
export const SAMPLE_VISIT_COORDS: Record<string, { lat: number; lng: number }> = {
  j3: { lat: 42.0548, lng: -88.0815 }, // Golf Road Auto Body — High bays
  j2: { lat: 42.0884, lng: -87.9806 }, // Lakeview Family Dental
  j8: { lat: 42.0535, lng: -88.079 },  // Golf Road, afternoon punch
};

export function sampleVisitPins(jobs: { id: string; title: string; customer_name: string; address: string | null; starts_at: string; ends_at: string; assignees: { id: string }[] }[]): FleetVisitPin[] {
  return jobs.flatMap((j) => {
    const c = SAMPLE_VISIT_COORDS[j.id];
    if (!c) return [];
    return [{
      jobId: j.id, title: j.title, customerName: j.customer_name, address: j.address,
      startsAt: j.starts_at, endsAt: j.ends_at, latitude: c.lat, longitude: c.lng,
      assigneeIds: j.assignees.map((a) => a.id),
    }];
  });
}
