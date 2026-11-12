"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { highlightChunks } from "@/lib/highlight-match";
import {
  ADDRESS_SUGGEST_MIN_CHARS,
  formatAddressLabel,
  type AddressSuggestion,
} from "@/lib/address-suggest";

const DEBOUNCE_MS = 300;

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

type Defaults = { address?: string; city?: string; state?: string; zip?: string };

export function AddressFields({ defaults }: { defaults: Defaults }) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const [street, setStreet] = useState(defaults.address ?? "");
  const [city, setCity] = useState(defaults.city ?? "");
  const [state, setState] = useState(defaults.state ?? "IL");
  const [zip, setZip] = useState(defaults.zip ?? "");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    const onPtr = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPtr);
    return () => document.removeEventListener("pointerdown", onPtr);
  }, []);

  function clearCoords() {
    setLat("");
    setLng("");
  }

  function apply(s: AddressSuggestion) {
    const line = s.unit && !s.street.toLowerCase().includes(s.unit.toLowerCase())
      ? `${s.street} ${s.unit}`
      : s.street;
    setStreet(line);
    if (s.city) setCity(s.city);
    if (s.state) setState(s.state);
    if (s.zip) setZip(s.zip);
    if (s.lat != null && s.lng != null) {
      setLat(String(s.lat));
      setLng(String(s.lng));
    }
    setOpen(false);
    setItems([]);
    // Fill ZIP / official coords from Census when the free suggest hit omitted them.
    if (!s.zip || s.source !== "census") {
      fetch("/api/address-suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          street: line, city: s.city, state: s.state, zip: s.zip,
          lat: s.lat, lng: s.lng,
        }),
      })
        .then((r) => r.json())
        .then((d: { item?: AddressSuggestion | null }) => {
          const item = d.item;
          if (!item) return;
          if (item.zip) setZip(item.zip);
          if (item.city && !s.city) setCity(item.city);
          if (item.state && !s.state) setState(item.state);
          if (item.lat != null && item.lng != null) {
            setLat(String(item.lat));
            setLng(String(item.lng));
          }
        })
        .catch(() => { /* keep the suggestion values */ });
    }
  }

  function onStreet(next: string) {
    setStreet(next);
    clearCoords();
    if (timer.current) clearTimeout(timer.current);
    const term = next.trim();
    if (term.length < ADDRESS_SUGGEST_MIN_CHARS) {
      seq.current += 1;
      setItems([]);
      setSearching(false);
      setDegraded(false);
      setOpen(false);
      return;
    }
    setSearching(true);
    setOpen(true);
    const id = ++seq.current;
    timer.current = setTimeout(() => {
      fetch(`/api/address-suggest?q=${encodeURIComponent(term)}`)
        .then((r) => r.ok ? r.json() : { items: [], degraded: true })
        .then((d: { items?: AddressSuggestion[]; degraded?: boolean }) => {
          if (seq.current !== id) return;
          const nextItems = d.items ?? [];
          setItems(nextItems);
          setDegraded(!!d.degraded);
          setSearching(false);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          if (seq.current !== id) return;
          setItems([]);
          setDegraded(true);
          setSearching(false);
        });
    }, DEBOUNCE_MS);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false); }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        if (street.trim().length >= ADDRESS_SUGGEST_MIN_CHARS) setOpen(true);
        return;
      }
      if (!items.length) return;
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + items.length) % items.length;
      });
      return;
    }
    if (e.key === "Enter" && open && items[active]) {
      e.preventDefault();
      apply(items[active]);
    }
  }

  const showList = open && street.trim().length >= ADDRESS_SUGGEST_MIN_CHARS;
  const activeId = showList && items[active] ? `${listId}-opt-${items[active].id}` : undefined;

  return (
    <>
      <div ref={rootRef} className="relative min-w-0 sm:col-span-2">
        <label className="label">
          Street address
          <input
            ref={inputRef}
            className="input"
            name="address"
            value={street}
            onChange={(e) => onStreet(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => { if (street.trim().length >= ADDRESS_SUGGEST_MIN_CHARS && (items.length || searching)) setOpen(true); }}
            placeholder="Start typing a street address…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={activeId}
            data-testid="address-suggest-input"
          />
        </label>
        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Address suggestions"
            data-testid="address-suggest-list"
            className="z-20 mt-1 max-h-64 overflow-auto overflow-x-hidden rounded-lg border border-line bg-white shadow-lg"
          >
            {searching && !items.length && (
              <li className="px-3 py-2 text-sm text-muted" role="presentation">Looking up addresses…</li>
            )}
            {!searching && !items.length && (
              <li className="px-3 py-2 text-sm text-muted" role="presentation" data-testid="address-suggest-empty">
                {degraded ? "Address lookup is unavailable — type the address manually." : "No matching addresses. Keep typing, or enter it manually."}
              </li>
            )}
            {items.map((h, i) => (
              <li key={h.id} className="min-w-0 p-0">
                <button
                  type="button"
                  id={`${listId}-opt-${h.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-testid={`address-suggest-option-${i}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => apply(h)}
                  className={`block w-full min-w-0 px-3 py-2 text-left text-sm ${i === active ? "bg-brand-50" : "hover:bg-brand-50"}`}
                >
                  <span className="block truncate font-semibold"><Highlight text={h.street} query={street} /></span>
                  <span className="block truncate text-xs text-muted">
                    <Highlight text={formatAddressLabel({ ...h, street: "" }).replace(/^,\s*/, "")} query={street} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-[1fr_80px_110px] gap-3 sm:col-span-2">
        <label className="label min-w-0">City
          <input className="input min-w-0" name="city" value={city} onChange={(e) => { setCity(e.target.value); clearCoords(); }} placeholder="Schaumburg" data-testid="address-city" />
        </label>
        <label className="label">State
          <input className="input" name="state" maxLength={2} value={state} onChange={(e) => { setState(e.target.value.toUpperCase()); clearCoords(); }} data-testid="address-state" />
        </label>
        <label className="label">ZIP
          <input className="input" name="zip" inputMode="numeric" value={zip} onChange={(e) => { setZip(e.target.value); clearCoords(); }} data-testid="address-zip" />
        </label>
      </div>
      <input type="hidden" name="geo_lat" value={lat} />
      <input type="hidden" name="geo_lng" value={lng} />
    </>
  );
}
