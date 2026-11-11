"use client";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { FleetMapCanvas } from "./fleet-map";
import { SampleBadge } from "./sample-badge";
import { vehicleStatusDotStyle } from "./map-icons";
import { driverLabel, statusDetail, vehicleTitle } from "./status";
import { useFleetLocations } from "./use-fleet-locations";

/** Home “Where’s my crew” — staff with fleet access only. */
export function CrewCard() {
  const { data, error, loading } = useFleetLocations();
  const crew = (data?.vehicles ?? []).filter((v) => v.profile);
  return (
    <div className="card min-w-0 overflow-hidden" data-testid="fleet-crew-card">
      <div className="card-hd">
        <h3 className="min-w-0 truncate font-semibold">Where&apos;s my crew</h3>
        <div className="flex shrink-0 items-center gap-2">
          {data?.sample && <SampleBadge />}
          <Link href="/fleet" className="text-xs font-semibold whitespace-nowrap text-brand">View fleet</Link>
        </div>
      </div>
      <div className="h-[200px] w-full min-w-0 overflow-hidden md:h-[240px]">
        {loading && !data ? <div className="grid h-full place-items-center bg-[#e8ece9] text-sm text-muted">Loading map…</div> : <FleetMapCanvas data={data} className="h-full" padding={28} />}
      </div>
      {error && <div className="px-4 py-2 text-sm text-amber-800">{error}</div>}
      <div className="divide-y divide-line">
        {!crew.length && !loading && <div className="p-4 text-sm text-muted">No mapped trucks right now.</div>}
        {crew.map((v) => (
          <div key={v.id} className="flex min-w-0 items-center gap-3 px-4 py-2.5">
            {v.profile && <Avatar name={v.profile.full_name} color={v.profile.color} src={v.profile.avatar_url} />}
            <span className="size-2.5 shrink-0 rounded-full" style={vehicleStatusDotStyle(v.status)} data-testid="fleet-status-dot" data-status={v.status} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{driverLabel(v)} <span className="font-normal text-muted">· {vehicleTitle(v)}</span></div>
              <div className="truncate text-[12.5px] text-muted">
                {v.nearestVisit?.kind === "onsite" ? `Arrived · ${v.nearestVisit.customerName}` : v.nearestVisit ? `En route · ${v.nearestVisit.customerName} · ${v.nearestVisit.distanceLabel}` : statusDetail(v)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
