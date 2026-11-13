"use client";
import { useEffect, useRef, useState } from "react";
import type { FleetLocationsResponse, FleetVehicle } from "@/lib/geotab/types";
import { visitPinColor } from "@/lib/geotab/next-visit";
import { autoFitPoints, CHICAGO_BOUNDS, isMappablePoint } from "@/lib/geotab/region";
import { allowMapAnimation } from "./preview";
import { truckCardHtml } from "./truck-card";
import {
  clusterAppearance,
  clusterByPixelDistance,
  minPairPixelDistance,
  spiderfyOffsets,
  vehicleTagLabel,
  zoomToSeparate,
} from "./cluster";
import {
  JOB_SITE_FILL,
  jobSiteIconAnchor,
  jobSiteIconSize,
  clusterIconAnchor,
  clusterIconHtml,
  clusterIconSize,
  jobSiteIconHtml,
  VEHICLE_FILL,
  vehicleIconAnchor,
  vehicleIconHtml,
  vehicleIconSize,
} from "./map-icons";

const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = OSM_ATTR + ' &copy; <a href="https://www.esri.com/">Esri</a>';
const ESRI_SAT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_SAT_ATTR = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const SCHAUMBURG: [number, number] = [42.033, -88.083];

const MARKER_CSS = `.fleet-div-icon{background:transparent!important;border:none!important;overflow:visible!important;}
.fleet-div-icon svg{display:block;overflow:visible;}
.fleet-vehicle-label{position:absolute;left:100%;top:50%;transform:translate(4px,-50%);max-width:9.5rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:6px;padding:1px 5px;font:600 11px/1.3 system-ui,sans-serif;color:#1c2423;box-shadow:0 1px 2px rgba(0,0,0,.15);pointer-events:none;z-index:2;}
.fleet-cluster-count{position:absolute;top:-4px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#1c2423;color:#fff;font:700 10px/16px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff;pointer-events:none;}
.fleet-spider-leg{stroke-linecap:round;}`;

type Leaflet = typeof import("leaflet");

type PaintRefs = {
  wrap: React.RefObject<HTMLDivElement | null>;
  map: React.RefObject<import("leaflet").Map | null>;
  layers: React.RefObject<import("leaflet").LayerGroup | null>;
  data: React.RefObject<FleetLocationsResponse | null>;
  selectedId: React.RefObject<string | null | undefined>;
  selectedVisitId: React.RefObject<string | null | undefined>;
  previewVehicleId: React.RefObject<string | null | undefined>;
  previewVisitId: React.RefObject<string | null | undefined>;
  padding: React.RefObject<number>;
  spiderfy: React.RefObject<string[] | null>;
  onSelect: React.RefObject<((id: string) => void) | undefined>;
  onSelectVisit: React.RefObject<((id: string) => void) | undefined>;
  fitted: React.RefObject<boolean>;
  lastSelected: React.RefObject<string | null | undefined>;
  lastPreview: React.RefObject<string | null>;
  viewKey: React.RefObject<string>;
  lastViewKey: React.RefObject<string>;
};

