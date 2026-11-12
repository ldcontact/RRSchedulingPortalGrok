import type { LeadSource } from "./catalog";
import { PIPELINE_DEFS } from "./catalog";

/** Monday board snapshot (already fetched read-only). Never write back to Monday. */
export type MondayColumn = { id: string; title: string; type: string };
export type MondayGroup = { id: string; title: string };
export type MondayItem = {
  id: string;
  name: string;
  group?: { id: string; title: string };
  column_values?: { id: string; text?: string | null; value?: string | null }[];
};
export type MondayBoardSnapshot = {
  id: string;
  name: string;
  groups: MondayGroup[];
  columns: MondayColumn[];
  items: MondayItem[];
};

export type ImportedDeal = {
  monday_item_id: string;
  monday_board_id: string;
  pipeline_slug: string;
  stage_slug: string;
  title: string;
  contact_name: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  owner_name: string | null;
  priority: "High" | "Medium" | "Low";
  assessment_date: string | null;
  scheduled_date: string | null;
  close_date: string | null;
  opened_at: string | null;
  source: LeadSource;
};

const BOARD_PIPELINE: Record<string, string> = {
  "singlefamily - project tracker  whe": "single_family_whe",
  "singlefamily - project tracker whe": "single_family_whe",
  "multifamily -  project tracker  whe": "multifamily_whe",
  "multifamily - project tracker  whe": "multifamily_whe",
  "multifamily - project tracker whe": "multifamily_whe",
};

const GROUP_STAGE: Record<string, string> = {
  "potential lead": "potential_lead",
  "contacted comed verification": "contacted_comed",
  "declined by projects": "declined",
  "ready for assessment": "ready_for_assessment",
  "assessment scheduled": "assessment_scheduled",
  "assessment completed": "assessment_completed",
  "rise - project assessment data entered": "rise_data_entered",
  "approved - ready to schedule": "approved_ready",
  "job scheduled": "project_scheduled",
  "project scheduled": "project_scheduled",
  "job completed": "project_completed",
  "project completed": "project_completed",
  "city permit final pending": "permit_pending",
  "city permit final completed": "permit_final",
  "project not feasible": "not_feasible",
};

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function pipelineSlugForBoard(name: string): string | null {
  return BOARD_PIPELINE[norm(name)] ?? null;
}

export function stageSlugForGroup(title: string, pipelineSlug: string): string | null {
  const mapped = GROUP_STAGE[norm(title)];
  if (!mapped) return null;
  const pipe = PIPELINE_DEFS.find((p) => p.slug === pipelineSlug);
  if (!pipe?.stages.some((s) => s.slug === mapped)) return null;
  return mapped;
}

function col(item: MondayItem, ...titlesOrIds: string[]) {
  const want = new Set(titlesOrIds.map(norm));
  // title lookup needs columns; we match on id fragments / known ids too
  return item.column_values?.find((c) => want.has(norm(c.id))) ?? null;
}

function textOf(item: MondayItem, ids: string[]): string | null {
  for (const id of ids) {
    const c = item.column_values?.find((x) => x.id === id);
    if (c?.text?.trim()) return c.text.trim();
  }
  return null;
}

function parseLocation(text: string | null): { address: string | null; city: string | null; state: string | null; zip: string | null } {
  if (!text) return { address: null, city: null, state: null, zip: null };
  const parts = text.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const zip = parts.at(-1)?.match(/\d{5}/)?.[0] ?? null;
    const state = parts.at(-1)?.replace(/\d/g, "").trim() || parts.at(-2) || null;
    const city = parts.length >= 3 ? parts[parts.length - 2] : null;
    return { address: parts.slice(0, -2).join(", "), city, state: state && state.length <= 3 ? state : "IL", zip };
  }
  return { address: text, city: null, state: "IL", zip: null };
}

function parseDate(text: string | null): string | null {
  if (!text) return null;
  const m = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = Date.parse(text);
  if (Number.isNaN(d)) return null;
  return new Date(d).toISOString().slice(0, 10);
}

function parsePriority(text: string | null): "High" | "Medium" | "Low" {
  const t = (text ?? "").toLowerCase();
  if (t.includes("high")) return "High";
  if (t.includes("low")) return "Low";
  return "Medium";
}

export function mapMondayItem(board: MondayBoardSnapshot, item: MondayItem): ImportedDeal | { error: string } {
  const pipeline = pipelineSlugForBoard(board.name);
  if (!pipeline) return { error: `Unsupported board: ${board.name}` };
  const groupTitle = item.group?.title ?? "";
  const stage = stageSlugForGroup(groupTitle, pipeline);
  if (!stage) return { error: `Unknown group/stage: ${groupTitle || "(none)"}` };
  const loc = parseLocation(textOf(item, ["location"]));
  return {
    monday_item_id: item.id,
    monday_board_id: board.id,
    pipeline_slug: pipeline,
    stage_slug: stage,
    title: item.name,
    contact_name: textOf(item, ["link_to_contacts_", "contacts"]),
    contact_phone: textOf(item, ["phone"]) ?? null,
    ...loc,
    owner_name: textOf(item, ["person"]),
    priority: parsePriority(textOf(item, ["status9"])),
    assessment_date: parseDate(textOf(item, ["date_mm13rart"])),
    scheduled_date: parseDate(textOf(item, ["date_mm2fzg8v"])),
    close_date: parseDate(textOf(item, ["date9"])),
    opened_at: parseDate(textOf(item, ["date1"])),
    source: "monday",
  };
}

export function mapMondayBoard(board: MondayBoardSnapshot): { deals: ImportedDeal[]; skipped: { id: string; name: string; error: string }[] } {
  const deals: ImportedDeal[] = [];
  const skipped: { id: string; name: string; error: string }[] = [];
  for (const item of board.items) {
    const row = mapMondayItem(board, item);
    if ("error" in row) skipped.push({ id: item.id, name: item.name, error: row.error });
    else deals.push(row);
  }
  return { deals, skipped };
}

void col;
