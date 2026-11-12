import { projectTypeColor, projectTypeLabel } from "@/lib/project-type";
import type { ProjectType } from "@/lib/types";

const ICONS: Record<ProjectType, string> = {
  lighting: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  hvac: '<circle cx="12" cy="12" r="2.2"/><path d="M12 10.2c2-3.8 5.2-5.6 7.2-4.5 1.2.6 1.5 2.5.4 4.7-1.6 3.2-4.7 4.3-7.6 2.8"/><path d="M13.6 13c1.1 4.1-.3 7.6-2.6 8.4-1.3.5-2.8-.6-3.6-2.8-1.2-3.3-.2-6.5 2.6-7.8"/><path d="M10.4 11.2c-3.2-1-5-3.8-4.6-6.1.3-1.3 1.9-2 3.8-1.5 3 .8 5 3.5 4.6 6.4"/>',
  lighting_hvac: '<path d="M12 3 3.5 8 12 13l8.5-5L12 3z"/><path d="M3.5 14 12 19l8.5-5"/><path d="M3.5 10.5 12 15.5l8.5-5"/>',
  whe_single_family: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
  whe_multifamily: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M14 10h5a1 1 0 0 1 1 1v10"/><path d="M7 8h2M7 12h2M7 16h2M16.5 14h2M16.5 17h2"/><path d="M9 21v-3h4v3"/>',
  ac: '<path d="M12 3v18M5.6 6.2 12 12l6.4-5.8M5.6 17.8 12 12l6.4 5.8"/><path d="M3 12h18"/>',
  ptac_to_hpac: '<path d="M7 8h13l-3.5-3.5"/><path d="M17 16H4l3.5 3.5"/>',
  weatherization: '<path d="M12 3 5 6v5.5c0 4.4 2.8 7.6 7 9.5 4.2-1.9 7-5.1 7-9.5V6z"/><path d="M9.5 12.2 11.3 14l3.4-4"/>',
  pipe_insulation: '<rect x="3" y="9" width="18" height="6" rx="2"/><path d="M8 9v6M12 9v6M16 9v6"/>',
  steam_traps: '<path d="M12 3s6 6.2 6 10.5A6 6 0 0 1 6 13.5C6 9.2 12 3 12 3z"/>',
  boiler_tune_up: '<path d="M12 21a6 6 0 0 0 6-6c0-3.4-2.2-5.6-3.7-7.3C13.2 6.3 12 4.5 12 3c0 1.5-1.2 3.3-2.3 4.7C8.2 9.4 6 11.6 6 15a6 6 0 0 0 6 6z"/><path d="M12 21a3.2 3.2 0 0 0 2.4-5.3C13.6 14.6 12 13 12 11c0 2-1.6 3.6-2.4 4.7A3.2 3.2 0 0 0 12 21z"/>',
  hot_water_controllers: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
  audit: '<path d="M8 5.5H7a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1h-1"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
  other: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
};

export function TypeIcon({ type, size = 14 }: { type: ProjectType; size?: number }) {
  const body = ICONS[type] ?? ICONS.other;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <g dangerouslySetInnerHTML={{ __html: body }} />
    </svg>
  );
}

/** Colored icon chip used in the picker, project header, and Projects list. */
export function TypeChip({ type, truncate = false }: { type: ProjectType; truncate?: boolean }) {
  const label = projectTypeLabel(type);
  const color = projectTypeColor(type);
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg py-0.5 pr-2 pl-0.5 text-[11.5px] font-semibold"
      style={{
        ["--type-c" as string]: color,
        border: "1px solid color-mix(in srgb, var(--type-c) 30%, #e2e6e1)",
        background: "color-mix(in srgb, var(--type-c) 12%, #fff)",
        color: "color-mix(in srgb, var(--type-c) 72%, #1b2422)",
      }}
      title={label}
    >
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] text-white" style={{ background: color }}>
        <TypeIcon type={type} />
      </span>
      <span className={truncate ? "min-w-0 truncate" : "min-w-0 leading-snug whitespace-normal"}>{label}</span>
    </span>
  );
}