export function FleetMapCanvas({ data, selectedId, onSelect, selectedVisitId, onSelectVisit, previewVehicleId, previewVisitId, viewKey = "", className = "", padding = 48 }: {
  data: FleetLocationsResponse | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  selectedVisitId?: string | null;
  onSelectVisit?: (id: string) => void;
  previewVehicleId?: string | null;
  previewVisitId?: string | null;
  /** Changes when the visible vehicle/visit set is filtered so the map can refit. */
  viewKey?: string;
  className?: string;
  padding?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const streetRef = useRef<import("leaflet").TileLayer | null>(null);
  const satRef = useRef<import("leaflet").TileLayer | null>(null);
  const [basemap, setBasemap] = useState<"map" | "satellite">("map");
  const onSelectRef = useRef(onSelect);
  const onSelectVisitRef = useRef(onSelectVisit);
  const dataRef = useRef(data);
  const selectedIdRef = useRef(selectedId);
  const selectedVisitIdRef = useRef(selectedVisitId);
  const previewVehicleIdRef = useRef(previewVehicleId);
  const previewVisitIdRef = useRef(previewVisitId);
  const paddingRef = useRef(padding);
  const viewKeyRef = useRef(viewKey);
  const lastViewKeyRef = useRef("");
  const spiderfyRef = useRef<string[] | null>(null);
  const fittedRef = useRef(false);
  const lastSelectedRef = useRef<string | null | undefined>(undefined);
  const lastPreviewRef = useRef<string | null>(null);
  const refs = useRef<PaintRefs>({
    wrap,
    map: mapRef,
    layers: layerRef,
    data: dataRef,
    selectedId: selectedIdRef,
    selectedVisitId: selectedVisitIdRef,
    previewVehicleId: previewVehicleIdRef,
    previewVisitId: previewVisitIdRef,
    padding: paddingRef,
    spiderfy: spiderfyRef,
    onSelect: onSelectRef,
    onSelectVisit: onSelectVisitRef,
    fitted: fittedRef,
    lastSelected: lastSelectedRef,
    lastPreview: lastPreviewRef,
    viewKey: viewKeyRef,
    lastViewKey: lastViewKeyRef,
  });
  const [mapReady, setMapReady] = useState(0);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onSelectVisitRef.current = onSelectVisit; }, [onSelectVisit]);
  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { selectedVisitIdRef.current = selectedVisitId; }, [selectedVisitId]);
  useEffect(() => { previewVehicleIdRef.current = previewVehicleId; }, [previewVehicleId]);
  useEffect(() => { previewVisitIdRef.current = previewVisitId; }, [previewVisitId]);
  useEffect(() => { paddingRef.current = padding; }, [padding]);
  useEffect(() => { viewKeyRef.current = viewKey; }, [viewKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!wrap.current || mapRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !wrap.current) return;
      if (!document.querySelector('link[data-leaflet-css]')) {
        const el = document.createElement("link");
        el.rel = "stylesheet";
        el.href = "/vendor/leaflet.css";
        el.setAttribute("data-leaflet-css", "1");
        document.head.appendChild(el);
      }
      if (!document.querySelector("style[data-fleet-marker-css]")) {
        const css = document.createElement("style");
        css.setAttribute("data-fleet-marker-css", "1");
        css.textContent = MARKER_CSS;
        document.head.appendChild(css);
      }
      if (cancelled || !wrap.current) return;
      const map = L.map(wrap.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
      const osm = L.tileLayer(OSM, { attribution: OSM_ATTR, maxZoom: 19, errorTileUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" });
      const sat = L.tileLayer(ESRI_SAT, { attribution: ESRI_SAT_ATTR, maxZoom: 19 });
      osm.addTo(map);
      let fellBack = false;
      osm.on("tileerror", () => {
        if (fellBack) return;
        fellBack = true;
        map.removeLayer(osm);
        const street = L.tileLayer(ESRI, { attribution: ESRI_ATTR, maxZoom: 19 });
        street.addTo(map);
        streetRef.current = street;
      });
      map.setView(SCHAUMBURG, 12);
      const layers = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layers;
      streetRef.current = osm;
      satRef.current = sat;
      map.on("zoomend", () => { spiderfyRef.current = null; void paint(refs.current, { fit: false, L }); });
      requestAnimationFrame(() => { map.invalidateSize(); setMapReady((n) => n + 1); });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    void paint(refs.current, { fit: true });
  }, [data, selectedId, selectedVisitId, previewVehicleId, previewVisitId, viewKey, padding, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const street = streetRef.current;
    const sat = satRef.current;
    if (!map || !street || !sat) return;
    if (basemap === "satellite") {
      if (map.hasLayer(street)) map.removeLayer(street);
      if (!map.hasLayer(sat)) sat.addTo(map);
    } else {
      if (map.hasLayer(sat)) map.removeLayer(sat);
      if (!map.hasLayer(street)) street.addTo(map);
    }
  }, [basemap, mapReady]);

  return (
    <div className={`relative min-h-[200px] w-full min-w-0 ${className}`}>
      <div ref={wrap} className="h-full min-h-[200px] w-full min-w-0" data-testid="fleet-map" />
      <BasemapToggle value={basemap} onChange={setBasemap} />
      <FleetMapLegend />
    </div>
  );
}

async function paint(refs: PaintRefs, opts: { fit: boolean; L?: Leaflet }) {
  const map = refs.map.current;
  const layers = refs.layers.current;
  const current = refs.data.current;
  if (!map || !layers || !current) return;
  const L = opts.L ?? (await import("leaflet")).default;
  layers.clearLayers();
  const wrapEl = refs.wrap.current;
  const compact = (wrapEl?.clientHeight ?? 400) < 260 || (wrapEl?.clientWidth ?? 600) < 400;
  const zoom = map.getZoom();
  const showLabels = zoom > 10;
  const selectedVisit = refs.selectedVisitId.current;
  const previewVisit = refs.previewVisitId.current;
  let selectedVisitMarker: import("leaflet").Marker | null = null;
  for (const v of current.visits) {
    if (!isMappablePoint(v.latitude, v.longitude)) continue;
    const isSelected = v.jobId === selectedVisit;
    const emphasized = isSelected || v.jobId === previewVisit;
    const icon = L.divIcon({
      className: "fleet-div-icon",
      html: jobSiteIconHtml({ type: v.projectType, kind: v.kind, selected: emphasized, fill: visitPinColor(v) }),
      iconSize: jobSiteIconSize(emphasized),
      iconAnchor: jobSiteIconAnchor(emphasized),
      popupAnchor: [0, -32],
    });
    const m = L.marker([v.latitude, v.longitude], { icon, zIndexOffset: emphasized ? 650 : 50, keyboard: false });
    m.bindPopup(`<strong>${escapeHtml(v.customerName)}</strong><br/>${escapeHtml(v.title)}`, { autoPan: false });
    m.on("click", () => refs.onSelectVisit.current?.(v.jobId));
    m.addTo(layers);
    if (isSelected) selectedVisitMarker = m;
  }
  const vehicles = current.vehicles.filter((v) => isMappablePoint(v.latitude, v.longitude));
  const project = (lat: number, lng: number) => {
    const p = map.latLngToLayerPoint([lat, lng]);
    return { x: p.x, y: p.y };
  };
  const groups = clusterByPixelDistance(vehicles, project);
  const selected = refs.selectedId.current;
  const previewVehicle = refs.previewVehicleId.current;
  const focusVehicleId = previewVehicle || selected || null;
  const spiderIds = refs.spiderfy.current ? new Set(refs.spiderfy.current) : null;

  for (const g of groups) {
    const ids = g.members.map((m) => m.id);
    const stillSpider = !!(spiderIds && ids.length > 1 && ids.every((id) => spiderIds.has(id)) && spiderIds.size === ids.length);
    if (g.members.length === 1) {
      addVehicleMarker(L, layers, g.members[0], selected, showLabels, compact, false, refs);
      continue;
    }
    if (stillSpider) {
      addSpiderfy(L, map, layers, g.members, [g.latitude, g.longitude], selected, showLabels, compact, refs);
      continue;
    }
    const appearance = clusterAppearance(g.members.map((m) => m.status));
    const isSelected = !!(focusVehicleId && ids.includes(focusVehicleId));
    const icon = L.divIcon({
      className: "fleet-div-icon",
      html: clusterIconHtml({ count: g.members.length, fill: appearance.fill, split: appearance.split, id: ids.join("-"), selected: isSelected }),
      iconSize: clusterIconSize(),
      iconAnchor: clusterIconAnchor(),
      popupAnchor: [0, -18],
    });
    const marker = L.marker([g.latitude, g.longitude], {
      icon,
      zIndexOffset: isSelected ? 800 : 500,
      keyboard: false,
    });
    marker.on("click", () => onClusterClick(refs, L, map, g.members));
    marker.addTo(layers);
  }

  addDriveRoute(L, layers, current, refs.selectedId.current);

  if (opts.fit) {
    const token = selected ? `v:${selected}` : selectedVisit ? `j:${selectedVisit}` : null;
    const selectedChanged = refs.lastSelected.current !== token;
    refs.lastSelected.current = token;
    const viewKey = refs.viewKey.current;
    const viewChanged = viewKey !== refs.lastViewKey.current;
    refs.lastViewKey.current = viewKey;
    const animate = allowMapAnimation();
    if (selected && selectedChanged) {
      const routed = fitRouteOnMap(L, map, current, selected, animate);
      if (!routed) focusVehicleOnMap(refs, L, map, groups, current, selected, animate);
      refs.fitted.current = true;
    } else if (selectedVisit && selectedChanged) {
      const visit = current.visits.find((v) => v.jobId === selectedVisit);
      if (visit && isMappablePoint(visit.latitude, visit.longitude)) {
        map.setView([visit.latitude, visit.longitude], Math.max(map.getZoom(), 15), { animate });
        selectedVisitMarker?.openPopup();
      }
      refs.fitted.current = true;
    } else if (!refs.fitted.current || viewChanged) {
      const bounds = L.latLngBounds([]);
      const fitPts = autoFitPoints(current.vehicles, current.visits, current.asOf);
      for (const p of fitPts) bounds.extend([p.latitude, p.longitude]);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [refs.padding.current, refs.padding.current], maxZoom: 14, animate: allowMapAnimation() });
      } else {
        map.fitBounds(CHICAGO_BOUNDS, { padding: [refs.padding.current, refs.padding.current], maxZoom: 14, animate: allowMapAnimation() });
      }
      refs.fitted.current = true;
    }
    const previewToken = previewVehicle ? `v:${previewVehicle}` : previewVisit ? `j:${previewVisit}` : null;
    const previewChanged = refs.lastPreview.current !== previewToken;
    refs.lastPreview.current = previewToken;
    if (previewToken && previewChanged) {
      if (previewVehicle) {
        focusVehicleOnMap(refs, L, map, groups, current, previewVehicle, allowMapAnimation());
      } else if (previewVisit) {
        const visit = current.visits.find((v) => v.jobId === previewVisit);
        if (visit && isMappablePoint(visit.latitude, visit.longitude)) {
          map.setView([visit.latitude, visit.longitude], Math.max(map.getZoom(), 15), { animate: allowMapAnimation() });
        }
      }
    }
  } else if (selectedVisitMarker && selectedVisit) {
    selectedVisitMarker.openPopup();
  }
  requestAnimationFrame(() => map.invalidateSize());
}

