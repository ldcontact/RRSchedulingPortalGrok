"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { getCustomerHit, searchCustomers, type CustomerHit } from "@/app/(app)/customers/actions";
import { highlightChunks } from "@/lib/highlight-match";

export type { CustomerHit };

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

function Highlight({ text, query }: { text: string; query: string }) {
  const chunks = highlightChunks(text, query);
  return (
    <>
      {chunks.map((c, i) =>
        c.match ? <mark key={i} className="rounded-sm bg-amber-100 text-ink">{c.text}</mark> : <span key={i}>{c.text}</span>,
      )}
    </>
  );
}

export function CustomerPicker({
  name = "customer_id",
  required = false,
  defaultSelected = null,
  defaultSelectedId,
  placeholder = "Search by name, address, or phone…",
  onChange,
  noMatchHint,
  testId = "customer-search",
}: {
  name?: string;
  required?: boolean;
  defaultSelected?: CustomerHit | null;
  defaultSelectedId?: string;
  placeholder?: string;
  onChange?: (c: CustomerHit | null) => void;
  noMatchHint?: ReactNode;
  testId?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const [selected, setSelected] = useState<CustomerHit | null>(defaultSelected);
  const [q, setQ] = useState(defaultSelected?.name ?? "");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (defaultSelected || !defaultSelectedId) return;
    let live = true;
    getCustomerHit(defaultSelectedId).then((c) => {
      if (!live || !c) return;
      setSelected(c);
      setQ(c.name);
    });
    return () => { live = false; };
  }, [defaultSelected, defaultSelectedId]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selected ? "Pick a customer from the list." : "");
  }, [required, selected]);

  useEffect(() => {
    const onPtr = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPtr);
    return () => document.removeEventListener("pointerdown", onPtr);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function emit(next: CustomerHit | null) {
    setSelected(next);
    onChange?.(next);
  }

  function runSearch(text: string) {
    const term = text.trim();
    if (term.length < MIN_CHARS) {
      seq.current += 1;
      setHits([]);
      setSearching(false);
      return;
    }
    const n = ++seq.current;
    setSearching(true);
    void searchCustomers(term).then((rows) => {
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
    const term = text.trim();
    setOpen(term.length >= MIN_CHARS);
    if (timer.current) clearTimeout(timer.current);
    if (term.length < MIN_CHARS) {
      seq.current += 1;
      setHits([]);
      setSearching(false);
      return;
    }
    timer.current = setTimeout(() => runSearch(text), DEBOUNCE_MS);
  }

  function pick(hit: CustomerHit) {
    emit(hit);
    setQ(hit.name);
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
        if (q.trim().length >= MIN_CHARS) {
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

  const showList = open && q.trim().length >= MIN_CHARS && !selected;
  const activeId = showList && hits[active] ? `${listId}-opt-${hits[active].id}` : undefined;

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="relative">
        <input
          ref={inputRef}
          className="input pr-9"
          value={q}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (!selected && q.trim().length >= MIN_CHARS) setOpen(true); }}
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
          aria-label="Customer"
          data-testid={testId}
        />
        {(q || selected) && (
          <button type="button" className="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink" onClick={clear} aria-label="Clear customer" data-testid="customer-search-clear">
            <Icon name="x" className="size-3.5" />
          </button>
        )}
      </div>
      {selected?.address && <div className="truncate text-[12.5px] font-normal text-muted">{selected.address}</div>}
      {showList && (
        <ul id={listId} role="listbox" aria-label="Matching customers" data-testid="customer-search-list" className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-line bg-white shadow-lg">
          {searching && !hits.length && <li className="px-3 py-2 text-sm text-muted" role="presentation">Searching…</li>}
          {!searching && !hits.length && (
            <li className="px-3 py-2 text-sm text-muted" role="presentation" data-testid="customer-search-empty">
              {noMatchHint ?? "No customers match"}
            </li>
          )}
          {hits.map((h, i) => (
            <li key={h.id} className="p-0">
              <button
                type="button"
                id={`${listId}-opt-${h.id}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                className={`block w-full px-3 py-2 text-left text-sm ${i === active ? "bg-brand-50" : "hover:bg-brand-50"}`}
              >
                <div className="truncate font-semibold"><Highlight text={h.name} query={q} /></div>
                <div className="truncate text-xs text-muted">{h.address ? <Highlight text={h.address} query={q} /> : "No address"}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
