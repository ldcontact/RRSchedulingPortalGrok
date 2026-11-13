import { fmtDateTime, fmtMonthDay } from "@/lib/time";
import type { FleetVehicle } from "@/lib/geotab/types";

export const STATUS_LABEL: Record<FleetVehicle["status"], string> = {
  driving: "Driving",
  stopped: "Stopped",
  offline: "Offline",
};

export const STATUS_PILL: Record<FleetVehicle["status"], string> = {
  driving: "bg-teal-50 text-teal-800",
  stopped: "bg-violet-50 text-violet-800",
  offline: "bg-slate-100 text-slate-600",
};

export function vehicleTitle(v: FleetVehicle) {
  return v.label || v.name;
}

export function driverLabel(v: FleetVehicle) {
  if (v.profile) return v.profile.invited ? `${v.profile.full_name} (invited)` : v.profile.full_name;
  return v.geotabDriverName ?? "Unassigned";
}

const CREW_STATUS_ORDER: Record<FleetVehicle["status"], number> = { driving: 0, stopped: 1, offline: 2 };

/** Trucks with a profile or invite mapping, driving first, then by driver name. */
export function mappedCrewVehicles(vehicles: FleetVehicle[]): FleetVehicle[] {
  return vehicles
    .filter((v) => !!v.profile)
    .slice()
    .sort((a, b) => {
      const byStatus = CREW_STATUS_ORDER[a.status] - CREW_STATUS_ORDER[b.status];
      if (byStatus) return byStatus;
      return driverLabel(a).localeCompare(driverLabel(b), "en");
    });
}

export function statusDetail(v: FleetVehicle) {
  if (v.status === "driving" && v.speedMph != null) return `${v.speedMph} mph`;
  if (v.status === "stopped" && v.parkedSince) return `Parked since ${fmtDateTime(v.parkedSince)}`;
  if (v.status === "stopped" && v.stoppedForLabel) return `Stopped ${v.stoppedForLabel}`;
  if (v.status === "offline") {
    return v.lastUpdate ? `Offline · last seen ${fmtMonthDay(v.lastUpdate)}` : "Offline";
  }
  return STATUS_LABEL[v.status];
}
