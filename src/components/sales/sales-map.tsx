"use client";
import { useEffect, useRef } from "react";
import type { SalesDeal } from "@/lib/sales/types";

const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const SCHAUMBURG: [number, number] = [42.033, -88.083];

export function SalesMap({ deals }: { deals: Pick<SalesDeal, "id" | "title" | "contact_name" | "stage_slug" | "lat" | "lng" | "city">[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      if (!document.querySelector('link[data-leaflet]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/vendor/leaflet.css";
        link.setAttribute("data-leaflet", "1");
        document.head.appendChild(link);
      }
      map = L.map(ref.current, { scrollWheelZoom: false }).setView(SCHAUMBURG, 11);
      L.tileLayer(OSM, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map);
      const pts: [number, number][] = [];
      for (const d of deals) {
        if (d.lat == null || d.lng == null) continue;
        pts.push([d.lat, d.lng]);
        const m = L.marker([d.lat, d.lng]).addTo(map);
        m.bindPopup(`<a href="/sales/deals/${d.id}" style="font-weight:600;color:#0f766e">${d.title}</a><div style="color:#66706c;font-size:12px">${d.contact_name ?? ""} · ${d.city ?? ""}</div>`);
      }
      if (pts.length > 1) map.fitBounds(pts, { padding: [28, 28], maxZoom: 13 });
      else if (pts.length === 1) map.setView(pts[0], 13);
    })();
    return () => { cancelled = true; map?.remove(); };
  }, [deals]);
  return <div ref={ref} className="h-[480px] w-full overflow-hidden rounded-xl border border-line bg-[#e8eee9]" data-testid="sales-map" />;
}
