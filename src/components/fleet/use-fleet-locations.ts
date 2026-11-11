"use client";
import { useEffect, useState } from "react";
import type { FleetLocationsResponse } from "@/lib/geotab/types";

const POLL_MS = 30_000;

export function useFleetLocations() {
  const [data, setData] = useState<FleetLocationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch("/api/fleet/locations", { cache: "no-store" });
        if (stop) return;
        setStatus(res.status);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof body.error === "string" ? body.error : "Could not load fleet");
          setData(null);
        } else {
          setError(null);
          setData(body as FleetLocationsResponse);
        }
      } catch {
        if (!stop) {
          setError("Could not load fleet");
          setStatus(0);
        }
      } finally {
        if (!stop) setLoading(false);
      }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, []);

  return { data, error, status, loading };
}
