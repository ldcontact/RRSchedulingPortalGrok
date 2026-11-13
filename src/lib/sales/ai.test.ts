import { afterEach, describe, expect, it, vi } from "vitest";
import type { SalesDeal } from "./types";

const KEYS = ["SALES_AI_PROVIDER", "SALES_AI_MODEL", "AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"] as const;

function isolateEnv() {
  const prev: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
  return () => {
    for (const k of KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
}

const deal = (over: Partial<SalesDeal> = {}): SalesDeal => ({
  id: "sd-1",
  pipeline_slug: "single_family_whe",
  stage_slug: "approved_ready",
  title: "Karla Gonzalez",
  customer_id: null,
  owner_id: "u-aaron",
  contact_name: "Karla Gonzalez",
  contact_phone: "708-679-4678",
  contact_email: null,
  address: "3642 South 52nd Court",
  city: "Cicero",
  state: "IL",
  zip: "60804",
  lat: null,
  lng: null,
  priority: "Low",
  source: "monday",
  assessment_date: "2026-05-07",
  assessment_starts_at: null,
  assessment_ends_at: null,
  scheduled_date: null,
  close_date: null,
  opened_at: "2026-03-31T12:00:00.000Z",
  value: 0,
  est_rebate: 0,
  converted_project_id: null,
  monday_item_id: "11633298670",
  monday_board_id: "1",
  notes: null,
  sms_consent: false,
  sms_consent_at: null,
  sms_consent_by: null,
  sms_consent_text_version: null,
  created_at: "2026-03-31T12:00:00.000Z",
  updated_at: "2026-03-31T12:00:00.000Z",
  ...over,
});

describe("ai flags", () => {
  let restore: () => void;
  afterEach(() => restore?.());

  it("stays off by default when no gateway auth is present", async () => {
    restore = isolateEnv();
    vi.resetModules();
    const { aiEnabled, aiProvider, summarizeDeal } = await import("./ai");
    expect(aiProvider()).toBe("none");
    expect(aiEnabled()).toBe(false);
    const result = await summarizeDeal(deal());
    expect(result.disabled).toBe(true);
    if (result.disabled) expect(result.reason).toMatch(/AI_GATEWAY_API_KEY|OIDC/);
  });

  it("uses the mock provider without calling the network", async () => {
    restore = isolateEnv();
    process.env.SALES_AI_PROVIDER = "mock";
    vi.resetModules();
    const { aiEnabled, summarizeDeal } = await import("./ai");
    expect(aiEnabled()).toBe(true);
    const result = await summarizeDeal(deal());
    expect(result.disabled).toBe(false);
    if (!result.disabled) {
      expect(result.provider).toBe("mock");
      expect(result.result.summary).toMatch(/Karla Gonzalez/);
      expect(result.result.nextStep).toMatch(/install window|convert/i);
      expect(result.result.followUp.body).toMatch(/Retrofit Rebates/);
      expect(result.result.followUp.body).toMatch(/STOP/);
    }
  });
});

describe("gateway summarizeDeal", () => {
  let restore: () => void;
  afterEach(() => {
    restore?.();
    vi.resetModules();
    vi.doUnmock("ai");
    vi.unstubAllGlobals();
  });

  it("calls the gateway model and returns a draft follow-up, never a sent message", async () => {
    restore = isolateEnv();
    process.env.SALES_AI_PROVIDER = "gateway";
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key-not-real";
    const generateText = vi.fn(async () => ({
      output: {
        summary: "Karla is approved and waiting to schedule in Cicero.",
        nextStep: "Offer two install windows this week.",
        followUp: { channel: "sms", body: "Hi Karla, this is Retrofit Rebates. Ready to schedule? Reply STOP to opt out." },
      },
    }));
    const object = vi.fn((opts: unknown) => opts);
    vi.doMock("ai", () => ({ generateText, Output: { object } }));
    vi.resetModules();
    const { summarizeDeal, SALES_AI_MODEL, aiEnabled } = await import("./ai");
    expect(aiEnabled()).toBe(true);
    const result = await summarizeDeal(deal());
    expect(generateText).toHaveBeenCalledTimes(1);
    const calls = generateText.mock.calls as unknown as Array<[{ model: string; prompt: string; system: string }]>;
    const arg = calls[0][0];
    expect(arg.model).toBe(SALES_AI_MODEL);
    expect(arg.model).toBe("google/gemini-2.5-flash-lite");
    expect(arg.prompt).toMatch(/Karla Gonzalez/);
    expect(arg.system).toMatch(/DRAFT only/i);
    expect(arg.system).not.toMatch(/auto-send|send now/i);
    expect(result).toEqual({
      disabled: false,
      provider: "gateway",
      model: "google/gemini-2.5-flash-lite",
      result: {
        summary: "Karla is approved and waiting to schedule in Cicero.",
        nextStep: "Offer two install windows this week.",
        followUp: { channel: "sms", body: "Hi Karla, this is Retrofit Rebates. Ready to schedule? Reply STOP to opt out." },
      },
    });
  });

  it("does not call the gateway when auth is missing, even if the provider is gateway", async () => {
    restore = isolateEnv();
    process.env.SALES_AI_PROVIDER = "gateway";
    const generateText = vi.fn();
    vi.doMock("ai", () => ({ generateText, Output: { object: (o: unknown) => o } }));
    vi.resetModules();
    const { summarizeDeal } = await import("./ai");
    const result = await summarizeDeal(deal());
    expect(generateText).not.toHaveBeenCalled();
    expect(result.disabled).toBe(true);
  });
});
