"use client";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
import { fmtDateTime } from "@/lib/time";
import { FleetMapCanvas } from "./fleet-map";
import { SampleBadge } from "./sample-badge";
import { driverLabel, statusDetail, STATUS_LABEL, STATUS_PILL, vehicleTitle } from "./status";
import { useFleetLocations } from "./use-fleet-locations";
import type { FleetLocationsResponse, FleetVehicle } from "@/lib/geotab/types";

export function AssignedTruckCard({ jobId, assigneeIds }: { jobId: string; assigneeIds: string[] }) {
  const { data, error, loading } = useFleetLocations();
  if (error && !data) return null;
  const assigned = pickAssigned(data, jobId, assigneeIds);
  if (!loading && !assigned) return null;
  const focused = data && assigned ? { ...data, vehicles: [assigned], visits: data.visits.filter((v) => v.jobId === jobId || assigned.nearestVisit?.jobId === v.jobId) } : data;
  return (
    <div className="card min-w-0 overflow-hidden" data-testid="assigned-truck">
      <div className="card-hd">
        <h3 className="font-semibold">Assigned truck</h3>
        <div className="flex items-center gap-2">{data?.sample && <SampleBadge />}<Link href="/fleet" className="text-xs font-semibold text-brand">Fleet</Link></div>
      </div>
      {loading && !assigned ? <div className="p-5 text-sm text-muted">Looking up the truck…</div> : assigned && (
        <>
          <div className="h-[180px] w-full min-w-0 overflow-hidden md:h-[220px]">
            <FleetMapCanvas data={focused} selectedId={assigned.id} className="h-full" padding={36} />
          </div>
          <div className="flex flex-col gap-2 p-4">
            <div className="flex min-w-0 items-center gap-3">
              {assigned.profile ? <Avatar name={assigned.profile.full_name} color={assigned.profile.color} src={assigned.profile.avatar_url} /> : <Icon name="truck" className="size-8" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-semibold">{vehicleTitle(assigned)}<span className={`pill ${STATUS_PILL[assigned.status]}`}>{STATUS_LABEL[assigned.status]}</span></div>
                <div className="text-[12.5px] text-muted">{driverLabel(assigned)}{assigned.lastUpdate ? ` · updated ${fmtDateTime(assigned.lastUpdate)}` : ""}</div>
              </div>
            </div>
            {assigned.nearestVisit?.kind === "onsite" ? (
              <div className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
                <b>Arrived</b> at {assigned.nearestVisit.customerName}{assigned.nearestVisit.onSiteSinceLabel ? ` · ${assigned.nearestVisit.onSiteSinceLabel.charAt(0).toLowerCase() + assigned.nearestVisit.onSiteSinceLabel.slice(1)}` : ""}. Arrival is automatic when a stopped truck is within 150 m of the visit.
              </div>
            ) : assigned.nearestVisit ? (
              <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
                <b>En route</b> to {assigned.nearestVisit.customerName} · {assigned.nearestVisit.distanceLabel}{assigned.nearestVisit.etaMinutes ? ` · ~${assigned.nearestVisit.etaMinutes} min` : ""}
              </div>
            ) : (
              <div className="text-sm text-muted">{statusDetail(assigned)}. Visit arrival is computed only when the site has coordinates.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function pickAssigned(data: FleetLocationsResponse | null, jobId: string, assigneeIds: string[]): FleetVehicle | null {
  if (!data) return null;
  const byVisit = data.vehicles.find((v) => v.nearestVisit?.jobId === jobId);
  if (byVisit) return byVisit;
  const set = new Set(assigneeIds);
  return data.vehicles.find((v) => v.profile && set.has(v.profile.id)) ?? null;
}
