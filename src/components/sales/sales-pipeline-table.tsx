"use client";
import Link from "next/link";
import { useMemo, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import {
  formatDealValue,
  ghostPointerOffset,
  moveStageConfirmText,
  type StageDragGhost,
} from "@/lib/sales/pipeline-table-drag";
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

function blockNativeDrag(e: DragEvent) {
  e.preventDefault();
}

function DragHandle({ deal, onPointerDown }: { deal: SalesDeal; onPointerDown: (deal: SalesDeal, e: ReactPointerEvent) => void }) {
  return (
    <button
      type="button"
      draggable={false}
      className="inline-flex shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted hover:text-ink active:cursor-grabbing"
      aria-label={`Drag ${dealHeadline(deal)} to another stage`}
      data-testid={`sales-deal-handle-${deal.id}`}
      onDragStart={blockNativeDrag}
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
      <div className="absolute right-0 z-30 mt-1 max-h-[min(70vh,22rem)] min-w-[220px] overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg md:left-0 md:right-auto">
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

function DealDragGhost({
  ghost,
  deal,
  stage,
  ownerName,
  ownerColor,
  ownerAvatar,
  bindEl,
}: {
  ghost: StageDragGhost;
  deal: SalesDeal | undefined;
  stage: StageDef | undefined;
  ownerName: string;
  ownerColor: string;
  ownerAvatar?: string | null;
  bindEl: (el: HTMLDivElement | null) => void;
}) {
  const value = formatDealValue(deal?.value ?? 0);
  const off = ghostPointerOffset(ghost.width);
  const node = (
    <div
      ref={bindEl}
      data-testid="sales-deal-drag-ghost"
      className="pointer-events-none fixed z-[80] flex items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2 shadow-[0_12px_28px_rgba(16,24,20,.2)]"
      style={{
        left: ghost.x - off.x,
        top: ghost.y - off.y,
        width: ghost.width,
        maxWidth: "min(520px, calc(100vw - 24px))",
        transform: "rotate(-1.5deg)",
        willChange: "left, top",
      }}
    >
      <Icon name="grip" className="size-3.5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">{ghost.headline}</div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-muted">
          {deal?.owner_id ? <Avatar name={ownerName} color={ownerColor} size="sm" src={ownerAvatar} /> : null}
          <span className="truncate">{ownerName}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {stage ? (
          <span
            className="inline-flex max-w-[148px] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10.5px] font-bold"
            style={{ background: stage.bg, color: stage.color }}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: stage.color }} />
            <span className="truncate">{stage.name}</span>
          </span>
        ) : null}
        {value ? <span className="text-[12px] font-bold tabular-nums text-ink">{value}</span> : null}
      </div>
    </div>
  );
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}

function InsertLine({ slug, mobile = false }: { slug: string; mobile?: boolean }) {
  return mobile ? (
    <div className="relative mb-1 h-0" data-testid={`sales-stage-insert-mobile-${slug}`}>
      <div className="absolute inset-x-2 -top-px h-[3px] rounded-full bg-brand" />
    </div>
  ) : (
    <tr data-testid={`sales-stage-insert-${slug}`}>
      <td colSpan={10} className="p-0">
        <div className="relative h-0">
          <div className="absolute inset-x-2 -top-px h-[3px] rounded-full bg-brand" />
        </div>
      </td>
    </tr>
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
          onDragStart: blockNativeDrag,
        }
      : {};

  const ghostDeal = drag.ghost ? drag.localDeals.find((d) => d.id === drag.ghost!.dealId) : undefined;
  const ghostStage = ghostDeal ? stages.find((s) => s.slug === ghostDeal.stage_slug) : undefined;

  return (
    <>
      {drag.error && (
        <div className="mb-3" role="alert">
          <Banner tone="error">{drag.error}</Banner>
        </div>
      )}

      {/* Desktop / tablet grouped table */}
      <div
        className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,20,.05)] md:block"
        data-testid="sales-pipeline-table"
        onDragStart={blockNativeDrag}
      >
        <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]" draggable={false}>
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
                data-dropping={dropping ? "true" : undefined}
                className={dropping ? "bg-brand-50/60" : undefined}
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
                  insertLine={dropping ? <InsertLine slug={g.stage.slug} /> : null}
                >
                  {visible.map((d) => {
                    const name = ownerName(d.owner_id);
                    const days = dealLengthDays(d);
                    const isDrag = drag.draggingId === d.id;
                    return (
                      <tr
                        key={d.id}
                        draggable={false}
                        className={`hover:bg-[#fafbf9] ${drag.enabled ? "cursor-grab active:cursor-grabbing" : ""} ${isDrag ? "opacity-35" : ""}`}
                        data-testid={`sales-deal-row-${d.id}`}
                        data-dragging={isDrag ? "true" : undefined}
                        {...rowPointer(d)}
                      >
                        <td className={`sticky left-0 z-10 px-2 py-2 shadow-[1px_0_0_var(--color-line)] ${isDrag ? "bg-[#f3f4f2]" : "bg-white"}`}>
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
      <div className="flex flex-col gap-3 md:hidden" data-testid="sales-pipeline-cards" onDragStart={blockNativeDrag}>
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
              data-dropping={dropping ? "true" : undefined}
              className={`rounded-xl ${dropping ? "bg-brand-50" : ""}`}
            >
              <button
                type="button"
                onClick={() => toggle(g.stage.slug)}
                className={`mb-2 flex w-full items-center gap-2 text-left ${dropping ? "rounded-t-xl bg-brand-50 px-1 py-1" : ""}`}
                aria-expanded={expanded}
                data-testid={`sales-stage-toggle-${g.stage.slug}`}
              >
                <span className="h-5 w-1.5 shrink-0 rounded-sm" style={{ background: g.stage.color }} />
                <Icon name="right" className={`size-3.5 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`} />
                <span className="text-[13.5px] font-bold">{g.stage.name}</span>
                <span className="text-[12.5px] text-muted">{g.deals.length}{g.deals.length ? ` · avg ${avgDaysOpen(g.deals)}d` : ""}</span>
              </button>
              {dropping ? <InsertLine slug={g.stage.slug} mobile /> : null}
              {expanded && visible.map((d) => {
                const name = ownerName(d.owner_id);
                const days = dealLengthDays(d);
                const isDrag = drag.draggingId === d.id;
                return (
                  <div
                    key={d.id}
                    draggable={false}
                    className={`mb-2 flex items-stretch rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,20,.04)] ${isDrag ? "opacity-35 bg-[#f3f4f2]" : ""}`}
                    data-testid={`sales-deal-card-${d.id}`}
                    data-dragging={isDrag ? "true" : undefined}
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
        <DealDragGhost
          ghost={drag.ghost}
          deal={ghostDeal}
          stage={ghostStage}
          ownerName={ownerName(ghostDeal?.owner_id ?? null)}
          ownerColor={ghostDeal?.owner_id ? ownerColors[ghostDeal.owner_id] ?? "#0f766e" : "#0f766e"}
          ownerAvatar={ghostDeal?.owner_id ? ownerAvatars[ghostDeal.owner_id] : null}
          bindEl={drag.bindGhostEl}
        />
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
  stage, count, avg, expanded, onToggle, hidden, onShowMore, dropping, insertLine, children,
}: {
  stage: StageDef;
  count: number;
  avg: number;
  expanded: boolean;
  onToggle: () => void;
  hidden: number;
  onShowMore: () => void;
  dropping?: boolean;
  insertLine?: ReactNode;
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
      {insertLine}
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
