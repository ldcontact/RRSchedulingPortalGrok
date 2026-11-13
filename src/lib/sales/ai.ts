import { generateText, Output } from "ai";
import { z } from "zod";
import type { SalesActivity, SalesDeal } from "./types";

/** Wired to Vercel AI Gateway. Locally needs AI_GATEWAY_API_KEY; Vercel deployments use OIDC. */

export const SALES_AI_MODEL = "google/gemini-2.5-flash-lite";

export type AiSummary = {
  summary: string;
  nextStep: string;
  followUp: { channel: "sms" | "email"; body: string };
};

export type AiResult = { disabled: true; reason: string } | { disabled: false; provider: string; model?: string; result: AiSummary };

const briefSchema = z.object({
  summary: z.string(),
  nextStep: z.string(),
  followUp: z.object({
    channel: z.enum(["sms", "email"]),
    body: z.string(),
  }),
});

export function hasGatewayAuth(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export function aiProvider(): "none" | "mock" | "gateway" {
  const p = (process.env.SALES_AI_PROVIDER ?? "gateway").toLowerCase();
  if (p === "off" || p === "none") return "none";
  if (p === "mock") return "mock";
  if (p === "gateway") return hasGatewayAuth() ? "gateway" : "none";
  return "none";
}

export function aiEnabled() {
  return aiProvider() !== "none";
}

export function salesAiModel() {
  return process.env.SALES_AI_MODEL?.trim() || SALES_AI_MODEL;
}

/** Deterministic local summary for mock mode only. Never calls a paid API. */
export function localDealBrief(deal: SalesDeal, activities: SalesActivity[] = []): AiSummary {
  const who = deal.contact_name ?? "The customer";
  const bits = [
    `${who} at ${deal.title}${deal.city ? ` in ${deal.city}` : ""}.`,
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
    ? `Hi ${who}, this is Retrofit Rebates. Your home is approved to schedule. I have a window I can hold — should I book it for you? Reply STOP to opt out.`
    : `Hi ${who}, this is Retrofit Rebates checking in on ${deal.title}. Do you have a moment to talk next steps? Reply STOP to opt out.`;
  return { summary: bits.join(" "), nextStep: next, followUp: { channel: "sms", body: follow } };
}

export function dealBriefPrompt(deal: SalesDeal, activities: SalesActivity[] = []): string {
  const activity = activities.slice(-8).map((a) => `- ${a.kind}/${a.status}: ${a.body.slice(0, 240)}`).join("\n") || "(no activity)";
  return [
    `Deal: ${deal.title}`,
    `Contact: ${deal.contact_name ?? "unknown"}`,
    `Phone: ${deal.contact_phone ?? "none"}`,
    `Email: ${deal.contact_email ?? "none"}`,
    `Address: ${[deal.address, deal.city, deal.state, deal.zip].filter(Boolean).join(", ") || "none"}`,
    `Stage: ${deal.stage_slug}`,
    `Priority: ${deal.priority ?? "none"}`,
    `Assessment date: ${deal.assessment_date ?? "none"}`,
    `Notes: ${deal.notes ?? "none"}`,
    `Recent activity:\n${activity}`,
  ].join("\n");
}

export async function summarizeDeal(deal: SalesDeal, activities: SalesActivity[] = []): Promise<AiResult> {
  const provider = aiProvider();
  if (provider === "none") {
    const wanted = (process.env.SALES_AI_PROVIDER ?? "gateway").toLowerCase();
    if (wanted === "gateway" || wanted === "") {
      return {
        disabled: true,
        reason: "AI is wired to Vercel AI Gateway (google/gemini-2.5-flash-lite). This environment has no AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN, so summaries stay off here.",
      };
    }
    return { disabled: true, reason: "AI summaries are off." };
  }
  if (provider === "mock") {
    return { disabled: false, provider: "mock", result: localDealBrief(deal, activities) };
  }

  try {
    const { output } = await generateText({
      model: salesAiModel(),
      output: Output.object({ schema: briefSchema }),
      system: [
        "You write a brief sales CRM card for Retrofit Rebates, a Chicagoland energy-efficiency contractor.",
        "Return a short factual summary (2-4 sentences), one concrete next step for the rep, and a follow-up message body.",
        "The follow-up is a DRAFT only. Never claim a message was sent. Do not invent facts, rebates, dates, or promises that are not in the deal data.",
        "Prefer SMS when a phone number is present, otherwise email. Keep the follow-up under 320 characters for SMS.",
        "Sign the follow-up as Retrofit Rebates. If the channel is SMS, end with: Reply STOP to opt out.",
      ].join(" "),
      prompt: dealBriefPrompt(deal, activities),
    });
    const parsed = briefSchema.safeParse(output);
    if (!parsed.success) {
      return { disabled: true, reason: "The AI gateway returned an incomplete brief. Try again in a moment." };
    }
    return { disabled: false, provider: "gateway", model: salesAiModel(), result: parsed.data };
  } catch {
    return { disabled: true, reason: "The AI gateway request failed. Check OIDC or AI_GATEWAY_API_KEY and try again." };
  }
}
