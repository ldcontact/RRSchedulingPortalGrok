import { PROJECT_TYPE_LABEL, type ProjectType } from "@/lib/types";

/** Pin / chip color per project type. Lighting keeps the original job-site orange. */
export const PROJECT_TYPE_COLOR: Record<ProjectType, string> = {
  lighting: "#d97706",
  hvac: "#2563eb",
  lighting_hvac: "#7c3aed",
  whe_single_family: "#0f766e",
  whe_multifamily: "#0e7490",
  ac: "#0284c7",
  ptac_to_hpac: "#4f46e5",
  weatherization: "#65a30d",
  pipe_insulation: "#c2410c",
  steam_traps: "#e11d48",
  boiler_tune_up: "#b45309",
  hot_water_controllers: "#c026d3",
  audit: "#64748b",
  other: "#57534e",
};

/** Grouped picker sections (Option B). Visual order; not the enum storage order. */
export const PROJECT_TYPE_GROUPS: { id: string; label: string; types: readonly ProjectType[] }[] = [
  { id: "lighting", label: "Lighting", types: ["lighting", "lighting_hvac"] },
  { id: "hvac", label: "HVAC & Heat Pumps", types: ["hvac", "ac", "ptac_to_hpac", "boiler_tune_up", "hot_water_controllers"] },
  { id: "whe", label: "Whole Home Electric", types: ["whe_single_family", "whe_multifamily"] },
  { id: "envelope", label: "Building Envelope & Steam", types: ["weatherization", "pipe_insulation", "steam_traps"] },
  { id: "other", label: "Other", types: ["audit", "other"] },
];

/** Flattened picker order (follows the groups). */
export const PROJECT_TYPE_PICKER_ORDER: ProjectType[] = PROJECT_TYPE_GROUPS.flatMap((g) => [...g.types]);

export function projectTypeLabel(type: ProjectType | string): string {
  return PROJECT_TYPE_LABEL[type as ProjectType] ?? type;
}

export function projectTypeColor(type: ProjectType | string): string {
  return PROJECT_TYPE_COLOR[type as ProjectType] ?? PROJECT_TYPE_COLOR.other;
}
