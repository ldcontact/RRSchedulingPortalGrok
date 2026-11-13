import { describe, expect, it } from "vitest";
import { PIPELINE_DEFS } from "./catalog";
import {
  applyStageMove,
  moveStageConfirmText,
  pendingStageMove,
  stageSlugFromDropTarget,
} from "./pipeline-table-drag";
import { avgDaysOpen, groupDealsByStage } from "./pipeline-table";
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
  city: "Chicago",
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
  sms_consent: false,
  sms_consent_at: null,
  sms_consent_by: null,
  sms_consent_text_version: null,
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-01T12:00:00.000Z",
  ...over,
});

describe("pipeline table stage drag helpers", () => {
  it("moves a deal into another stage and leaves others alone", () => {
    const deals = [
      deal({ id: "a", stage_slug: "potential_lead", address: "8212 South Kingston Avenue" }),
      deal({ id: "b", stage_slug: "potential_lead" }),
      deal({ id: "c", stage_slug: "contacted_comed" }),
    ];
    const next = applyStageMove(deals, "a", "ready_for_assessment");
    expect(next.find((d) => d.id === "a")!.stage_slug).toBe("ready_for_assessment");
    expect(next.find((d) => d.id === "b")!.stage_slug).toBe("potential_lead");
    expect(next).not.toBe(deals);
  });

  it("is a no-op when the deal is already in that stage", () => {
    const deals = [deal({ id: "a", stage_slug: "potential_lead" })];
    expect(applyStageMove(deals, "a", "potential_lead")).toBe(deals);
  });

  it("is a no-op when the deal is missing", () => {
    const deals = [deal({ id: "a", stage_slug: "potential_lead" })];
    expect(applyStageMove(deals, "missing", "contacted_comed")).toBe(deals);
  });

  it("updates group counts and average days after a move", () => {
    const now = new Date("2026-11-12T12:00:00.000Z");
    const deals = [
      deal({ id: "a", stage_slug: "potential_lead", opened_at: "2026-10-13T12:00:00.000Z" }), // 30d
      deal({ id: "b", stage_slug: "potential_lead", opened_at: "2026-11-02T12:00:00.000Z" }), // 10d
      deal({ id: "c", stage_slug: "ready_for_assessment", opened_at: "2026-11-02T12:00:00.000Z" }), // 10d
    ];
    const before = groupDealsByStage(deals, stages);
    expect(before.find((g) => g.stage.slug === "potential_lead")!.deals).toHaveLength(2);
    expect(avgDaysOpen(before.find((g) => g.stage.slug === "potential_lead")!.deals, now)).toBe(20);
    expect(before.find((g) => g.stage.slug === "ready_for_assessment")!.deals).toHaveLength(1);

    const after = groupDealsByStage(applyStageMove(deals, "a", "ready_for_assessment"), stages);
    expect(after.find((g) => g.stage.slug === "potential_lead")!.deals).toHaveLength(1);
    expect(avgDaysOpen(after.find((g) => g.stage.slug === "potential_lead")!.deals, now)).toBe(10);
    expect(after.find((g) => g.stage.slug === "ready_for_assessment")!.deals.map((d) => d.id).sort()).toEqual(["a", "c"]);
    expect(avgDaysOpen(after.find((g) => g.stage.slug === "ready_for_assessment")!.deals, now)).toBe(20);
  });

  it("builds a confirm prompt and rejects same-stage or unknown targets", () => {
    const d = deal({ id: "a", stage_slug: "potential_lead", address: "8212 South Kingston Avenue", title: "Angela" });
    const pending = pendingStageMove({ deal: d, stages, toSlug: "contacted_comed" });
    expect(pending).toEqual({
      dealId: "a",
      headline: "8212 South Kingston Avenue",
      fromSlug: "potential_lead",
      fromName: "Potential Lead",
      toSlug: "contacted_comed",
      toName: "Contacted ComEd Verification",
    });
    expect(moveStageConfirmText(pending!)).toBe(
      "Move 8212 South Kingston Avenue from Potential Lead to Contacted ComEd Verification?",
    );
    expect(pendingStageMove({ deal: d, stages, toSlug: "potential_lead" })).toBeNull();
    expect(pendingStageMove({ deal: d, stages, toSlug: "not_a_stage" })).toBeNull();
    expect(pendingStageMove({ deal: d, stages, toSlug: "_other" })).toBeNull();
  });

  it("lets a deal move into a terminal or Approved stage without converting", () => {
    const d = deal({ id: "a", stage_slug: "potential_lead", address: "1214 North 15th Avenue" });
    expect(pendingStageMove({ deal: d, stages, toSlug: "declined" })?.toName).toBe("Declined By Projects");
    expect(pendingStageMove({ deal: d, stages, toSlug: "approved_ready" })?.toName).toBe("Approved - Ready to Schedule");
    expect(pendingStageMove({ deal: d, stages, toSlug: "project_scheduled" })?.toName).toBe("Project Scheduled");
  });

  it("reads the stage slug from a drop-target ancestor", () => {
    const root = { dataset: { stageDrop: "ready_for_assessment" } } as unknown as HTMLElement;
    const child = { closest: (sel: string) => (sel === "[data-stage-drop]" ? root : null) } as unknown as Element;
    expect(stageSlugFromDropTarget(child)).toBe("ready_for_assessment");
    const other = { dataset: { stageDrop: "_other" } } as unknown as HTMLElement;
    const otherChild = { closest: (sel: string) => (sel === "[data-stage-drop]" ? other : null) } as unknown as Element;
    expect(stageSlugFromDropTarget(otherChild)).toBeNull();
    expect(stageSlugFromDropTarget(null)).toBeNull();
  });
});
