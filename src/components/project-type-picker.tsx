"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { PROJECT_TYPES, PROJECT_TYPE_LABEL, type ProjectType } from "@/lib/types";

function isProjectType(v: string): v is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(v);
}

export function ProjectTypePicker({
  name = "type",
  defaultValue = "lighting",
}: {
  name?: string;
  defaultValue?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<ProjectType>(isProjectType(defaultValue) ? defaultValue : "lighting");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, PROJECT_TYPES.indexOf(isProjectType(defaultValue) ? defaultValue : "lighting")));

  useEffect(() => {
    const onPtr = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPtr);
    return () => document.removeEventListener("pointerdown", onPtr);
  }, []);

  function pick(t: ProjectType) {
    setValue(t);
    setActive(PROJECT_TYPES.indexOf(t));
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + dir + PROJECT_TYPES.length) % PROJECT_TYPES.length);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const t = PROJECT_TYPES[active];
      if (t) pick(t);
    }
  }

  const activeId = open ? `${listId}-opt-${PROJECT_TYPES[active]}` : undefined;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="input flex min-w-0 items-center justify-between gap-2 text-left font-medium"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-label="Project type"
        data-testid="project-type"
      >
        <span className="min-w-0 truncate">{PROJECT_TYPE_LABEL[value]}</span>
        <span className="shrink-0 text-muted" aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Project types"
          data-testid="project-type-list"
          className="z-20 mt-1 max-h-[min(36rem,75dvh)] overflow-auto overflow-x-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {PROJECT_TYPES.map((t, i) => (
            <li key={t} className="min-w-0 p-0">
              <button
                type="button"
                id={`${listId}-opt-${t}`}
                role="option"
                aria-selected={t === value}
                data-testid={`project-type-option-${i}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(t)}
                className={`block w-full min-w-0 px-3 py-2 text-left text-sm whitespace-normal ${i === active ? "bg-brand-50" : "hover:bg-brand-50"} ${t === value ? "font-semibold" : ""}`}
              >
                {PROJECT_TYPE_LABEL[t]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
