import type { FleetVisitPin, GeotabVehicleSnapshot } from "./types";

/** Fictional Schaumburg-area positions used when Geotab env vars are missing. */
export const SAMPLE_AS_OF = "2026-11-11T16:18:00.000Z";

export const SAMPLE_VEHICLES: GeotabVehicleSnapshot[] = [
  { id: "gt-t1", name: "Truck 1 – Ford Transit", status: "driving", speedKmh: 45, latitude: 42.03049599978025, longitude: -87.97069430757468, heading: 120, lastUpdate: "2026-11-11T16:17:00.000Z", isDeviceCommunicating: true, currentStateDuration: null, geotabDriverName: null },
  { id: "gt-t2", name: "Truck 2", status: "stopped", speedKmh: 0, latitude: 42.048784365992496, longitude: -88.10151315934525, heading: 80, lastUpdate: "2026-11-11T15:42:00.000Z", isDeviceCommunicating: true, currentStateDuration: "00:36:00", geotabDriverName: null },
  { id: "gt-v3", name: "Van 3", status: "driving", speedKmh: 30.6, latitude: 42.04846222328007, longitude: -87.98521257396133, heading: 50, lastUpdate: "2026-11-11T16:17:00.000Z", isDeviceCommunicating: true, currentStateDuration: null, geotabDriverName: null },
  { id: "gt-car", name: "Car – Luke", status: "stopped", speedKmh: 0, latitude: 42.0298, longitude: -88.0875, heading: 0, lastUpdate: "2026-11-11T16:15:00.000Z", isDeviceCommunicating: true, currentStateDuration: "01:12:00", geotabDriverName: null },
  { id: "gt-t4", name: "Truck 4", status: "offline", speedKmh: 0, latitude: 42.005, longitude: -88.078, heading: 0, lastUpdate: "2026-11-11T13:02:00.000Z", isDeviceCommunicating: false, currentStateDuration: null, geotabDriverName: null },
  { id: "gt-v5", name: "Van 5", status: "driving", speedKmh: 58, latitude: 42.0305, longitude: -88.0866, heading: 95, lastUpdate: "2026-11-11T16:16:00.000Z", isDeviceCommunicating: true, currentStateDuration: null, geotabDriverName: null },
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
 * Fallback visit pins (Census-matched customer coords) used in Geotab sample mode
 * only when a job has no stored lat/lng.
 */
export const SAMPLE_VISIT_COORDS: Record<string, { lat: number; lng: number }> = {
  j3: { lat: 42.048335210405, lng: -88.100787329604 }, // Golf Road Auto Body (Census)
  j2: { lat: 42.05564871268, lng: -87.999730840348 },  // Lakeview Family Dental (Census)
  j8: { lat: 42.048335210405, lng: -88.100787329604 }, // Golf Road, afternoon punch
};

export function sampleVisitPins(jobs: { id: string; title: string; customer_name: string; address: string | null; starts_at: string; ends_at: string; assignees: { id: string }[] }[]): FleetVisitPin[] {
  return jobs.flatMap((j) => {
    const c = SAMPLE_VISIT_COORDS[j.id];
    if (!c) return [];
    return [{
      jobId: j.id, title: j.title, customerName: j.customer_name, address: j.address,
      startsAt: j.starts_at, endsAt: j.ends_at, latitude: c.lat, longitude: c.lng,
      assigneeIds: j.assignees.map((a) => a.id),
      projectId: null, projectName: null, projectType: "lighting", kind: "install", status: "scheduled",
      assignees: j.assignees.map((a) => ({ id: a.id, full_name: a.id, color: "#64748b" })),
    }];
  });
}
