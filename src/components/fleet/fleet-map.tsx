"use client";
import dynamic from "next/dynamic";

export const FleetMapCanvas = dynamic(() => import("./fleet-map-canvas").then((m) => m.FleetMapCanvas), {
  ssr: false,
  loading: () => <div className="h-full min-h-[200px] bg-[#e8ece9]" aria-hidden />,
});