function focusVehicleOnMap(
  refs: PaintRefs,
  L: Leaflet,
  map: import("leaflet").Map,
  groups: { members: FleetVehicle[]; latitude: number; longitude: number }[],
  current: FleetLocationsResponse,
  id: string,
  animate: boolean,
) {
  const sel = current.vehicles.find((v) => v.id === id);
  if (!sel || !isMappablePoint(sel.latitude, sel.longitude)) return;
  const host = groups.find((g) => g.members.some((m) => m.id === id));
  if (host && host.members.length > 1) {
    onClusterClick(refs, L, map, host.members, animate);
  } else {
    refs.spiderfy.current = null;
    map.setView([sel.latitude, sel.longitude], Math.max(map.getZoom(), 14), { animate });
  }
}

function onClusterClick(refs: PaintRefs, L: Leaflet, map: import("leaflet").Map, members: FleetVehicle[], animate = allowMapAnimation()) {
  const pts = members.map((m) => map.latLngToLayerPoint([m.latitude, m.longitude]));
  const minDist = minPairPixelDistance(pts.map((p) => ({ x: p.x, y: p.y })));
  const decision = zoomToSeparate(minDist, map.getZoom(), map.getMaxZoom());
  const lat = members.reduce((s, m) => s + m.latitude, 0) / members.length;
  const lng = members.reduce((s, m) => s + m.longitude, 0) / members.length;
  if (decision.spiderfy) {
    refs.spiderfy.current = members.map((m) => m.id).sort();
    void paint(refs, { fit: false, L });
    return;
  }
  refs.spiderfy.current = null;
  map.setView([lat, lng], decision.zoom, { animate });
}

