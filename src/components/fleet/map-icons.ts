import type { FleetStatus } from "@/lib/geotab/types";
import { PROJECT_TYPE_COLOR } from "@/lib/project-type";
import type { JobKind, ProjectType } from "@/lib/types";

/** Map vehicle fills: green when driving, red when stopped, muted slate when offline. */
export const VEHICLE_FILL: Record<FleetStatus, string> = {
  driving: "#16a34a",
  stopped: "#dc2626",
  offline: "#94a3b8",
};

export const JOB_SITE_FILL = "#d97706";

/** House-pin fills by project type. Lighting keeps the original orange. */
export const JOB_SITE_FILL_BY_TYPE: Record<ProjectType, string> = PROJECT_TYPE_COLOR;

export function jobSiteFill(type?: ProjectType | null): string {
  return (type && JOB_SITE_FILL_BY_TYPE[type]) || JOB_SITE_FILL;
}

/** Shared list-dot / legend fill for a vehicle status. Offline is slightly muted. */
export function vehicleStatusDotStyle(status: FleetStatus): { backgroundColor: string; opacity?: number } {
  return status === "offline"
    ? { backgroundColor: VEHICLE_FILL.offline, opacity: 0.75 }
    : { backgroundColor: VEHICLE_FILL[status] };
}

export const VEHICLE_ICON_SIZE = 28;
export const VEHICLE_ICON_SIZE_SELECTED = 34;
export const CLUSTER_ICON_SIZE = 32;
export const JOB_SITE_ICON_SIZE: [number, number] = [28, 36];
export const JOB_SITE_ICON_SIZE_SELECTED: [number, number] = [34, 44];
export const JOB_SITE_ICON_ANCHOR: [number, number] = [14, 34];
export const JOB_SITE_ICON_ANCHOR_SELECTED: [number, number] = [17, 42];

