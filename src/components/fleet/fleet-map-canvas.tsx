"use client";
import { useEffect, useRef, useState } from "react";
import type { FleetLocationsResponse } from "@/lib/geotab/types";
import { autoFitPoints, CHICAGO_BOUNDS, isMappablePoint } from "@/lib/geotab/region";
import {
  JOB_SITE_FILL,
  JOB_SITE_ICON_ANCHOR,
  JOB_SITE_ICON_SIZE,
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
const SCHAUMBURG: [number, number] = [42.033, -88.083];

const MARKER_CSS = `.fleet-div-icon{background:transparent!important;border:none!important;}
.fleet-div-icon svg{display:block;overflow:visible;}`;

export function FleetMapCanvas({ data, selectedId, onSelect, className = "", padding = 48 }: {
  data: FleetLocationsResponse | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  padding?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  const [mapReady, setMapReady] = useState(0);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

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
      osm.addTo(map);
      let fellBack = false;
      osm.on("tileerror", () => {
        if (fellBack) return;
        fellBack = true;
        map.removeLayer(osm);
        L.tileLayer(ESRI, { attribution: ESRI_ATTR, maxZoom: 19 }).addTo(map);
      });
      map.setView(SCHAUMBURG, 12);
      const layers = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layers;
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
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers || !data) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled) return;
      layers.clearLayers();
      const bounds = L.latLngBounds([]);
      const siteIcon = L.divIcon({
        className: "fleet-div-icon",
        html: jobSiteIconHtml(),
        iconSize: JOB_SITE_ICON_SIZE,
        iconAnchor: JOB_SITE_ICON_ANCHOR,
        popupAnchor: [0, -32],
      });
      for (const v of data.visits) {
        if (!isMappablePoint(v.latitude, v.longitude)) continue;
        const m = L.marker([v.latitude, v.longitude], { icon: siteIcon, zIndexOffset: 50, keyboard: false });
        m.bindPopup(`<strong>${escapeHtml(v.customerName)}</strong><br/>${escapeHtml(v.title)}`, { autoPan: false });
        m.addTo(layers);
      }
      for (const v of data.vehicles) {
        if (!isMappablePoint(v.latitude, v.longitude)) continue;
        const selected = v.id === selectedId;
        const icon = L.divIcon({
          className: "fleet-div-icon",
          html: vehicleIconHtml(v.status, { heading: v.heading, selected }),
          iconSize: vehicleIconSize(selected),
          iconAnchor: vehicleIconAnchor(selected),
          popupAnchor: [0, -18],
        });
        const marker = L.marker([v.latitude, v.longitude], {
          icon,
          zIndexOffset: selected ? 700 : v.status === "driving" ? 300 : v.status === "offline" ? 80 : 200,
          keyboard: false,
        });
        const who = v.profile?.full_name ?? v.geotabDriverName ?? "Unassigned";
        marker.bindPopup(`<strong>${escapeHtml(v.label || v.name)}</strong><br/>${escapeHtml(who)}`, { autoPan: false });
        marker.on("click", () => onSelectRef.current?.(v.id));
        marker.addTo(layers);
        if (selected) marker.openPopup();
      }
      const fit = autoFitPoints(data.vehicles, data.visits, data.asOf);
      for (const p of fit) bounds.extend([p.latitude, p.longitude]);
      if (selectedId) {
        const sel = data.vehicles.find((v) => v.id === selectedId);
        if (sel && isMappablePoint(sel.latitude, sel.longitude)) {
          map.setView([sel.latitude, sel.longitude], Math.max(map.getZoom(), 14), { animate: true });
        } else if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [padding, padding], maxZoom: 14 });
        } else {
          map.fitBounds(CHICAGO_BOUNDS, { padding: [padding, padding], maxZoom: 14 });
        }
      } else if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [padding, padding], maxZoom: 14 });
      } else {
        map.fitBounds(CHICAGO_BOUNDS, { padding: [padding, padding], maxZoom: 14 });
      }
      requestAnimationFrame(() => map.invalidateSize());
    })();
    return () => { cancelled = true; };
  }, [data, selectedId, padding, mapReady]);

  return (
    <div className={`relative min-h-[200px] w-full min-w-0 ${className}`}>
      <div ref={wrap} className="h-full min-h-[200px] w-full min-w-0" data-testid="fleet-map" />
      <FleetMapLegend />
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
      <LegendRow color={JOB_SITE_FILL} shape="site" label="Job site" />
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
