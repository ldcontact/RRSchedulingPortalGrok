"use client";
import { useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { Avatar, PageHeader } from "@/components/ui";
import { AvatarStack, JobKindBadge, JobStatusPill, TypeTag } from "@/components/status";
import { SubmitButton } from "@/components/submit-button";
import { setFleetMapping } from "@/app/(app)/fleet/actions";
import { fmtDateTime, fmtRange } from "@/lib/time";
import type { FleetVehicleRow, TeamMember } from "@/lib/types";
import type { FleetVehicle, FleetVisitPin } from "@/lib/geotab/types";
import { FleetMapCanvas } from "./fleet-map";
import { SampleBadge } from "./sample-badge";
import { suggestFleetAssignee } from "@/lib/geotab/suggest";
import { fleetAssigneeOptionLabel, fleetAssigneeOptionValue, selectedFleetAssigneeValue } from "@/lib/geotab/assign";
import { jobSiteFill, vehicleStatusDotStyle } from "./map-icons";
import { driverLabel, statusDetail, STATUS_LABEL, STATUS_PILL, vehicleTitle } from "./status";
import { useFleetLocations } from "./use-fleet-locations";
import {
  JOB_FILTER_LABEL,
  VEHICLE_FILTER_LABEL,
  VEHICLE_FILTER_ORDER,
  jobFilterCounts,
  parseFilterQuery,
  serializeFilterQuery,
  toggleFilter,
  vehicleFilterCounts,
  vehicleMatchesFilters,
  visitMatchesFilters,
  visibleJobFilters,
  type JobFilterKey,
  type VehicleFilterKey,
} from "./filters";
import { createPreviewController, type PreviewTarget } from "./preview";

export function FleetPageClient({ admin, team, mappings }: { admin: boolean; team: TeamMember[]; mappings: FleetVehicleRow[] }) {
  const { data, error, loading } = useFleetLocations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{ target: PreviewTarget; at: string }>({ target: null, at: "" });
  const mapByDevice = useMemo(() => new Map(mappings.map((m) => [m.geotab_device_id, m])), [mappings]);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { types, vehicles: vehicleFilters } = useMemo(() => parseFilterQuery(searchParams), [searchParams]);

  const setFilters = useCallback((nextTypes: JobFilterKey[], nextVehicles: VehicleFilterKey[]) => {
    const qs = serializeFilterQuery(nextTypes, nextVehicles);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router]);

  const jobCounts = useMemo(() => jobFilterCounts(data?.visits ?? []), [data]);
  const shownJobFilters = visibleJobFilters(jobCounts);
  const vehicleCounts = useMemo(() => vehicleFilterCounts(data?.vehicles ?? []), [data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      vehicles: data.vehicles.filter((v) => vehicleMatchesFilters(v, vehicleFilters)),
      visits: data.visits.filter((v) => visitMatchesFilters(v, types)),
    };
  }, [data, types, vehicleFilters]);

  const viewKey = `${types.join(",")}|${vehicleFilters.join(",")}`;
  const [previewCtl] = useState(() => {
    let at = "";
    const inner = createPreviewController((target) => setPreviewState({ target, at }));
    return {
      enter(target: Exclude<PreviewTarget, null>, key: string) {
        at = key;
        inner.enter(target);
      },
      leave(key: string) {
        at = key;
        inner.leave();
      },
      cancel: inner.cancel,
    };
  });
  const preview = previewState.at === viewKey ? previewState.target : null;

  useEffect(() => () => previewCtl.cancel(), [previewCtl]);

  function isHoverPointer(e: ReactPointerEvent) {
    return e.pointerType === "mouse" || e.pointerType === "pen";
  }
  function onPreviewEnter(target: Exclude<PreviewTarget, null>) {
    return (e: ReactPointerEvent) => {
      if (!isHoverPointer(e)) return;
      previewCtl.enter(target, viewKey);
    };
  }
  function onPreviewLeave(e: ReactPointerEvent) {
    if (!isHoverPointer(e)) return;
    previewCtl.leave(viewKey);
  }

  function selectVehicle(id: string) {
    previewCtl.cancel();
    setPreviewState({ target: null, at: viewKey });
    setSelectedVisitId(null);
    setSelectedId(id);
    scrollToMap();
  }
  function selectVisit(id: string) {
    previewCtl.cancel();
    setPreviewState({ target: null, at: viewKey });
    setSelectedId(null);
    setSelectedVisitId(id);
    scrollToMap();
  }

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

      <div className="mb-3 flex flex-col gap-2">
        {shownJobFilters.length > 0 && (
          <FilterRow label="Job type" testId="fleet-job-filters">
            <FilterChip active={types.length === 0} onClick={() => setFilters([], vehicleFilters)} count={data?.visits.length ?? 0}>All</FilterChip>
            {shownJobFilters.map((key) => (
              <FilterChip
                key={key}
                active={types.includes(key)}
                onClick={() => setFilters(toggleFilter(types, key), vehicleFilters)}
                count={jobCounts[key]}
                swatch={key === "warranty" || key === "service" ? undefined : jobSiteFill(key)}
              >
                {JOB_FILTER_LABEL[key]}
              </FilterChip>
            ))}
          </FilterRow>
        )}
        <FilterRow label="Vehicles" testId="fleet-vehicle-filters">
          <FilterChip active={vehicleFilters.length === 0} onClick={() => setFilters(types, [])} count={data?.vehicles.length ?? 0}>All</FilterChip>
          {VEHICLE_FILTER_ORDER.map((key) => (
            <FilterChip
              key={key}
              active={vehicleFilters.includes(key)}
              onClick={() => setFilters(types, toggleFilter(vehicleFilters, key))}
              count={vehicleCounts[key]}
            >
              {VEHICLE_FILTER_LABEL[key]}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      <div className="card mb-4 min-w-0 overflow-hidden">
        <div className="h-[320px] w-full min-w-0 md:h-[520px]">
          {loading && !filtered ? <div className="grid h-full place-items-center text-sm text-muted">Loading map…</div> : (
            <FleetMapCanvas
              data={filtered}
              selectedId={selectedId}
              onSelect={selectVehicle}
              selectedVisitId={selectedVisitId}
              onSelectVisit={selectVisit}
              previewVehicleId={preview?.kind === "vehicle" ? preview.id : null}
              previewVisitId={preview?.kind === "visit" ? preview.id : null}
              viewKey={viewKey}
              className="h-full"
            />
          )}
        </div>
      </div>

      <section className="mb-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Vehicles</h2>
          <span className="text-xs text-muted">{filtered?.vehicles.length ?? 0}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="fleet-vehicle-list">
          {!filtered?.vehicles.length && <div className="card p-5 text-sm text-muted md:col-span-2 xl:col-span-3">{loading ? "Loading…" : "No vehicles to show."}</div>}
          {filtered?.vehicles.map((v) => {
            const highlighted = selectedId === v.id || (preview?.kind === "vehicle" && preview.id === v.id);
            return (
              <div
                key={v.id}
                data-testid={`fleet-vehicle-card-${v.id}`}
                onPointerEnter={onPreviewEnter({ kind: "vehicle", id: v.id })}
                onPointerLeave={onPreviewLeave}
                className={`card min-w-0 ${highlighted ? "ring-2 ring-brand/40" : ""}`}
              >
                <VehicleRow v={v} selected={highlighted} onSelect={() => selectVehicle(v.id)} admin={admin} team={team} mapping={mapByDevice.get(v.id)} />
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Jobs / Projects</h2>
          <span className="text-xs text-muted">{filtered?.visits.length ?? 0}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="fleet-job-list">
          {!filtered?.visits.length && <div className="card p-5 text-sm text-muted md:col-span-2">{loading && !data ? "Loading…" : "No job sites to show."}</div>}
          {filtered?.visits.map((v) => {
            const highlighted = selectedVisitId === v.jobId || (preview?.kind === "visit" && preview.id === v.jobId);
            return (
              <JobRow
                key={v.jobId}
                v={v}
                selected={highlighted}
                onSelect={() => selectVisit(v.jobId)}
                onPointerEnter={onPreviewEnter({ kind: "visit", id: v.jobId })}
                onPointerLeave={onPreviewLeave}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function scrollToMap() {
  document.querySelector("[data-testid='fleet-map']")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function FilterRow({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5" role="group" aria-label={label} data-testid={testId}>
      {children}
    </div>
  );
}

function FilterChip({ active, onClick, count, swatch, children }: { active: boolean; onClick: () => void; count?: number; swatch?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${active ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:text-ink"}`}
    >
      {swatch && <span className="size-2 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: swatch }} aria-hidden />}
      {children}
      {count != null && <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20" : "bg-canvas"}`}>{count}</span>}
    </button>
  );
}

function VehicleRow({ v, selected, onSelect, admin, team, mapping }: { v: FleetVehicle; selected: boolean; onSelect: () => void; admin: boolean; team: TeamMember[]; mapping?: FleetVehicleRow }) {
  return (
    <div className={`px-4 py-3 ${selected ? "bg-brand-50/60" : ""}`}>
      <button type="button" onClick={onSelect} className="flex w-full min-w-0 items-start gap-3 text-left">
        <span className="mt-1 size-2.5 shrink-0 rounded-full" style={vehicleStatusDotStyle(v.status)} data-testid="fleet-status-dot" data-status={v.status} />
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
            <select name="assignee" data-testid="fleet-assign-select" defaultValue={selectedFleetAssigneeValue(mapping, v.profile?.id)} className="input text-sm" aria-label={`Assign ${vehicleTitle(v)}`}>
              <option value="">Unassigned</option>
              {team.map((m) => <option key={fleetAssigneeOptionValue(m)} value={fleetAssigneeOptionValue(m)}>{fleetAssigneeOptionLabel(m)}</option>)}
            </select>
            <SubmitButton className="btn btn-sm">Save</SubmitButton>
          </form>
          <SuggestedMapping v={v} team={team} mapping={mapping} />
        </div>
      )}
    </div>
  );
}

function JobRow({ v, selected, onSelect, onPointerEnter, onPointerLeave }: { v: FleetVisitPin; selected: boolean; onSelect: () => void; onPointerEnter?: (e: ReactPointerEvent<HTMLDivElement>) => void; onPointerLeave?: (e: ReactPointerEvent<HTMLDivElement>) => void }) {
  return (
    <div data-testid={`fleet-job-card-${v.jobId}`} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} className={`card min-w-0 ${selected ? "ring-2 ring-brand/40 bg-brand-50/60" : ""}`}>
      <div className="flex w-full min-w-0 flex-col gap-1.5 px-4 py-3 text-left hover:bg-[#fafbf9]">
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-col gap-1.5 text-left">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{v.customerName}</div>
              <div className="truncate text-[12.5px] text-muted">{v.projectName || v.title}</div>
            </div>
            <JobStatusPill status={v.status} />
          </div>
          <div className="flex min-w-0 items-center gap-1 text-[12.5px] text-muted">
            <Icon name="pin" className="size-3.5 shrink-0" />
            <span className="truncate">{v.address || "No address on file"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeTag type={v.projectType} />
            <JobKindBadge kind={v.kind} size="sm" />
            <span className="text-[12.5px] text-muted">{fmtRange(v.startsAt, v.endsAt)}</span>
          </div>
        </button>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={onSelect} className="min-w-0 text-left"><AvatarStack people={v.assignees} /></button>
          {v.projectId && (
            <Link href={`/projects/${v.projectId}`} className="text-[12.5px] font-semibold text-brand hover:underline">
              View project
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestedMapping({ v, team, mapping }: { v: FleetVehicle; team: TeamMember[]; mapping?: FleetVehicleRow }) {
  if (mapping?.profile_id || mapping?.invite_email || v.profile) return null;
  const suggestion = suggestFleetAssignee(v.name, team);
  if (!suggestion) return null;
  return (
    <form action={setFleetMapping}>
      <input type="hidden" name="geotab_device_id" value={v.id} />
      <input type="hidden" name="label" value={mapping?.label ?? ""} />
      <input type="hidden" name="assignee" value={fleetAssigneeOptionValue(suggestion)} />
      <button type="submit" data-testid="suggested-mapping" className="text-[12.5px] font-semibold text-brand hover:underline">
        Suggested: {fleetAssigneeOptionLabel(suggestion)}
      </button>
    </form>
  );
}
