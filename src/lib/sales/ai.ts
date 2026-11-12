import type { SalesActivity, SalesDeal } from "./types";

/** AI provider interface. Disabled until Luke approves an AI service — no new keys. */
export type AiSummary = {
  summary: string;
  nextStep: string;
  followUp: { channel: "sms" | "email"; body: string };
};

export type AiResult = { disabled: true; reason: string } | { disabled: false; provider: string; result: AiSummary };

export function aiProvider(): "none" | "mock" | "gateway" {
  const p = (process.env.SALES_AI_PROVIDER ?? "").toLowerCase();
  if (p === "mock") return "mock";
  if (p === "gateway" && (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) return "gateway";
  return "none";
}

export function aiEnabled() {
  return aiProvider() !== "none";
}

/** Deterministic local summary for mock mode only. Never calls a paid API. */
export function localDealBrief(deal: SalesDeal, activities: SalesActivity[] = []): AiSummary {
  const bits = [
    `${deal.contact_name ?? "The customer"} at ${deal.title}${deal.city ? ` in ${deal.city}` : ""}.`,
    `Stage: ${deal.stage_slug.replace(/_/g, " ")}.`,
    deal.assessment_date ? `Assessment date ${deal.assessment_date}.` : "No assessment date yet.",
  ];
  const last = activities.filter((a) => a.status === "received" || a.kind === "note").at(-1);
  if (last) bits.push(last.body.slice(0, 180));
  const next = deal.stage_slug === "approved_ready"
    ? "Confirm an install window and convert this deal to a project when the customer agrees."
    : deal.stage_slug === "contacted_comed"
      ? "Follow up on ComEd verification and move the deal when the account is cleared."
      : "Review the latest activity and move the deal to the next stage when ready.";
  const follow = deal.stage_slug === "approved_ready"
    ? `Hi ${deal.contact_name ?? "there"}, your home is approved to schedule. I have a window I can hold — should I book it for you?`
    : `Hi ${deal.contact_name ?? "there"}, just checking in on ${deal.title}. Do you have a moment to talk next steps?`;
  return { summary: bits.join(" "), nextStep: next, followUp: { channel: "sms", body: follow } };
}

export async function summarizeDeal(deal: SalesDeal, activities: SalesActivity[] = []): Promise<AiResult> {
  const provider = aiProvider();
  if (provider === "none") {
    return { disabled: true, reason: "AI summaries are off until Luke approves an AI service." };
  }
  if (provider === "mock") {
    return { disabled: false, provider: "mock", result: localDealBrief(deal, activities) };
  }
  // Gateway path is reserved; do not call out until a key is approved and wired.
  return { disabled: true, reason: "The AI gateway is not wired yet." };
}
