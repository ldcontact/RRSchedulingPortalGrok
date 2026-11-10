import Link from "next/link";
import { Icon } from "@/components/icons";

/** Page numbers to show: first, last, and a window around the current page ("…" gaps). */
function pageList(page: number, last: number): (number | "gap")[] {
  const set = new Set([1, last, page - 1, page, page + 1].filter((n) => n >= 1 && n <= last));
  const nums = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push("gap"); out.push(n); });
  return out;
}

export function showingText(page: number, size: number, total: number) {
  if (!total) return "Showing 0 of 0";
  const from = (page - 1) * size + 1, to = Math.min(total, page * size);
  return `Showing ${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
}

/** Server-rendered previous/next + page links; every page is a URL so refresh and back work. */
export function Pager({ page, size, total, href, label }: { page: number; size: number; total: number; href: (page: number) => string; label: string }) {
  const last = Math.max(1, Math.ceil(total / size));
  const base = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-semibold";
  const btn = `${base} border-line bg-white hover:bg-[#fafbf9]`;
  const off = `${btn} pointer-events-none opacity-40`;
  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-label={`${label} pages`}>
      <div className="text-sm text-muted" data-testid="showing">{showingText(page, size, total)}</div>
      {last > 1 && (
        <div className="flex items-center gap-1">
          {page > 1 ? <Link className={btn} href={href(page - 1)} rel="prev" aria-label="Previous page"><Icon name="left" className="size-4" /><span className="ml-1 hidden sm:inline">Previous</span></Link>
            : <span className={off} aria-disabled="true"><Icon name="left" className="size-4" /><span className="ml-1 hidden sm:inline">Previous</span></span>}
          <span className="px-2 text-sm text-muted sm:hidden">{page} / {last}</span>
          <div className="hidden items-center gap-1 sm:flex">
            {pageList(page, last).map((n, i) => n === "gap"
              ? <span key={`g${i}`} className="px-1 text-muted">…</span>
              : <Link key={n} href={href(n)} aria-current={n === page ? "page" : undefined}
                  className={n === page ? `${base} border-brand bg-brand text-white` : btn}>{n}</Link>)}
          </div>
          {page < last ? <Link className={btn} href={href(page + 1)} rel="next" aria-label="Next page"><span className="mr-1 hidden sm:inline">Next</span><Icon name="right" className="size-4" /></Link>
            : <span className={off} aria-disabled="true"><span className="mr-1 hidden sm:inline">Next</span><Icon name="right" className="size-4" /></span>}
        </div>
      )}
    </nav>
  );
}

export const pageParam = (v: unknown) => { const n = Number(typeof v === "string" ? v : 1); return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1; };