function addSpiderfy(
  L: Leaflet,
  map: import("leaflet").Map,
  layers: import("leaflet").LayerGroup,
  members: FleetVehicle[],
  origin: [number, number],
  selected: string | null | undefined,
  showLabels: boolean,
  compact: boolean,
  refs: PaintRefs,
) {
  const originPt = map.latLngToLayerPoint(origin);
  const offsets = spiderfyOffsets(members.length);
  members.forEach((v, i) => {
    const pt = L.point(originPt.x + offsets[i].x, originPt.y + offsets[i].y);
    const latlng = map.layerPointToLatLng(pt);
    L.polyline([origin, latlng], {
      color: "#64748b",
      weight: 1.5,
      opacity: 0.65,
      dashArray: "4 3",
      className: "fleet-spider-leg",
      interactive: false,
    }).addTo(layers);
    addVehicleMarker(L, layers, v, selected, showLabels, compact, true, refs, latlng);
  });
}

function addVehicleMarker(
  L: Leaflet,
  layers: import("leaflet").LayerGroup,
  v: FleetVehicle,
  selectedId: string | null | undefined,
  showLabels: boolean,
  compact: boolean,
  spiderfied: boolean,
  refs: PaintRefs,
  at?: import("leaflet").LatLng,
) {
  const selected = v.id === selectedId;
  const emphasized = selected || v.id === refs.previewVehicleId.current;
  const label = showLabels ? vehicleTagLabel(v, compact) : null;
  const icon = L.divIcon({
    className: "fleet-div-icon",
    html: vehicleIconHtml(v.status, { heading: spiderfied ? null : v.heading, selected: emphasized, label }),
    iconSize: vehicleIconSize(emphasized),
    iconAnchor: vehicleIconAnchor(emphasized),
    popupAnchor: [0, -18],
  });
  const marker = L.marker(at ?? [v.latitude, v.longitude], {
    icon,
    zIndexOffset: emphasized ? 700 : v.status === "driving" ? 300 : v.status === "offline" ? 80 : 200,
    keyboard: false,
  });
  marker.bindPopup(truckCardHtml(v), { autoPan: false, closeButton: true, className: "fleet-truck-popup", maxWidth: 280, autoClose: false, closeOnClick: false });
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  marker.on("mouseover", () => {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    marker.openPopup();
  });
  marker.on("mouseout", () => {
    if (v.id === refs.selectedId.current) return;
    hoverTimer = setTimeout(() => { if (v.id !== refs.selectedId.current) marker.closePopup(); }, 200);
  });
  marker.on("click", () => refs.onSelect.current?.(v.id));
  marker.addTo(layers);
  if (selected || v.id === refs.previewVehicleId.current) marker.openPopup();
}

