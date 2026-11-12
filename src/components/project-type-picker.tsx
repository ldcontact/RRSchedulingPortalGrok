"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { TypeChip, TypeIcon } from "@/components/project-type-chip";
import { PROJECT_TYPE_GROUPS, PROJECT_TYPE_PICKER_ORDER, projectTypeColor, projectTypeLabel } from "@/lib/project-type";
import { PROJECT_TYPES, type ProjectType } from "@/lib/types";

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
  const initial = isProjectType(defaultValue) ? defaultValue : "lighting";
  const [value, setValue] = useState<ProjectType>(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, PROJECT_TYPE_PICKER_ORDER.indexOf(initial)));

  useEffect(() => {
    const onPtr = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPtr);
    return () => document.removeEventListener("pointerdown", onPtr);
  }, []);

  function pick(t: ProjectType) {
    setValue(t);
    setActive(Math.max(0, PROJECT_TYPE_PICKER_ORDER.indexOf(t)));
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
      setActive((i) => (i + dir + PROJECT_TYPE_PICKER_ORDER.length) % PROJECT_TYPE_PICKER_ORDER.length);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const t = PROJECT_TYPE_PICKER_ORDER[active];
      if (t) pick(t);
    }
  }

  const activeType = PROJECT_TYPE_PICKER_ORDER[active];
  const activeId = open && activeType ? `${listId}-opt-${activeType}` : undefined;
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
        <TypeChip type={value} truncate />
        <span className="shrink-0 text-muted" aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Project types"
          data-testid="project-type-list"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-[min(52rem,85dvh)] overflow-auto overflow-x-hidden rounded-lg border border-line bg-white shadow-lg"
        >
          {PROJECT_TYPE_GROUPS.map((g, gi) => (
            <div key={g.id}>
              <div className={`px-3 pb-0.5 text-[11px] font-bold tracking-[0.14em] text-muted uppercase ${gi === 0 ? "pt-2" : "mt-0.5 border-t border-line bg-[#fafbf9] pt-1.5"}`} role="presentation">
                {g.label}
              </div>
              {g.types.map((t) => {
                const i = PROJECT_TYPE_PICKER_ORDER.indexOf(t);
                const color = projectTypeColor(t);
                return (
                  <button
                    key={t}
                    type="button"
                    id={`${listId}-opt-${t}`}
                    role="option"
                    aria-selected={t === value}
                    data-testid={`project-type-option-${i}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(t)}
                    className={`flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left text-sm ${i === active ? "bg-brand-50" : "hover:bg-brand-50"} ${t === value ? "font-semibold" : ""}`}
                  >
                    <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] text-white" style={{ background: color }}>
                      <TypeIcon type={t} />
                    </span>
                    <span className="min-w-0 leading-snug whitespace-normal">{projectTypeLabel(t)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
