"use client";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Avatar } from "@/components/ui";
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
import { dealLengthDays, type SalesDeal } from "@/lib/sales/types";

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

export function SalesPipelineTable({
  deals,
  stages,
  owners,
  ownerColors = {},
  ownerAvatars = {},
}: {
  deals: SalesDeal[];
  stages: StageDef[];
  owners: Record<string, string>;
  ownerColors?: Record<string, string>;
  ownerAvatars?: Record<string, string | null>;
}) {
  const groups = useMemo(() => groupDealsByStage(deals, stages), [deals, stages]);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.stage.slug, !defaultCollapsed(g.stage, g.deals.length)])),
  );
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  const toggle = (slug: string) => setOpen((s) => ({ ...s, [slug]: !s[slug] }));
  const ownerName = (id: string | null) => (id ? owners[id] ?? "Unknown" : "Unassigned");

  return (
    <>
      {/* Desktop / tablet grouped table */}
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,20,.05)] md:block" data-testid="sales-pipeline-table">
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
          <tbody>
            {deals.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted">No deals in this pipeline yet. LED Lighting and HVAC start empty on purpose.</td>
              </tr>
            )}
            {groups.map((g) => {
              const expanded = !!open[g.stage.slug];
              const all = !!showAll[g.stage.slug];
              const visible = expanded ? (all ? g.deals : g.deals.slice(0, PREVIEW_ROWS)) : [];
              const hidden = expanded && !all ? Math.max(0, g.deals.length - PREVIEW_ROWS) : 0;
              const avg = avgDaysOpen(g.deals);
              return (
                <StageTableGroup
                  key={g.stage.slug}
                  stage={g.stage}
                  count={g.deals.length}
                  avg={avg}
                  expanded={expanded}
                  onToggle={() => toggle(g.stage.slug)}
                  hidden={hidden}
                  onShowMore={() => setShowAll((s) => ({ ...s, [g.stage.slug]: true }))}
                >
                  {visible.map((d) => {
                    const name = ownerName(d.owner_id);
                    const days = dealLengthDays(d);
                    return (
                      <tr key={d.id} className="hover:bg-[#fafbf9]" data-testid={`sales-deal-row-${d.id}`}>
                        <td className="sticky left-0 z-10 bg-white px-2 py-2 shadow-[1px_0_0_var(--color-line)]">
                          <Link href={`/sales/deals/${d.id}`} className="block truncate font-semibold text-ink hover:text-brand">{dealHeadline(d)}</Link>
                          <div className="truncate text-xs text-muted">{dealCustomerName(d) || "—"}</div>
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
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile 390 grouped cards */}
      <div className="flex flex-col gap-3 md:hidden" data-testid="sales-pipeline-cards">
        {deals.length === 0 && <div className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-sm text-muted">No deals in this pipeline yet.</div>}
        {groups.map((g) => {
          const expanded = !!open[g.stage.slug];
          const all = !!showAll[g.stage.slug];
          const visible = expanded ? (all ? g.deals : g.deals.slice(0, PREVIEW_ROWS)) : [];
          const hidden = expanded && !all ? Math.max(0, g.deals.length - PREVIEW_ROWS) : 0;
          if (!expanded && g.deals.length === 0) {
            // still show empty late/empty headers so the pipeline is complete, but keep them compact
          }
          return (
            <div key={g.stage.slug}>
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
                return (
                  <Link
                    key={d.id}
                    href={`/sales/deals/${d.id}`}
                    className="mb-2 block rounded-xl border border-line bg-white p-3 shadow-[0_1px_2px_rgba(16,24,20,.04)]"
                    data-testid={`sales-deal-card-${d.id}`}
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
    </>
  );
}

function StageTableGroup({
  stage, count, avg, expanded, onToggle, hidden, onShowMore, children,
}: {
  stage: StageDef;
  count: number;
  avg: number;
  expanded: boolean;
  onToggle: () => void;
  hidden: number;
  onShowMore: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <tr className="ghead">
        <td colSpan={10} className="bg-[#f7f8f6] p-0">
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
