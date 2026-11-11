"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { FleetMapCanvas } from "./fleet-map";
import { SampleBadge } from "./sample-badge";
import { driverLabel, vehicleTitle } from "./status";
import { useFleetLocations } from "./use-fleet-locations";

/** Day-view live map on the schedule board. */
export function DispatchMap() {
  const { data, error, loading } = useFleetLocations();
  return (
    <div className="card mb-4 min-w-0 overflow-hidden" data-testid="dispatch-map">
      <div className="card-hd">
        <h3 className="font-semibold">Live map</h3>
        <div className="flex items-center gap-2">{data?.sample && <SampleBadge />}<Link href="/fleet" className="text-xs font-semibold text-brand">Open fleet</Link></div>
      </div>
      <div className="grid items-stretch md:grid-cols-[minmax(0,1.4fr)_minmax(240px,320px)]">
        <div className="h-[220px] w-full min-w-0 overflow-hidden md:h-[320px]">
          {loading && !data ? <div className="grid h-full place-items-center bg-[#e8ece9] text-sm text-muted">Loading map…</div> : <FleetMapCanvas data={data} className="h-full" padding={32} />}
        </div>
        <div className="divide-y divide-line border-t border-line md:border-t-0 md:border-l">
          {error && <div className="px-4 py-3 text-sm text-amber-800">{error}</div>}
          {!data?.vehicles.length && !loading && <div className="p-4 text-sm text-muted">No vehicles to show.</div>}
          {(data?.vehicles ?? []).filter((v) => v.profile || v.nearestVisit).slice(0, 8).map((v) => (
            <div key={v.id} className="flex min-w-0 items-center gap-2.5 px-4 py-2.5">
              {v.profile ? <Avatar name={v.profile.full_name} color={v.profile.color} size="sm" src={v.profile.avatar_url} /> : <span className="size-7 shrink-0 rounded-full bg-slate-200" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{driverLabel(v)} <span className="font-normal text-muted">· {vehicleTitle(v)}</span></div>
                <div className="truncate text-[12px] text-muted">
                  {v.nearestVisit?.kind === "onsite" ? `Arrived · ${v.nearestVisit.customerName}` : v.nearestVisit ? `En route · ${v.nearestVisit.distanceLabel}` : v.status === "offline" ? "Offline" : "On the road"}
                </div>
              </div>
              {v.nearestVisit && (
                <span className={`pill shrink-0 ${v.nearestVisit.kind === "onsite" ? "bg-teal-50 text-teal-800" : "bg-sky-50 text-sky-800"}`}>{v.nearestVisit.kind === "onsite" ? "Arrived" : v.nearestVisit.distanceLabel}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
