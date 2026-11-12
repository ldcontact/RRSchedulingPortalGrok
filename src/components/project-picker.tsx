"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { getProjectHit, searchProjects, type ProjectHit } from "@/app/(app)/jobs/actions";
import { highlightChunks } from "@/lib/highlight-match";
import { projectHitLabel, projectHitSubtitle } from "@/lib/project-hit";

export type { ProjectHit };

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

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

export function ProjectPicker({
  name = "project_id",
  required = false,
  defaultSelected = null,
  defaultSelectedId,
  customerId,
  placeholder = "Search by project, customer, or job #…",
  onChange,
  noMatchHint,
  testId = "project-search",
}: {
  name?: string;
  required?: boolean;
  defaultSelected?: ProjectHit | null;
  defaultSelectedId?: string;
  customerId?: string;
  placeholder?: string;
  onChange?: (p: ProjectHit | null) => void;
  noMatchHint?: ReactNode;
  testId?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const [selected, setSelected] = useState<ProjectHit | null>(defaultSelected);
  const [q, setQ] = useState(defaultSelected ? projectHitLabel(defaultSelected) : "");
  const [hits, setHits] = useState<ProjectHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const scoped = !!(customerId && customerId.trim());

  useEffect(() => {
    if (defaultSelected || !defaultSelectedId) return;
    let live = true;
    getProjectHit(defaultSelectedId).then((p) => {
      if (!live || !p) return;
      setSelected(p);
      setQ(projectHitLabel(p));
    });
    return () => { live = false; };
  }, [defaultSelected, defaultSelectedId]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selected ? "Pick a project from the list." : "");
  }, [required, selected]);

  useEffect(() => {
    const onPtr = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPtr);
    return () => document.removeEventListener("pointerdown", onPtr);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function emit(next: ProjectHit | null) {
    setSelected(next);
    onChange?.(next);
  }

  function canSearch(text: string) {
    return text.trim().length >= MIN_CHARS || scoped;
  }

  function runSearch(text: string) {
    if (!canSearch(text) && !scoped) {
      seq.current += 1;
      setHits([]);
      setSearching(false);
      return;
    }
    const n = ++seq.current;
    setSearching(true);
    void searchProjects(text, customerId).then((rows) => {
      if (n !== seq.current) return;
      setHits(rows);
      setActive(0);
      setSearching(false);
    }).catch(() => {
      if (n !== seq.current) return;
      setHits([]);
      setSearching(false);
    });
  }

  function onType(text: string) {
    setQ(text);
    if (selected) emit(null);
    const ok = canSearch(text);
    setOpen(ok);
    if (timer.current) clearTimeout(timer.current);
    if (!ok) {
      seq.current += 1;
      setHits([]);
      setSearching(false);
      return;
    }
    timer.current = setTimeout(() => runSearch(text), DEBOUNCE_MS);
  }

  function pick(hit: ProjectHit) {
    emit(hit);
    setQ(projectHitLabel(hit));
    setHits([]);
    setOpen(false);
    inputRef.current?.setCustomValidity("");
  }

  function clear() {
    emit(null);
    setQ("");
    setHits([]);
    setOpen(false);
    setSearching(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        if (canSearch(q)) {
          setOpen(true);
          if (!hits.length && !searching) runSearch(q);
        }
        return;
      }
      if (!hits.length) return;
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + hits.length) % hits.length;
      });
      return;
    }
    if (e.key === "Enter" && open && hits[active]) {
      e.preventDefault();
      pick(hits[active]);
    }
  }

  const showList = open && canSearch(q) && !selected;
  const activeId = showList && hits[active] ? `${listId}-opt-${hits[active].id}` : undefined;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="relative min-w-0">
        <input
          ref={inputRef}
          className="input min-w-0 pr-9"
          value={q}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (selected) return;
            if (canSearch(q)) {
              setOpen(true);
              if (!hits.length && !searching) runSearch(q);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-required={required || undefined}
          aria-label="Project"
          data-testid={testId}
        />
        {(q || selected) && (
          <button type="button" className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink" onClick={clear} aria-label="Clear project" data-testid="project-search-clear">
            <Icon name="x" className="size-3.5" />
          </button>
        )}
      </div>
      {selected && selected.customer_name ? (
        <div className="truncate text-[12.5px] font-normal text-muted">{projectHitSubtitle(selected)}</div>
      ) : null}
      {showList && (
        <ul id={listId} role="listbox" aria-label="Matching projects" data-testid="project-search-list" className="z-20 mt-1 max-h-64 overflow-auto overflow-x-hidden rounded-lg border border-line bg-white shadow-lg">
          {searching && !hits.length && <li className="px-3 py-2 text-sm text-muted" role="presentation">Searching…</li>}
          {!searching && !hits.length && (
            <li className="px-3 py-2 text-sm text-muted" role="presentation" data-testid="project-search-empty">
              {noMatchHint ?? "No projects match. Keep typing, or pick a different search."}
            </li>
          )}
          {hits.map((h, i) => (
            <li key={h.id} className="min-w-0 p-0">
              <button
                type="button"
                id={`${listId}-opt-${h.id}`}
                role="option"
                aria-selected={i === active}
                data-testid={`project-search-option-${i}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                className={`block w-full min-w-0 px-3 py-2 text-left text-sm ${i === active ? "bg-brand-50" : "hover:bg-brand-50"}`}
              >
                <div className="truncate font-semibold"><Highlight text={h.name} query={q} /></div>
                <div className="truncate text-xs text-muted">
                  {projectHitSubtitle(h) ? <Highlight text={projectHitSubtitle(h)} query={q} /> : "No customer"}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
