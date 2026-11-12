"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { searchWorkspaceAction } from "@/app/(app)/search-actions";
import { Icon } from "@/components/icons";
import { useOptionalNavProgress } from "@/components/nav-progress";
import { highlightChunks } from "@/lib/highlight-match";
import { emptyWorkspaceSearch, flattenWorkspaceHits, moveActive } from "@/lib/workspace-search";
import type { WorkspaceSearchHit, WorkspaceSearchResults } from "@/lib/types";

const DEBOUNCE_MS = 250;

const ICONS: Record<WorkspaceSearchHit["kind"], string> = {
  customer: "users",
  project: "briefcase",
  person: "user",
};

function Highlight({ text, query }: { text: string; query: string }) {
  if (!text) return null;
  const chunks = highlightChunks(text, query);
  return (
    <>
      {chunks.map((c, i) =>
        c.match ? <mark key={i} className="rounded-sm bg-amber-100 text-ink">{c.text}</mark> : <span key={i}>{c.text}</span>,
      )}
    </>
  );
}

export function WorkspaceSearch() {
  const router = useRouter();
  const nav = useOptionalNavProgress();
  const titleId = useId();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WorkspaceSearchResults>(emptyWorkspaceSearch);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults(emptyWorkspaceSearch());
    setSearching(false);
    setActive(-1);
    seq.current += 1;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const go = useCallback((hit: WorkspaceSearchHit | undefined) => {
    if (!hit?.href) return;
    close();
    nav?.start();
    router.push(hit.href);
  }, [close, nav, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => {
          if (v) {
            inputRef.current?.focus();
            return v;
          }
          return true;
        });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onQuery(next: string) {
    setQ(next);
    setActive(-1);
    if (timer.current) clearTimeout(timer.current);
    const term = next.trim();
    if (!term) {
      seq.current += 1;
      setResults(emptyWorkspaceSearch());
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++seq.current;
    timer.current = setTimeout(() => {
      searchWorkspaceAction(term).then((r) => {
        if (seq.current !== id) return;
        setResults(r);
        setSearching(false);
        const flat = flattenWorkspaceHits(r);
        setActive(flat.length ? 0 : -1);
      }).catch(() => {
        if (seq.current !== id) return;
        setResults(emptyWorkspaceSearch());
        setSearching(false);
      });
    }, DEBOUNCE_MS);
  }

  const hits = flattenWorkspaceHits(results);
  const queried = q.trim().length > 0;

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => moveActive(i, 1, hits.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => moveActive(i, -1, hits.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      go(hits[active] ?? hits[0]);
    }
  }

  useEffect(() => {
    if (active < 0) return;
    const el = listRef.current?.querySelector(`[data-hit-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const shortcut = "Ctrl K";

  const modal = open && typeof document !== "undefined" ? createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-[min(12vh,5.5rem)] sm:pt-[min(18vh,7rem)]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
      data-testid="workspace-search-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full min-w-0 max-w-[36rem] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_64px_rgba(15,23,42,.22)]"
      >
        <div className="border-b border-line px-4 pt-4 pb-3 sm:px-5">
          <div className="text-[11px] font-bold tracking-[0.14em] text-brand">QUICK FIND</div>
          <h2 id={titleId} className="mt-0.5 text-lg font-semibold text-ink">Search your workspace</h2>
          <div className="relative mt-3">
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={onInputKey}
              placeholder="Search customers, projects, or people…"
              className="w-full min-w-0 rounded-xl border border-line bg-canvas py-2.5 pr-10 pl-9 text-[15px] text-ink outline-none placeholder:text-muted focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/20"
              data-testid="workspace-search-input"
              aria-autocomplete="list"
              aria-controls="workspace-search-results"
            />
            {q ? (
              <button
                type="button"
                className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-white hover:text-ink"
                onClick={() => { onQuery(""); inputRef.current?.focus(); }}
                aria-label="Clear search"
                data-testid="workspace-search-clear"
              >
                <Icon name="x" className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div id="workspace-search-results" ref={listRef} className="min-h-[12rem] max-h-[min(24rem,calc(100dvh-14rem))] overflow-y-auto overflow-x-hidden px-2 py-2 sm:px-3" role="listbox">
          {!queried && (
            <p className="px-3 py-8 text-center text-sm text-muted">Start typing to search customers, projects, and people.</p>
          )}
          {queried && searching && hits.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted">Searching…</p>
          )}
          {queried && (!searching || hits.length > 0) && (
            <>
              <Section kind="customer" label="Customers" group={results.customers} query={q} active={active} offset={0} onPick={go} />
              <Section kind="project" label="Projects" group={results.projects} query={q} active={active} offset={results.customers.items.length} onPick={go} />
              <Section kind="person" label="People" group={results.people} query={q} active={active} offset={results.customers.items.length + results.projects.items.length} onPick={go} />
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-canvas px-4 py-2.5 text-[11.5px] text-muted sm:px-5">
          <span className="min-w-0 truncate">Searches your organization only</span>
          <span className="shrink-0">Esc to close.</span>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink md:hidden"
        aria-label="Search workspace"
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="workspace-search-open-mobile"
      >
        <Icon name="search" />
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-w-0 max-w-[16rem] items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-sm text-muted hover:border-brand/30 hover:bg-white hover:text-ink md:inline-flex"
        aria-label="Search workspace"
        aria-keyshortcuts="Control+K Meta+K"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="workspace-search-open"
      >
        <Icon name="search" className="size-4" />
        <span className="min-w-0 truncate">Search workspace</span>
        <kbd className="ml-1 rounded-md border border-line bg-white px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-muted">{shortcut}</kbd>
      </button>
      {modal}
    </>
  );
}

function Section({
  kind, label, group, query, active, offset, onPick,
}: {
  kind: WorkspaceSearchHit["kind"];
  label: string;
  group: WorkspaceSearchResults["customers"];
  query: string;
  active: number;
  offset: number;
  onPick: (h: WorkspaceSearchHit) => void;
}) {
  const empty = kind === "customer" ? "No matching customers." : kind === "project" ? "No matching projects." : "No matching people.";
  return (
    <section className="mb-2 last:mb-0" data-testid={`workspace-search-section-${kind === "person" ? "people" : kind === "customer" ? "customers" : "projects"}`}>
      <div className="flex items-center gap-2 px-2 pt-2 pb-1">
        <h3 className="text-[11px] font-bold tracking-wide text-muted uppercase">{label}</h3>
        <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10.5px] font-semibold text-muted tabular-nums">{group.total}</span>
      </div>
      {group.items.length === 0 ? (
        <p className="px-2 pb-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {group.items.map((hit, i) => {
            const idx = offset + i;
            const on = idx === active;
            const clickable = !!hit.href;
            return (
              <li key={hit.id} className="min-w-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  aria-disabled={!clickable}
                  data-hit-index={idx}
                  disabled={!clickable}
                  onClick={() => onPick(hit)}
                  className={`flex w-full min-w-0 items-start gap-2.5 rounded-xl px-2.5 py-2 text-left ${on ? "bg-brand-50 text-ink" : "text-ink hover:bg-canvas"} ${clickable ? "" : "cursor-default opacity-70"}`}
                >
                  <Icon name={ICONS[hit.kind]} className={`mt-0.5 size-4 ${on ? "text-brand" : "text-muted"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium"><Highlight text={hit.title} query={query} /></span>
                    {hit.subtitle ? <span className="mt-0.5 block truncate text-[12.5px] text-muted"><Highlight text={hit.subtitle} query={query} /></span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
