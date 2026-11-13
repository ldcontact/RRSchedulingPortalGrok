import { buildNearestVisit } from "./next-visit";
import { fetchDrivingRoute, mapPool, ROUTE_CONCURRENCY } from "./route";
import type { FleetVehicle, FleetVisitPin } from "./types";

/** Fill driving distance, time, and route geometry for en-route trucks. On-site visits are left alone. */
export async function attachDrivingRoutes(vehicles: FleetVehicle[], visits: FleetVisitPin[], asOf: string): Promise<FleetVehicle[]> {
  const pins = new Map(visits.map((v) => [v.jobId, v]));
  const jobs = vehicles.map((v, index) => ({ v, index, pin: v.nearestVisit ? pins.get(v.nearestVisit.jobId) : undefined }))
    .filter((row) => row.v.nearestVisit?.kind === "enroute" && row.pin);
  if (!jobs.length) return vehicles;

  const routes = await mapPool(jobs, ROUTE_CONCURRENCY, async ({ v, pin }) => {
    return fetchDrivingRoute(
      { lat: v.latitude, lng: v.longitude },
      { lat: pin!.latitude, lng: pin!.longitude },
      v.speedMph,
      pin!.jobId,
    );
  });

  const next = vehicles.slice();
  jobs.forEach((row, i) => {
    const driving = routes[i];
    const visit = row.pin!;
    next[row.index] = {
      ...row.v,
      nearestVisit: buildNearestVisit({
        visit,
        vehicle: {
          status: row.v.status,
          lat: row.v.latitude,
          lng: row.v.longitude,
          lastUpdate: row.v.lastUpdate,
          currentStateDuration: durationFromVehicle(row.v),
        },
        asOf,
        speedMph: row.v.speedMph,
        driving,
      }),
    };
  });
  return next;
}

function durationFromVehicle(v: FleetVehicle): string | null {
  // Stopped duration isn't stored once assembled except as a label; en-route trucks don't need it.
  return v.stoppedForLabel;
}
