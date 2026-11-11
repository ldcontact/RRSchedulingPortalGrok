"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { setFleetMapping } from "@/app/(app)/fleet/actions";
import { fmtDateTime } from "@/lib/time";
import type { FleetVehicleRow, TeamMember } from "@/lib/types";
import type { FleetVehicle } from "@/lib/geotab/types";
import { FleetMapCanvas } from "./fleet-map";
import { SampleBadge } from "./sample-badge";
import { suggestFleetAssignee } from "@/lib/geotab/suggest";
import { driverLabel, statusDetail, STATUS_LABEL, STATUS_PILL, vehicleTitle } from "./status";
import { useFleetLocations } from "./use-fleet-locations";

export function FleetPageClient({ admin, team, mappings }: { admin: boolean; team: TeamMember[]; mappings: FleetVehicleRow[] }) {
  const { data, error, loading } = useFleetLocations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapByDevice = useMemo(() => new Map(mappings.map((m) => [m.geotab_device_id, m])), [mappings]);

  return (
    <div data-testid="fleet-page">
      <PageHeader
        title="Fleet"
        sub={data?.asOf ? <>Updated {fmtDateTime(data.asOf)}{data.sample ? " · not live Geotab data" : ""}</> : "Live truck locations"}
        actions={data?.sample ? <SampleBadge /> : null}
      />
      {error && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</div>}
      {data && (
        <p className="mb-3 text-[12.5px] text-muted">Visit pins use geocoded job-site coordinates (US Census). Arrival is automatic when a stopped truck is within 150 m. Sites that have not been geocoded yet are omitted.</p>
      )}
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,360px)]">
        <div className="card min-w-0 overflow-hidden">
          <div className="h-[280px] w-full min-w-0 md:h-[560px]">
            {loading && !data ? <div className="grid h-full place-items-center text-sm text-muted">Loading map…</div> : <FleetMapCanvas data={data} selectedId={selectedId} onSelect={setSelectedId} className="h-full" />}
          </div>
        </div>
        <div className="card flex min-h-0 min-w-0 flex-col overflow-hidden lg:max-h-[560px]">
          <div className="card-hd shrink-0"><h3 className="font-semibold">Vehicles</h3><span className="text-xs text-muted">{data?.vehicles.length ?? 0}</span></div>
          <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" data-testid="fleet-vehicle-list">
            {!data?.vehicles.length && <div className="p-5 text-sm text-muted">{loading ? "Loading…" : "No vehicles to show."}</div>}
            {data?.vehicles.map((v) => (
              <VehicleRow key={v.id} v={v} selected={v.id === selectedId} onSelect={() => setSelectedId(v.id)} admin={admin} team={team} mapping={mapByDevice.get(v.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function VehicleRow({ v, selected, onSelect, admin, team, mapping }: { v: FleetVehicle; selected: boolean; onSelect: () => void; admin: boolean; team: TeamMember[]; mapping?: FleetVehicleRow }) {
  return (
    <div className={`px-4 py-3 ${selected ? "bg-brand-50/60" : "hover:bg-[#fafbf9]"}`}>
      <button type="button" onClick={onSelect} className="flex w-full min-w-0 items-start gap-3 text-left">
        <span className={`mt-1 size-2.5 shrink-0 rounded-full ${v.status === "driving" ? "bg-teal-600" : v.status === "stopped" ? "bg-violet-600" : "bg-slate-400"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate font-semibold">{vehicleTitle(v)}</span>
            <span className={`pill shrink-0 ${STATUS_PILL[v.status]}`}>{STATUS_LABEL[v.status]}</span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12.5px] text-muted">
            {v.profile ? <Avatar name={v.profile.full_name} color={v.profile.color} size="sm" src={v.profile.avatar_url} /> : <Icon name="user" className="size-4" />}
            <span className="min-w-0 truncate">{driverLabel(v)}</span>
            <span className="shrink-0">· {statusDetail(v)}</span>
          </div>
          {v.nearestVisit && (
            <div className="mt-1 text-[12.5px] text-muted">
              {v.nearestVisit.kind === "onsite" ? <span className="font-semibold text-teal-800">Arrived · {v.nearestVisit.customerName}</span> : <span>En route to {v.nearestVisit.customerName} · {v.nearestVisit.distanceLabel}{v.nearestVisit.etaMinutes ? ` · ${v.nearestVisit.etaMinutes} min` : ""}</span>}
            </div>
          )}
        </div>
      </button>
      {admin && (
        <div className="mt-2 space-y-1.5">
          <form action={setFleetMapping} className="grid grid-cols-[1fr_auto] gap-2">
            <input type="hidden" name="geotab_device_id" value={v.id} />
            <input type="hidden" name="label" value={mapping?.label ?? ""} />
            <select name="profile_id" defaultValue={mapping?.profile_id ?? v.profile?.id ?? ""} className="input text-sm" aria-label={`Assign ${vehicleTitle(v)}`}>
              <option value="">Unassigned</option>
              {team.map((m) => <option key={m.profile_id} value={m.profile_id!}>{m.full_name}</option>)}
            </select>
            <SubmitButton className="btn btn-sm">Save</SubmitButton>
          </form>
          <SuggestedMapping v={v} team={team} mapping={mapping} />
        </div>
      )}
    </div>
  );
}

function SuggestedMapping({ v, team, mapping }: { v: FleetVehicle; team: TeamMember[]; mapping?: FleetVehicleRow }) {
  if (mapping?.profile_id || v.profile) return null;
  const suggestion = suggestFleetAssignee(v.name, team);
  if (!suggestion?.profile_id) return null;
  return (
    <form action={setFleetMapping}>
      <input type="hidden" name="geotab_device_id" value={v.id} />
      <input type="hidden" name="label" value={mapping?.label ?? ""} />
      <input type="hidden" name="profile_id" value={suggestion.profile_id} />
      <button type="submit" data-testid="suggested-mapping" className="text-[12.5px] font-semibold text-brand hover:underline">
        Suggested: {suggestion.full_name}
      </button>
    </form>
  );
}