export function hasHeading(heading: number | null | undefined): heading is number {
  return typeof heading === "number" && Number.isFinite(heading);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function vehicleSvg(color: string, size: number, defs = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true">
  ${defs}<path d="M12 5h8c1.4 0 2.5 1 2.8 2.3L24 10.5V13h1.2c.4 0 .8.3.8.8v2.4c0 .5-.4.8-.8.8H24v8.2c0 1.3-1 2.3-2.3 2.3H10.3C9 27.5 8 26.5 8 25.2V17H6.8c-.4 0-.8-.3-.8-.8v-2.4c0-.5.4-.8.8-.8H8v-2.5l1.2-3.2C9.5 6 10.6 5 12 5z" fill="${color}" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
  <rect x="11.2" y="7.2" width="9.6" height="4.2" rx="1.1" fill="#fff"/>
  <rect x="11.5" y="20.8" width="9" height="2.4" rx="0.8" fill="#fff" opacity=".55"/>
</svg>`;
}

function jobSiteSvg(fill: string, kind?: JobKind | null, size: [number, number] = JOB_SITE_ICON_SIZE): string {
  const badge = kind === "warranty" || kind === "service"
    ? `<circle cx="22.5" cy="7.5" r="5.6" fill="${kind === "warranty" ? "#b45309" : "#c2410c"}" stroke="#fff" stroke-width="1.4"/><text x="22.5" y="10.2" text-anchor="middle" font-size="8" font-weight="700" font-family="system-ui,sans-serif" fill="#fff">${kind === "warranty" ? "W" : "S"}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 36" width="${size[0]}" height="${size[1]}" aria-hidden="true">
  <path d="M14 1.5c-6.2 0-11 4.9-11 11.2 0 8.2 11 21.3 11 21.3s11-13.1 11-21.3C25 6.4 20.2 1.5 14 1.5z" fill="${fill}" stroke="#fff" stroke-width="1.8"/>
  <path d="M14 9.2 20 14v7.2h-3.2v-3.8h-3.6v3.8H10V14z" fill="#fff"/>
  ${badge}
</svg>`;
}

function labelHtml(label: string | null | undefined): string {
  if (!label) return "";
  return `<span class="fleet-vehicle-label">${escapeHtml(label)}</span>`;
}

export function vehicleIconHtml(status: FleetStatus, opts: { heading?: number | null; selected?: boolean; label?: string | null } = {}): string {
  const selected = !!opts.selected;
  const size = selected ? VEHICLE_ICON_SIZE_SELECTED : VEHICLE_ICON_SIZE;
  const color = VEHICLE_FILL[status];
  const svg = vehicleSvg(color, size);
  const rotate = hasHeading(opts.heading) ? `transform:rotate(${opts.heading}deg);transform-origin:center center;` : "";
  const muted = status === "offline" ? "opacity:.75;" : "";
  const ring = selected
    ? `box-shadow:0 0 0 2px #fff,0 0 0 4px ${color};border-radius:999px;`
    : "filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));";
  return `<div class="fleet-vehicle-icon${selected ? " is-selected" : ""}${status === "offline" ? " is-offline" : ""}" style="position:relative;width:${size}px;height:${size}px;line-height:0;${ring}${muted}"><div style="width:${size}px;height:${size}px;line-height:0;${rotate}">${svg}</div>${labelHtml(opts.label)}</div>`;
}

export function clusterIconHtml(opts: { count: number; fill: string; split?: boolean; id?: string; selected?: boolean }): string {
  const size = CLUSTER_ICON_SIZE;
  const id = (opts.id ?? "x").replace(/[^a-zA-Z0-9_-]/g, "");
  const defs = opts.split
    ? `<defs><linearGradient id="fleet-mix-${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="50%" stop-color="${VEHICLE_FILL.driving}"/><stop offset="50%" stop-color="${VEHICLE_FILL.stopped}"/></linearGradient></defs>`
    : "";
  const color = opts.split ? `url(#fleet-mix-${id})` : opts.fill;
  const ring = opts.selected
    ? `box-shadow:0 0 0 2px #fff,0 0 0 4px ${opts.split ? VEHICLE_FILL.driving : opts.fill};border-radius:999px;`
    : "filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));";
  return `<div class="fleet-cluster-icon${opts.selected ? " is-selected" : ""}" data-testid="fleet-cluster" data-count="${opts.count}" style="position:relative;width:${size}px;height:${size}px;line-height:0;${ring}">${vehicleSvg(color, size, defs)}<span class="fleet-cluster-count">${opts.count}</span></div>`;
}

export function jobSiteIconHtml(opts: { type?: ProjectType | null; kind?: JobKind | null; selected?: boolean } = {}): string {
  const fill = jobSiteFill(opts.type);
  const size = jobSiteIconSize(!!opts.selected);
  const ring = opts.selected
    ? `box-shadow:0 0 0 2px #fff,0 0 0 4px ${fill};border-radius:16px;`
    : "filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));";
  return `<div class="fleet-jobsite-icon${opts.selected ? " is-selected" : ""}" data-testid="fleet-jobsite" data-type="${opts.type ?? ""}" data-kind="${opts.kind ?? "install"}" style="line-height:0;width:${size[0]}px;height:${size[1]}px;${ring}">${jobSiteSvg(fill, opts.kind, size)}</div>`;
}

export function jobSiteIconSize(selected = false): [number, number] {
  return selected ? JOB_SITE_ICON_SIZE_SELECTED : JOB_SITE_ICON_SIZE;
}

export function jobSiteIconAnchor(selected = false): [number, number] {
  return selected ? JOB_SITE_ICON_ANCHOR_SELECTED : JOB_SITE_ICON_ANCHOR;
}

export function vehicleIconSize(selected = false): [number, number] {
  const n = selected ? VEHICLE_ICON_SIZE_SELECTED : VEHICLE_ICON_SIZE;
  return [n, n];
}

export function vehicleIconAnchor(selected = false): [number, number] {
  const n = selected ? VEHICLE_ICON_SIZE_SELECTED : VEHICLE_ICON_SIZE;
  return [n / 2, n / 2];
}

export function clusterIconSize(): [number, number] {
  return [CLUSTER_ICON_SIZE, CLUSTER_ICON_SIZE];
}

export function clusterIconAnchor(): [number, number] {
  return [CLUSTER_ICON_SIZE / 2, CLUSTER_ICON_SIZE / 2];
}
