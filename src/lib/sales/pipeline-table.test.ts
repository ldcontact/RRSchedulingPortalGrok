import { describe, expect, it } from "vitest";
import { PIPELINE_DEFS } from "./catalog";
import {
  avgDaysOpen,
  defaultCollapsed,
  formatLocation,
  groupDealsByStage,
  dealCustomerName,
  dealHeadline,
  initials,
  isLateStage,
  prettyName,
  lengthTone,
  pipelineCounts,
  PREVIEW_ROWS,
} from "./pipeline-table";
import type { SalesDeal } from "./types";

const stages = PIPELINE_DEFS.find((p) => p.slug === "single_family_whe")!.stages;
const deal = (over: Partial<SalesDeal> & { id: string; stage_slug: string }): SalesDeal => ({
  pipeline_slug: "single_family_whe",
  title: over.id,
  customer_id: null,
  owner_id: null,
  contact_name: "Pat",
  contact_phone: null,
  contact_email: null,
  address: null,
  city: "Schaumburg",
  state: "IL",
  zip: null,
  lat: null,
  lng: null,
  priority: "Medium",
  source: "manual",
  assessment_date: null,
  assessment_starts_at: null,
  assessment_ends_at: null,
  scheduled_date: null,
  close_date: null,
  opened_at: "2026-10-01T12:00:00.000Z",
  value: 0,
  est_rebate: 0,
  converted_project_id: null,
  monday_item_id: null,
  monday_board_id: null,
  notes: null,
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-01T12:00:00.000Z",
  ...over,
});

describe("pipeline table grouping", () => {
  it("groups in pipeline order and keeps empty stages", () => {
    const deals = [
      deal({ id: "a", stage_slug: "approved_ready" }),
      deal({ id: "b", stage_slug: "potential_lead" }),
      deal({ id: "c", stage_slug: "potential_lead" }),
    ];
    const groups = groupDealsByStage(deals, stages);
    expect(groups.map((g) => g.stage.slug)).toContain("potential_lead");
    expect(groups[0]!.stage.slug).toBe("potential_lead");
    expect(groups[0]!.deals.map((d) => d.id)).toEqual(["b", "c"]);
    expect(groups.find((g) => g.stage.slug === "contacted_comed")!.deals).toHaveLength(0);
    expect(groups.find((g) => g.stage.slug === "approved_ready")!.deals).toHaveLength(1);
  });

  it("collapses empty and late stages by default, not active ones", () => {
    const declined = stages.find((s) => s.slug === "declined")!;
    const potential = stages.find((s) => s.slug === "potential_lead")!;
    const completed = stages.find((s) => s.slug === "project_completed")!;
    expect(isLateStage(declined)).toBe(true);
    expect(defaultCollapsed(potential, 5)).toBe(false);
    expect(defaultCollapsed(potential, 0)).toBe(true);
    expect(defaultCollapsed(declined, 8)).toBe(true);
    expect(defaultCollapsed(completed, 3)).toBe(true);
  });

  it("previews five rows per group", () => {
    expect(PREVIEW_ROWS).toBe(5);
  });

  it("formats location as City, IL and marks long-open deals hot", () => {
    expect(formatLocation({ city: "Elk Grove Village", state: "IL" })).toBe("Elk Grove Village, IL");
    expect(formatLocation({ city: "Chicago", state: null })).toBe("Chicago, IL");
    expect(lengthTone(29)).toBe("ok");
    expect(lengthTone(31)).toBe("hot");
  });

  it("averages days open and counts by pipeline", () => {
    const now = new Date("2026-11-12T12:00:00.000Z");
    const deals = [
      deal({ id: "a", stage_slug: "potential_lead", opened_at: "2026-10-13T12:00:00.000Z" }), // 30d
      deal({ id: "b", stage_slug: "potential_lead", opened_at: "2026-11-02T12:00:00.000Z" }), // 10d
    ];
    expect(avgDaysOpen(deals, now)).toBe(20);
    expect(pipelineCounts([{ pipeline_slug: "single_family_whe" }, { pipeline_slug: "single_family_whe" }, { pipeline_slug: "multifamily_whe" }], ["single_family_whe", "multifamily_whe", "led_lighting"])).toEqual({
      single_family_whe: 2,
      multifamily_whe: 1,
      led_lighting: 0,
    });
  });

  it("initials use first and last name", () => {
    expect(initials("Maya Chen")).toBe("MC");
    expect(initials("Jordan")).toBe("J");
  });

  it("uses the street address as the deal headline and pretty-prints ALL-CAPS names", () => {
    const d = deal({ id: "a", stage_slug: "potential_lead", title: "GERLINE FISHER", address: "815 N Latrobe Ave", contact_name: "GERLINE FISHER" });
    expect(dealHeadline(d)).toBe("815 N Latrobe Ave");
    expect(dealCustomerName(d)).toBe("Gerline Fisher");
    expect(prettyName("MARIA & ISIDRO GUZMAN")).toBe("Maria & Isidro Guzman");
    expect(prettyName("Maya Chen")).toBe("Maya Chen");
  });
});
