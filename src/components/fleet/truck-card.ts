import { TZ } from "@/lib/time";
import { formatDriveMinutes } from "@/lib/geotab/next-visit";
import type { FleetVehicle } from "@/lib/geotab/types";
import { driverLabel, statusDetail, STATUS_LABEL, vehicleTitle } from "./status";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function scheduledLabel(iso: string) {
  const t = new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  return `Scheduled ${t}`;
}

/** Rich hover/tap card for a truck marker. */
export function truckCardHtml(v: FleetVehicle): string {
  const who = driverLabel(v);
  const visit = v.nearestVisit;
  const parts: string[] = [];
  parts.push(`<div class="font-semibold" style="font:600 13px/1.3 system-ui,sans-serif;color:#1c2423">${esc(who)}</div>`);
  parts.push(`<div style="font:12px/1.35 system-ui,sans-serif;color:#5b6663;margin-top:1px">${esc(vehicleTitle(v))} · ${esc(STATUS_LABEL[v.status])}</div>`);
  if (!v.profile) {
    parts.push(`<div data-testid="fleet-unmapped" style="margin-top:8px;font:12.5px/1.4 system-ui,sans-serif;color:#9a3412">No tech mapped to this truck</div>`);
    parts.push(`<div style="margin-top:2px;font:12px/1.35 system-ui,sans-serif;color:#5b6663">${esc(statusDetail(v))}</div>`);
  } else if (visit?.kind === "onsite") {
    parts.push(`<div style="margin-top:8px;font:600 13px/1.35 system-ui,sans-serif;color:#1c2423">${esc(visit.customerName)}</div>`);
    if (visit.address) parts.push(`<div style="font:12px/1.35 system-ui,sans-serif;color:#5b6663">${esc(visit.address)}</div>`);
    parts.push(`<div data-testid="fleet-onsite" style="margin-top:6px;font:600 12.5px/1.4 system-ui,sans-serif;color:#0f766e">${esc(visit.onSiteSinceLabel || "On site")}</div>`);
  } else if (visit) {
    parts.push(`<div style="margin-top:8px;font:11px/1.3 system-ui,sans-serif;font-weight:600;color:#5b6663;text-transform:uppercase;letter-spacing:.02em">Next visit today</div>`);
    parts.push(`<div style="font:600 13px/1.35 system-ui,sans-serif;color:#1c2423">${esc(visit.customerName)}</div>`);
    if (visit.address) parts.push(`<div style="font:12px/1.35 system-ui,sans-serif;color:#5b6663">${esc(visit.address)}</div>`);
    parts.push(`<div style="font:12px/1.35 system-ui,sans-serif;color:#5b6663">${esc(scheduledLabel(visit.startsAt))}</div>`);
    const drive = `${visit.drivingDistanceLabel} · ${visit.etaMinutes != null ? formatDriveMinutes(visit.etaMinutes) : "—"}`;
    const estimated = visit.driveSource === "straight-line" ? " (estimated)" : "";
    parts.push(`<div data-testid="fleet-drive" style="margin-top:6px;font:600 12.5px/1.4 system-ui,sans-serif;color:#1c2423">${esc(drive)}${estimated}</div>`);
    parts.push(`<div style="font:11px/1.35 system-ui,sans-serif;color:#5b6663">${esc(visit.straightLineLabel)} straight-line</div>`);
    if (visit.etaSummary) {
      const color = visit.late ? "#b42318" : "#0f766e";
      parts.push(`<div data-testid="fleet-eta" data-late="${visit.late ? "1" : "0"}" style="margin-top:4px;font:600 12.5px/1.4 system-ui,sans-serif;color:${color}">${esc(visit.etaSummary)}</div>`);
    }
  } else {
    parts.push(`<div style="margin-top:8px;font:12.5px/1.4 system-ui,sans-serif;color:#5b6663">${esc(statusDetail(v))}</div>`);
  }
  return `<div class="fleet-truck-card" data-testid="fleet-truck-card" data-vehicle="${esc(v.id)}">${parts.join("")}</div>`;
}

export function unmappedVehicleNames(vehicles: FleetVehicle[]): string[] {
  return vehicles.filter((v) => !v.profile).map((v) => v.label || v.name);
}
