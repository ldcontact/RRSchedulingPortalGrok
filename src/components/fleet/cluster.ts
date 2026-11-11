import type { FleetStatus } from "@/lib/geotab/types";
import { VEHICLE_FILL } from "./map-icons";

/** Pixel radius at the current zoom within which vehicles collapse into one marker. */
export const CLUSTER_RADIUS_PX = 36;

export type ProjectPoint = (lat: number, lng: number) => { x: number; y: number } | null;

export type ClusterGroup<T> = {
  members: T[];
  latitude: number;
  longitude: number;
};

export function clusterByPixelDistance<T extends { latitude: number; longitude: number }>(
  items: T[],
  project: ProjectPoint,
  radiusPx = CLUSTER_RADIUS_PX,
): ClusterGroup<T>[] {
  const pts: { item: T; x: number; y: number }[] = [];
  for (const item of items) {
    const p = project(item.latitude, item.longitude);
    if (!p) continue;
    pts.push({ item, x: p.x, y: p.y });
  }
  const clusters: { members: typeof pts }[] = [];
  for (const p of pts) {
    let joined = false;
    for (const c of clusters) {
      const cx = c.members.reduce((s, m) => s + m.x, 0) / c.members.length;
      const cy = c.members.reduce((s, m) => s + m.y, 0) / c.members.length;
      if (Math.hypot(p.x - cx, p.y - cy) <= radiusPx) {
        c.members.push(p);
        joined = true;
        break;
      }
    }
    if (!joined) clusters.push({ members: [p] });
  }
  return clusters.map((c) => ({
    members: c.members.map((m) => m.item),
    latitude: c.members.reduce((s, m) => s + m.item.latitude, 0) / c.members.length,
    longitude: c.members.reduce((s, m) => s + m.item.longitude, 0) / c.members.length,
  }));
}

export function minPairPixelDistance(points: { x: number; y: number }[]): number {
  if (points.length < 2) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * Zoom needed so the closest pair is far enough apart to render as individual markers.
 * If they cannot separate by maxZoom (same/almost-same coordinates), caller should spiderfy.
 */
export function zoomToSeparate(
  minPixelDistAtCurrentZoom: number,
  currentZoom: number,
  maxZoom: number,
  radiusPx = CLUSTER_RADIUS_PX,
): { zoom: number; spiderfy: boolean } {
  if (!Number.isFinite(minPixelDistAtCurrentZoom) || minPixelDistAtCurrentZoom <= 0.05) {
    return { zoom: currentZoom, spiderfy: true };
  }
  const targetDist = radiusPx + 20;
  if (minPixelDistAtCurrentZoom >= targetDist) {
    return { zoom: currentZoom, spiderfy: false };
  }
  const needed = currentZoom + Math.log2(targetDist / minPixelDistAtCurrentZoom);
  if (needed > maxZoom + 0.05) return { zoom: maxZoom, spiderfy: true };
  return { zoom: Math.min(maxZoom, needed), spiderfy: false };
}

export function clusterAppearance(statuses: FleetStatus[]): { fill: string; split: boolean } {
  const set = new Set(statuses);
  if (set.has("driving") && set.has("stopped")) {
    return { fill: VEHICLE_FILL.driving, split: true };
  }
  if (set.has("driving")) return { fill: VEHICLE_FILL.driving, split: false };
  if (set.has("stopped")) return { fill: VEHICLE_FILL.stopped, split: false };
  return { fill: VEHICLE_FILL.offline, split: false };
}

/** Assigned team member, or the vehicle name when unassigned. Shortens on compact maps. */
export function vehicleTagLabel(
  v: { profile?: { full_name: string } | null; label?: string | null; name: string },
  compact: boolean,
): string {
  const who = v.profile?.full_name?.trim() ?? "";
  if (who) return compact ? (who.split(/\s+/)[0] ?? who) : who;
  const vehicle = (v.label || v.name).trim();
  if (!compact || vehicle.length <= 16) return vehicle;
  return `${vehicle.slice(0, 15).trimEnd()}…`;
}

export function spiderfyOffsets(count: number, spacingPx = 52): { x: number; y: number }[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 0 }];
  if (count === 2) return [{ x: -spacingPx, y: 0 }, { x: spacingPx, y: 0 }];
  const radius = Math.max(spacingPx, (spacingPx * count) / (2 * Math.PI) * 1.5);
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });
}
