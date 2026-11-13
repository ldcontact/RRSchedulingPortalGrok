import { describe, expect, it } from "vitest";
import { customerMessageStartsAsDraft, DEFAULT_SEND_POLICY, resolveCustomerDelivery } from "./policy";
import { matchingAutomations, effectsFor, DEFAULT_AUTOMATIONS } from "./automations";
import { canOfferConvert, planConvert } from "./convert";
import { signProposal } from "./proposals";
import { mapMondayBoard, pipelineSlugForBoard, stageSlugForGroup } from "./import-monday";
import { openSlots } from "./booking";
import { localDealBrief } from "./ai";
import { smsEnabled } from "./sms";
import { aiEnabled, aiProvider } from "./ai";
import type { SalesDeal } from "./types";

const deal = (over: Partial<SalesDeal> = {}): SalesDeal => ({
  id: "d1",
  pipeline_slug: "single_family_whe",
  stage_slug: "approved_ready",
  title: "4821 Birchwood Ave",
  customer_id: "c1",
  owner_id: "u-sales",
  contact_name: "Elena Vasquez",
  contact_phone: "(847) 555-0142",
  contact_email: "elena@example.com",
  address: "4821 Birchwood Ave",
  city: "Schaumburg",
  state: "IL",
  zip: "60193",
  lat: 42.03,
  lng: -88.08,
  priority: "High",
  source: "web_form",
  assessment_date: "2026-11-04",
  assessment_starts_at: null,
  assessment_ends_at: null,
  scheduled_date: null,
  close_date: null,
  opened_at: "2026-10-05T15:00:00.000Z",
  value: 2450,
  est_rebate: 1850,
  converted_project_id: null,
  monday_item_id: null,
  monday_board_id: null,
  notes: null,
  sms_consent: false,
  sms_consent_at: null,
  sms_consent_by: null,
  sms_consent_text_version: null,
  created_at: "2026-10-05T15:00:00.000Z",
  updated_at: "2026-11-12T15:00:00.000Z",
  ...over,
});

describe("send policy", () => {
  it("keeps customer messages as drafts even when an automation asks to auto-send", () => {
    expect(customerMessageStartsAsDraft(DEFAULT_SEND_POLICY, true)).toBe(true);
    const r = resolveCustomerDelivery("sms", { sms: true, email: true }, DEFAULT_SEND_POLICY, true);
    expect(r.status).toBe("draft");
    expect(r.sent).toBe(false);
  });
});

describe("automations", () => {
  it("queues a confirmation draft and a task when a deal enters Assessment Scheduled", () => {
    const d = deal({ stage_slug: "assessment_scheduled", assessment_date: "2026-11-19" });
    const rules = DEFAULT_AUTOMATIONS.map((r, i) => ({ ...r, id: String(i) }));
    const match = matchingAutomations(rules, d, { type: "stage_entered" });
    expect(match.map((r) => r.name).join(" ")).toMatch(/Assessment Scheduled/);
    const effects = match.flatMap((r) => effectsFor(r, d));
    expect(effects.some((e) => e.kind === "task")).toBe(true);
    const sms = effects.find((e) => e.kind === "activity" && e.activity.kind === "sms");
    expect(sms?.kind === "activity" && sms.activity.status).toBe("draft");
    expect(sms?.kind === "activity" && sms.activity.body).toMatch(/Nov 19|2026-11-19|the scheduled day|You're booked/);
  });

  it("alerts the owner when a deal is stuck more than 14 days, but skips declined", () => {
    const stuck = deal({ stage_slug: "contacted_comed", opened_at: "2026-10-01T00:00:00.000Z" });
    const rules = DEFAULT_AUTOMATIONS.map((r, i) => ({ ...r, id: String(i) }));
    const now = new Date("2026-11-12T12:00:00.000Z");
    expect(matchingAutomations(rules, stuck, { type: "stuck_scan", now }).length).toBe(1);
    const declined = deal({ stage_slug: "declined", opened_at: "2026-09-01T00:00:00.000Z" });
    expect(matchingAutomations(rules, declined, { type: "stuck_scan", now }).length).toBe(0);
  });
});

describe("convert to project", () => {
  it("plans a Whole Home Electric project and moves the deal to Project Scheduled", () => {
    expect(canOfferConvert(deal())).toBe(true);
    const plan = planConvert({ deal: deal(), visit: { starts_at: "2026-11-18T14:00:00.000Z", ends_at: "2026-11-18T18:00:00.000Z" } });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.project.type).toBe("whe_single_family");
    expect(plan.project.name).toBe("4821 Birchwood Ave");
    expect(plan.nextStage).toBe("project_scheduled");
    expect(plan.visit?.title).toBe("Install visit");
  });

  it("refuses a convert when there is no customer or it is already linked", () => {
    expect(planConvert({ deal: deal({ customer_id: null }) }).ok).toBe(false);
    expect(planConvert({ deal: deal({ converted_project_id: "p1" }) }).ok).toBe(false);
    expect(canOfferConvert(deal({ converted_project_id: "p1" }))).toBe(false);
  });
});

