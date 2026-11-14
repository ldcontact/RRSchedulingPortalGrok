"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { countActiveServiceFilters } from "@/lib/service-request-filters";
import {
  SR_CHANNEL_LABEL,
  WARRANTY_LABEL,
  type Person,
  type SRChannel,
  type SRPageFilter,
  type WarrantyState,
} from "@/lib/types";

const CHANNELS: SRChannel[] = ["call", "email", "other"];
const WARRANTIES: WarrantyState[] = ["in", "out", "unknown"];

export function MobileServiceFilters({
  status,
  q,
  channel,
  warranty,
  assignee,
  staffPeople,
  clearHref,
}: {
  status: SRPageFilter["status"];
  q: string;
  channel?: SRChannel;
  warranty?: WarrantyState;
  assignee: string;
  staffPeople: Pick<Person, "id" | "full_name">[];
  clearHref: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const count = countActiveServiceFilters({ channel, warranty, assignee });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <form className="mb-3 flex gap-2 sm:hidden" role="search" action="/service-requests" method="get">
        {status && status !== "open" && <input type="hidden" name="status" value={status} />}
        {channel && <input type="hidden" name="channel" value={channel} />}
        {warranty && <input type="hidden" name="warranty" value={warranty} />}
        {assignee && <input type="hidden" name="assignee" value={assignee} />}
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-white px-3">
          <button type="submit" className="grid shrink-0 place-items-center text-muted" aria-label="Search">
            <Icon name="search" className="size-4" />
          </button>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search tickets…"
            className="w-full bg-transparent py-2 text-sm outline-none"
            type="search"
            aria-label="Search service requests"
          />
        </div>
        <button
          type="button"
          className={`relative grid size-10 shrink-0 place-items-center rounded-lg border bg-white ${count ? "border-brand text-brand" : "border-line text-ink"}`}
          aria-label={count ? `Filters, ${count} active` : "Filters"}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-testid="filters-button"
          onClick={() => setOpen(true)}
        >
          <Icon name="funnel" className="size-4" />
          {count > 0 && (
            <span
              data-testid="filters-badge"
              className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-none text-white"
            >
              {count}
            </span>
          )}
        </button>
      </form>

      {open && (
        <div
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/45 sm:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="filters-sheet"
        >
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close filters" onClick={() => setOpen(false)} tabIndex={-1} />
          <div className="relative w-full rounded-t-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
              <h2 id={titleId} className="text-[17px] font-semibold">Filters</h2>
              <button
                ref={closeBtnRef}
                type="button"
                className="grid size-9 place-items-center rounded-lg border border-line hover:bg-[#fafbf9]"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <Icon name="x" className="size-4" />
              </button>
            </div>
            <form className="flex flex-col gap-3 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" action="/service-requests" method="get">
              {status && status !== "open" && <input type="hidden" name="status" value={status} />}
              {q && <input type="hidden" name="q" value={q} />}
              <label className="block text-[12.5px] font-semibold text-muted">
                Channel
                <select name="channel" defaultValue={channel ?? ""} className="input mt-1 font-semibold text-ink" aria-label="Channel">
                  <option value="">All</option>
                  {CHANNELS.map((c) => (
                    <option key={c} value={c}>{SR_CHANNEL_LABEL[c]}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[12.5px] font-semibold text-muted">
                Warranty
                <select name="warranty" defaultValue={warranty ?? ""} className="input mt-1 font-semibold text-ink" aria-label="Warranty">
                  <option value="">All</option>
                  {WARRANTIES.map((w) => (
                    <option key={w} value={w}>{WARRANTY_LABEL[w]}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[12.5px] font-semibold text-muted">
                Assignee
                <select name="assignee" defaultValue={assignee} className="input mt-1 font-semibold text-ink" aria-label="Assignee">
                  <option value="">Anyone</option>
                  <option value="me">Assigned to me</option>
                  <option value="none">Unassigned</option>
                  {staffPeople.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </label>
              <div className="mt-1 flex gap-2">
                <button type="submit" className="btn btn-primary flex-1" data-testid="filters-apply">Apply</button>
                {count > 0 || q ? (
                  <Link href={clearHref} className="btn flex-1 text-center" data-testid="filters-clear">Clear</Link>
                ) : (
                  <button type="button" className="btn flex-1" onClick={() => setOpen(false)}>Cancel</button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