function routeLatLngs(current: FleetLocationsResponse, vehicleId: string): [number, number][] {
  const sel = current.vehicles.find((v) => v.id === vehicleId);
  const visit = sel?.nearestVisit;
  if (!sel || !visit || visit.kind !== "enroute") return [];
  if (visit.route.length >= 2) return visit.route;
  const dest = current.visits.find((j) => j.jobId === visit.jobId);
  if (!dest || !isMappablePoint(dest.latitude, dest.longitude)) return [];
  return [[sel.latitude, sel.longitude], [dest.latitude, dest.longitude]];
}

function addDriveRoute(L: Leaflet, layers: import("leaflet").LayerGroup, current: FleetLocationsResponse, selectedId: string | null | undefined) {
  if (!selectedId) return;
  const latlngs = routeLatLngs(current, selectedId);
  if (latlngs.length < 2) return;
  const dashed = !current.vehicles.find((v) => v.id === selectedId)?.nearestVisit?.route.length;
  L.polyline(latlngs, {
    color: "#0f766e",
    weight: 4,
    opacity: 0.9,
    dashArray: dashed ? "6 8" : undefined,
    className: "fleet-drive-route",
    interactive: false,
  }).addTo(layers);
}

function fitRouteOnMap(L: Leaflet, map: import("leaflet").Map, current: FleetLocationsResponse, vehicleId: string, animate: boolean): boolean {
  const latlngs = routeLatLngs(current, vehicleId);
  if (latlngs.length < 2) return false;
  map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 15, animate });
  return true;
}

function BasemapToggle({ value, onChange }: { value: "map" | "satellite"; onChange: (v: "map" | "satellite") => void }) {
  return (
    <div
      className="absolute right-3 top-3 z-[500] flex overflow-hidden rounded-lg border border-black/10 bg-white/95 text-[12px] font-semibold shadow-sm"
      data-testid="fleet-basemap-toggle"
      role="group"
      aria-label="Map style"
    >
      {(["map", "satellite"] as const).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          className={`px-2.5 py-1.5 capitalize ${value === key ? "bg-brand text-white" : "text-[#3d4744] hover:bg-canvas"}`}
          onClick={() => onChange(key)}
        >
          {key === "map" ? "Map" : "Satellite"}
        </button>
      ))}
    </div>
  );
}

function FleetMapLegend() {
  return (
    <div
      className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-black/10 bg-white/95 px-2.5 py-2 text-[11px] leading-tight shadow-sm"
      data-testid="fleet-map-legend"
    >
      <LegendRow color={VEHICLE_FILL.driving} shape="vehicle" label="Driving" />
      <LegendRow color={VEHICLE_FILL.stopped} shape="vehicle" label="Stopped" />
      <LegendRow color={JOB_SITE_FILL} shape="site" label="Today's visit" />
    </div>
  );
}

function LegendRow({ color, shape, label }: { color: string; shape: "vehicle" | "site"; label: string }) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
        {shape === "vehicle" ? (
          <svg viewBox="0 0 32 32" width="14" height="14">
            <path d="M12 5h8c1.4 0 2.5 1 2.8 2.3L24 10.5V13h1.2c.4 0 .8.3.8.8v2.4c0 .5-.4.8-.8.8H24v8.2c0 1.3-1 2.3-2.3 2.3H10.3C9 27.5 8 26.5 8 25.2V17H6.8c-.4 0-.8-.3-.8-.8v-2.4c0-.5.4-.8.8-.8H8v-2.5l1.2-3.2C9.5 6 10.6 5 12 5z" fill={color} stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 28 36" width="11" height="14">
            <path d="M14 1.5c-6.2 0-11 4.9-11 11.2 0 8.2 11 21.3 11 21.3s11-13.1 11-21.3C25 6.4 20.2 1.5 14 1.5z" fill={color} stroke="#fff" strokeWidth="1.8" />
            <path d="M14 9.2 20 14v7.2h-3.2v-3.8h-3.6v3.8H10V14z" fill="#fff" />
          </svg>
        )}
      </span>
      <span className="text-[#3d4744]">{label}</span>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
