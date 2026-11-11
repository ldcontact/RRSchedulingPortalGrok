"use client";
import { useEffect, useRef, useState } from "react";
import type { FleetLocationsResponse, FleetVehicle } from "@/lib/geotab/types";
import { autoFitPoints, CHICAGO_BOUNDS, isMappablePoint } from "@/lib/geotab/region";

const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = OSM_ATTR + ' &copy; <a href="https://www.esri.com/">Esri</a>';
const SCHAUMBURG: [number, number] = [42.033, -88.083];

const STATUS_COLOR: Record<FleetVehicle["status"], string> = {
  driving: "#0f766e",
  stopped: "#7c3aed",
  offline: "#94a3b8",
};

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
      const link = document.querySelector('link[data-leaflet-css]');
      if (!link) {
        const el = document.createElement("link");
        el.rel = "stylesheet";
        el.href = "/vendor/leaflet.css";
        el.setAttribute("data-leaflet-css", "1");
        document.head.appendChild(el);
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
      for (const v of data.visits) {
        if (!isMappablePoint(v.latitude, v.longitude)) continue;
        const m = L.circleMarker([v.latitude, v.longitude], {
          radius: 8, color: "#fff", weight: 2, fillColor: "#d97706", fillOpacity: 1,
        }).bindPopup(`<strong>${escapeHtml(v.customerName)}</strong><br/>${escapeHtml(v.title)}`, { autoPan: false });
        m.addTo(layers);
      }
      for (const v of data.vehicles) {
        if (!isMappablePoint(v.latitude, v.longitude)) continue;
        const color = STATUS_COLOR[v.status];
        const selected = v.id === selectedId;
        const marker = L.circleMarker([v.latitude, v.longitude], {
          radius: selected ? 11 : 8,
          color: "#fff",
          weight: selected ? 3 : 2,
          fillColor: color,
          fillOpacity: 1,
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

  return <div ref={wrap} className={`min-h-[200px] w-full min-w-0 ${className}`} data-testid="fleet-map" />;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
