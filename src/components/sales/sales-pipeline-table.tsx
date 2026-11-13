"use client";
import Link from "next/link";
import { useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { Banner, Avatar } from "@/components/ui";
import type { StageDef } from "@/lib/sales/catalog";
import {
  avgDaysOpen,
  defaultCollapsed,
  dealCustomerName,
  dealHeadline,
  formatLocation,
  groupDealsByStage,
  lengthTone,
  PREVIEW_ROWS,
} from "@/lib/sales/pipeline-table";
import { moveStageConfirmText } from "@/lib/sales/pipeline-table-drag";
import { dealLengthDays, type SalesDeal } from "@/lib/sales/types";
import { usePipelineStageDrag } from "./use-pipeline-stage-drag";

function fmtDay(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  return d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
}

function Pri({ p }: { p: string }) {
  const tone = p === "High" ? "text-[#9a3412] bg-[#ffedd5]" : p === "Low" ? "bg-slate-100 text-slate-600" : "text-[#3f6212] bg-[#ecfccb]";
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{p}</span>;
}

function Length({ days }: { days: number }) {
  const hot = lengthTone(days) === "hot";
  return <span className={`font-semibold tabular-nums ${hot ? "text-[#b45309]" : ""}`}>{days}d</span>;
}

function DragHandle({ deal, onPointerDown }: { deal: SalesDeal; onPointerDown: (deal: SalesDeal, e: ReactPointerEvent) => void }) {
  return (
    <button
      type="button"
      className="inline-flex shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted hover:text-ink active:cursor-grabbing"
      aria-label={`Drag ${dealHeadline(deal)} to another stage`}
      data-testid={`sales-deal-handle-${deal.id}`}
      onPointerDown={(e) => onPointerDown(deal, e)}
    >
      <Icon name="grip" className="size-3.5" />
    </button>
  );
}

function MoveToStageMenu({
  deal,
  stages,
  onPick,
}: {
  deal: SalesDeal;
  stages: StageDef[];
  onPick: (deal: SalesDeal, slug: string) => void;
}) {
  return (
    <details className="relative" data-no-drag data-testid={`sales-deal-move-${deal.id}`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <summary
        className="flex size-6 cursor-pointer list-none items-center justify-center rounded text-muted hover:bg-[#f0f2ef] hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label={`Move ${dealHeadline(deal)} to another stage`}
      >
        <Icon name="more" className="size-3.5" />
      </summary>
      <div className="absolute left-0 z-30 mt-1 min-w-[220px] rounded-lg border border-line bg-white py-1 shadow-lg">
        <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-muted">Move to stage</div>
        {stages.map((s) => {
          const on = s.slug === deal.stage_slug;
          return (
            <button
              key={s.slug}
              type="button"
              disabled={on}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] font-semibold hover:bg-[#fafbf9] disabled:cursor-default disabled:text-muted disabled:hover:bg-white"
              onClick={() => onPick(deal, s.slug)}
            >
              <span className="h-3 w-1 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              {on ? <span className="text-[11px] font-normal">Current</span> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}

export function SalesPipelineTable({
  deals,
  stages,
  owners,
  ownerColors = {},
  ownerAvatars = {},
  onMoveStage,
}: {
  deals: SalesDeal[];
  stages: StageDef[];
  owners: Record<string, string>;
  ownerColors?: Record<string, string>;
  ownerAvatars?: Record<string, string | null>;
  onMoveStage?: (dealId: string, stage: string) => Promise<void>;
}) {
  const drag = usePipelineStageDrag({ deals, stages, onMoveStage });
  const groups = useMemo(() => groupDealsByStage(drag.localDeals, stages), [drag.localDeals, stages]);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.stage.slug, !defaultCollapsed(g.stage, g.deals.length)])),
  );
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  const toggle = (slug: string) => setOpen((s) => ({ ...s, [slug]: !s[slug] }));
  const ownerName = (id: string | null) => (id ? owners[id] ?? "Unknown" : "Unassigned");
  const isExpanded = (slug: string) => !!open[slug] || drag.pending?.toSlug === slug;
  const showsAll = (slug: string) => !!showAll[slug] || drag.pending?.toSlug === slug;

  const rowPointer = (d: SalesDeal) =>
    drag.enabled
      ? {
          onPointerDown: (e: ReactPointerEvent) => drag.onPointerDown(d, e),
          onClickCapture: drag.onRowClickCapture,
        }
      : {};

  return (
    <>
      {drag.error && (
        <div className="mb-3" role="alert">
          <Banner tone="error">{drag.error}</Banner>
        </div>
      )}

      {/* Desktop / tablet grouped table */}
      <div className={`hidden overflow-x-auto rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,20,.05)] md:block ${drag.draggingId ? "select-none" : ""}`} data-testid="sales-pipeline-table">
        <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[13%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
          </colgroup>
          <thead>
            <tr className="bg-[#fafbf9] text-left text-[10.5px] font-bold tracking-wide text-muted uppercase">
              <th className="sticky left-0 z-20 bg-[#fafbf9] px-2 py-2 shadow-[1px_0_0_var(--color-line)]">Deal</th>
              <th className="px-1.5 py-2">Owner</th>
              <th className="px-1.5 py-2">Contacts</th>
              <th className="px-1.5 py-2">Location</th>
              <th className="px-1.5 py-2">Priority</th>
              <th className="px-1.5 py-2">Pics</th>
              <th className="px-1.5 py-2">Assess.</th>
              <th className="px-1.5 py-2">Length</th>
              <th className="px-1.5 py-2">Scheduled</th>
              <th className="px-1.5 py-2">Created</th>
            </tr>
          </thead>
          {deals.length === 0 && drag.localDeals.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted">No deals in this pipeline yet. LED Lighting and HVAC start empty on purpose.</td>
              </tr>
            </tbody>
          )}
          {groups.map((g) => {
            const expanded = isExpanded(g.stage.slug);
            const all = showsAll(g.stage.slug);
            const visible = expanded ? (all ? g.deals : g.deals.slice(0, PREVIEW_ROWS)) : [];
            const hidden = expanded && !all ? Math.max(0, g.deals.length - PREVIEW_ROWS) : 0;
            const avg = avgDaysOpen(g.deals);
            const dropping = drag.overSlug === g.stage.slug;
            return (
              <tbody
                key={g.stage.slug}
                data-stage-drop={g.stage.slug}
                data-testid={`sales-stage-drop-${g.stage.slug}`}
                className={dropping ? "bg-brand-50/70 outline outline-2 outline-offset-[-2px] outline-brand" : undefined}
              >
                <StageTableGroup
                  stage={g.stage}
                  count={g.deals.length}
                  avg={avg}
                  expanded={expanded}
                  onToggle={() => toggle(g.stage.slug)}
                  hidden={hidden}
                  onShowMore={() => setShowAll((s) => ({ ...s, [g.stage.slug]: true }))}
                  dropping={dropping}
                >
                  {visible.map((d) => {
                    const name = ownerName(d.owner_id);
                    const days = dealLengthDays(d);
                    const isDrag = drag.draggingId === d.id;
                    return (
                      <tr
                        key={d.id}
                        className={`hover:bg-[#fafbf9] ${drag.enabled ? "cursor-grab active:cursor-grabbing" : ""} ${isDrag ? "opacity-40" : ""}`}
                        data-testid={`sales-deal-row-${d.id}`}
                        {...rowPointer(d)}
                      >
                        <td className="sticky left-0 z-10 bg-white px-2 py-2 shadow-[1px_0_0_var(--color-line)]">
                          <div className="flex items-start gap-1">
                            {drag.enabled ? <DragHandle deal={d} onPointerDown={drag.onHandlePointerDown} /> : null}
                            <div className="min-w-0 flex-1">
                              <Link href={`/sales/deals/${d.id}`} className="block truncate font-semibold text-ink hover:text-brand" draggable={false}>{dealHeadline(d)}</Link>
                              <div className="truncate text-xs text-muted">{dealCustomerName(d) || "—"}</div>
                            </div>
                            {drag.enabled ? <MoveToStageMenu deal={d} stages={stages} onPick={drag.requestMove} /> : null}
                          </div>
                        </td>
                        <td className="px-1.5 py-2">
                          <span className="inline-flex max-w-full items-center gap-1.5 font-semibold">
                            {d.owner_id ? <Avatar name={name} color={ownerColors[d.owner_id] ?? "#0f766e"} size="sm" src={ownerAvatars[d.owner_id]} /> : null}
                            <span className="min-w-0 truncate">{name}</span>
                          </span>
                        </td>
                        <td className="px-1.5 py-2">
                          <div className="truncate">{dealCustomerName(d) || "—"}</div>
                          {d.contact_phone ? <div className="truncate text-xs text-muted">{d.contact_phone}</div> : null}
                        </td>
                        <td className="px-1.5 py-2 whitespace-normal text-[13px] leading-tight">{formatLocation(d)}</td>
                        <td className="px-1.5 py-2"><Pri p={d.priority} /></td>
                        <td className="px-1.5 py-2">
                          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted" title="Photo counts are not stored on deals yet">
                            <Icon name="camera" className="size-3.5" />—
                          </span>
                        </td>
                        <td className="px-1.5 py-2 whitespace-nowrap">{fmtDay(d.assessment_date)}</td>
                        <td className="px-1.5 py-2"><Length days={days} /></td>
                        <td className="px-1.5 py-2 whitespace-nowrap">{fmtDay(d.scheduled_date)}</td>
                        <td className="px-1.5 py-2 whitespace-nowrap">{fmtDay(d.created_at)}</td>
                      </tr>
                    );
                  })}
                </StageTableGroup>
              </tbody>
            );
          })}
        </table>
      </div>

      {/* Mobile 390 grouped cards */}
      <div className={`flex flex-col gap-3 md:hidden ${drag.draggingId ? "select-none" : ""}`} data-testid="sales-pipeline-cards">
        {deals.length === 0 && drag.localDeals.length === 0 && <div className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-sm text-muted">No deals in this pipeline yet.</div>}
        {groups.map((g) => {
          const expanded = isExpanded(g.stage.slug);
          const all = showsAll(g.stage.slug);
          const visible = expanded ? (all ? g.deals : g.deals.slice(0, PREVIEW_ROWS)) : [];
          const hidden = expanded && !all ? Math.max(0, g.deals.length - PREVIEW_ROWS) : 0;
          const dropping = drag.overSlug === g.stage.slug;
          return (
            <div
              key={g.stage.slug}
              data-stage-drop={g.stage.slug}
              data-testid={`sales-stage-drop-mobile-${g.stage.slug}`}
              className={`rounded-xl ${dropping ? "bg-brand-50 outline outline-2 outline-brand" : ""}`}
            >
              <button
                type="button"
                onClick={() => toggle(g.stage.slug)}
                className="mb-2 flex w-full items-center gap-2 text-left"
                aria-expanded={expanded}
                data-testid={`sales-stage-toggle-${g.stage.slug}`}
              >
                <span className="h-5 w-1.5 shrink-0 rounded-sm" style={{ background: g.stage.color }} />
                <Icon name="right" className={`size-3.5 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`} />
                <span className="text-[13.5px] font-bold">{g.stage.name}</span>
                <span className="text-[12.5px] text-muted">{g.deals.length}{g.deals.length ? ` · avg ${avgDaysOpen(g.deals)}d` : ""}</span>
              </button>
              {expanded && visible.map((d) => {
                const name = ownerName(d.owner_id);
                const days = dealLengthDays(d);
                const isDrag = drag.draggingId === d.id;
                return (
                  <div
                    key={d.id}
                    className={`mb-2 flex items-stretch rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,20,.04)] ${isDrag ? "opacity-40" : ""}`}
                    data-testid={`sales-deal-card-${d.id}`}
                    {...rowPointer(d)}
                  >
                    {drag.enabled ? (
                      <div className="flex items-center pl-1.5">
                        <DragHandle deal={d} onPointerDown={drag.onHandlePointerDown} />
                      </div>
                    ) : null}
                    <Link
                      href={`/sales/deals/${d.id}`}
                      className="min-w-0 flex-1 p-3"
                      draggable={false}
                      onClickCapture={drag.onRowClickCapture}
                    >
                      <div className="font-semibold">{dealHeadline(d)}</div>
                      <div className="text-[12.5px] text-muted">{[dealCustomerName(d) || null, d.city].filter(Boolean).join(" · ")}</div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                          {d.owner_id ? <Avatar name={name} color={ownerColors[d.owner_id] ?? "#0f766e"} size="sm" src={ownerAvatars[d.owner_id]} /> : null}
                          {name.split(" ")[0]}
                        </span>
                        <span className="flex items-center gap-2">
                          <Pri p={d.priority} />
                          <Length days={days} />
                        </span>
                      </div>
                    </Link>
                    {drag.enabled ? (
                      <div className="flex items-start pr-1.5 pt-2">
                        <MoveToStageMenu deal={d} stages={stages} onPick={drag.requestMove} />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {hidden > 0 && (
                <button type="button" className="mb-2 text-[12.5px] font-semibold text-muted" onClick={() => setShowAll((s) => ({ ...s, [g.stage.slug]: true }))}>
                  +{hidden} more
                </button>
              )}
            </div>
          );
        })}
      </div>

      {drag.ghost && (
        <div
          className="pointer-events-none fixed z-50 max-w-[260px] truncate rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-semibold shadow-lg"
          style={{ left: drag.ghost.x + 12, top: drag.ghost.y + 12 }}
          data-testid="sales-deal-drag-ghost"
        >
          {drag.ghost.headline}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {drag.draggingId ? "Dragging a deal. Drop it on a stage to move it." : drag.pending ? moveStageConfirmText(drag.pending) : ""}
      </div>

      {drag.pending && (
        <Modal title="Move to a different stage?" onClose={drag.saving ? undefined : drag.cancelMove}>
          <div className="flex flex-col gap-4 p-5" data-testid="sales-stage-move-confirm">
            <p className="text-sm">{moveStageConfirmText(drag.pending)}</p>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button type="button" className="btn" onClick={drag.cancelMove} disabled={drag.saving} data-testid="sales-stage-move-cancel">Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void drag.confirmMove()} disabled={drag.saving} data-testid="sales-stage-move-confirm-btn">
                {drag.saving ? "Moving…" : "Move"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function StageTableGroup({
  stage, count, avg, expanded, onToggle, hidden, onShowMore, dropping, children,
}: {
  stage: StageDef;
  count: number;
  avg: number;
  expanded: boolean;
  onToggle: () => void;
  hidden: number;
  onShowMore: () => void;
  dropping?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <tr className="ghead">
        <td colSpan={10} className={`p-0 ${dropping ? "bg-brand-50" : "bg-[#f7f8f6]"}`}>
          <button
            type="button"
            onClick={onToggle}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#f0f2ef]"
            aria-expanded={expanded}
            data-testid={`sales-stage-toggle-${stage.slug}`}
          >
            <span className="h-7 w-1.5 shrink-0 self-stretch rounded-sm" style={{ background: stage.color }} />
            <Icon name="right" className={`size-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`} />
            <span className="text-[13.5px] font-bold">{stage.name}</span>
            <span className="text-[12.5px] text-muted">
              {count} deal{count === 1 ? "" : "s"}{count ? ` · avg ${avg} days` : ""}
            </span>
          </button>
        </td>
      </tr>
      {expanded && children}
      {hidden > 0 && (
        <tr>
          <td colSpan={10} className="bg-[#fafbf9] px-3 py-2 text-[12.5px] font-semibold text-muted">
            <button type="button" onClick={onShowMore} className="hover:text-ink" data-testid={`sales-stage-more-${stage.slug}`}>
              Show {hidden} more in this stage
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