describe("proposals", () => {
  it("signs with consent and moves the deal to Approved when needed", () => {
    const proposal = {
      id: "pr1", deal_id: "d1", title: "WHE proposal", status: "sent" as const, notes: null,
      items: [{ id: "i1", label: "Labor", amount: 2800, sort: 0 }], net: 2800,
      sent_at: "2026-11-12T14:00:00.000Z", signed_at: null, signer_name: null, signer_consent: false,
      created_at: "2026-11-12T14:00:00.000Z", updated_at: "2026-11-12T14:00:00.000Z",
    };
    const r = signProposal({ proposal, dealStage: "rise_data_entered", signerName: "Elena Vasquez", consent: true, method: "typed", now: new Date("2026-11-12T21:58:00.000Z") });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nextStage).toBe("approved_ready");
    expect(r.audit.signer_name).toBe("Elena Vasquez");
    expect(signProposal({ proposal, dealStage: "approved_ready", signerName: "", consent: true, method: "typed" }).ok).toBe(false);
    expect(signProposal({ proposal, dealStage: "approved_ready", signerName: "Elena", consent: false, method: "typed" }).ok).toBe(false);
  });
});

describe("monday import mapping", () => {
  it("maps board and group names, including Job Scheduled → Project Scheduled", () => {
    expect(pipelineSlugForBoard("SingleFamily - Project Tracker  WHE")).toBe("single_family_whe");
    expect(pipelineSlugForBoard("Multifamily -  Project Tracker  WHE")).toBe("multifamily_whe");
    expect(stageSlugForGroup("Job Scheduled", "single_family_whe")).toBe("project_scheduled");
    expect(stageSlugForGroup("Job Completed", "single_family_whe")).toBe("project_completed");
    expect(stageSlugForGroup("Project Not Feasible", "multifamily_whe")).toBe("not_feasible");
  });

  it("maps items and skips unknown groups", () => {
    const board = {
      id: "3747287195",
      name: "SingleFamily - Project Tracker  WHE",
      groups: [],
      columns: [],
      items: [
        { id: "1", name: "1182 Maple Lane", group: { id: "g", title: "Potential Lead" }, column_values: [
          { id: "location", text: "1182 Maple Lane, Schaumburg, IL 60193" },
          { id: "status9", text: "High" },
          { id: "person", text: "Maya Chen" },
          { id: "date1", text: "2026-10-31" },
        ] },
        { id: "2", name: "Mystery", group: { id: "x", title: "Something Else" }, column_values: [] },
      ],
    };
    const { deals, skipped } = mapMondayBoard(board);
    expect(deals).toHaveLength(1);
    expect(deals[0].stage_slug).toBe("potential_lead");
    expect(deals[0].city).toBe("Schaumburg");
    expect(deals[0].priority).toBe("High");
    expect(skipped).toHaveLength(1);
  });
});

describe("booking slots", () => {
  it("hides times that overlap an existing visit", () => {
    const slots = openSlots({
      days: ["2026-11-19"],
      starts: [8, 10, 13],
      durationHours: 2,
      occupied: [{ starts_at: "2026-11-19T10:00:00", ends_at: "2026-11-19T12:00:00" }],
    });
    expect(slots.map((s) => s.starts_at)).toEqual(["2026-11-19T08:00:00", "2026-11-19T13:00:00"]);
  });
});

describe("providers stay off by default", () => {
  it("does not enable SMS or AI without explicit env", () => {
    expect(smsEnabled()).toBe(false);
    expect(aiEnabled()).toBe(false);
    expect(aiProvider()).toBe("none");
  });

  it("can build a local brief without calling a network", () => {
    const brief = localDealBrief(deal());
    expect(brief.summary).toMatch(/Elena Vasquez/);
    expect(brief.nextStep).toMatch(/convert/i);
  });
});

describe("monday fixture file", () => {
  it("maps the checked-in sample snapshot", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { mapMondayBoard } = await import("./import-monday");
    const board = JSON.parse(readFileSync(resolve(process.cwd(), "scripts/fixtures/monday-sample.json"), "utf8"));
    const { deals, skipped } = mapMondayBoard(board);
    expect(deals).toHaveLength(2);
    expect(deals.find((d) => d.title === "15 N Windsor Dr")?.stage_slug).toBe("project_scheduled");
    expect(skipped).toHaveLength(1);
  });
});
