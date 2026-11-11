import type { FleetStatus, FleetVehicle } from "@/lib/geotab/types";

export const STATUS_LABEL: Record<FleetStatus, string> = { driving: "Driving", stopped: "Stopped", offline: "Offline" };
export const STATUS_PILL: Record<FleetStatus, string> = {
  driving: "bg-teal-50 text-teal-800",
  stopped: "bg-violet-50 text-violet-800",
  offline: "bg-slate-100 text-slate-600",
};

export function vehicleTitle(v: FleetVehicle) {
  return v.label || v.name;
}

export function driverLabel(v: FleetVehicle) {
  return v.profile?.full_name ?? v.geotabDriverName ?? "Unassigned";
}

export function statusDetail(v: FleetVehicle) {
  if (v.status === "driving" && v.speedMph != null) return `${v.speedMph} mph`;
  if (v.status === "stopped" && v.stoppedForLabel) return `Stopped ${v.stoppedForLabel}`;
  if (v.status === "offline") return "Last seen";
  return STATUS_LABEL[v.status];
}
