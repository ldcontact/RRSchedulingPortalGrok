"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSales } from "@/lib/auth";
import { getSalesRepo } from "@/lib/sales/repo";
import { canDeleteSalesRecord } from "@/lib/sales/permissions";

function pathFor(dealId?: string) {
  revalidatePath("/sales");
  if (dealId) revalidatePath(`/sales/deals/${dealId}`);
}

export async function moveDealStage(dealId: string, stage: string) {
  await requireSales();
  await (await getSalesRepo()).moveStage(dealId, stage);
  pathFor(dealId);
}

export async function saveDealNote(dealId: string, fd: FormData) {
  const user = await requireSales();
  const body = String(fd.get("body") ?? "").trim();
  if (!body) return;
  await (await getSalesRepo()).addActivity({
    deal_id: dealId, inbox_id: null, kind: "note", direction: "internal", status: "logged",
    subject: null, body, to_address: null, from_address: null, author_id: user.id, meta: null,
  });
  pathFor(dealId);
}

export async function draftMessage(dealId: string, fd: FormData) {
  const user = await requireSales();
  const kind = String(fd.get("kind") ?? "email") === "sms" ? "sms" : "email";
  const body = String(fd.get("body") ?? "").trim();
  const subject = String(fd.get("subject") ?? "").trim() || null;
  const to = String(fd.get("to") ?? "").trim() || null;
  if (!body) return;
  await (await getSalesRepo()).addActivity({
    deal_id: dealId, inbox_id: null, kind, direction: "outbound", status: "draft",
    subject, body, to_address: to, from_address: user.email, author_id: user.id, meta: null,
  });
  pathFor(dealId);
}

export async function sendDraftAction(activityId: string, dealId: string) {
  await requireSales();
  await (await getSalesRepo()).sendDraft(activityId);
  pathFor(dealId);
}

export async function acceptInboxAction(id: string) {
  const user = await requireSales();
  const deal = await (await getSalesRepo()).acceptInbox(id, { owner_id: user.id });
  pathFor(deal.id);
  redirect(`/sales/deals/${deal.id}`);
}

export async function dismissInboxAction(id: string) {
  await requireSales();
  await (await getSalesRepo()).dismissInbox(id);
  pathFor();
}

export async function deleteDealAction(dealId: string) {
  const user = await requireSales();
  if (!canDeleteSalesRecord(user)) throw new Error("permission denied");
  await (await getSalesRepo()).deleteDeal(dealId);
  pathFor();
  redirect("/sales");
}

export async function convertDealAction(dealId: string, fd: FormData) {
  await requireSales();
  const starts = String(fd.get("starts_at") ?? "").trim();
  const ends = String(fd.get("ends_at") ?? "").trim();
  const visit = starts && ends ? { starts_at: starts, ends_at: ends } : null;
  const { projectId } = await (await getSalesRepo()).convertDeal(dealId, visit);
  pathFor(dealId);
  redirect(`/projects/${projectId}`);
}

export async function createBookingLinkAction(dealId: string) {
  await requireSales();
  const token = await (await getSalesRepo()).createBookingLink(dealId);
  pathFor(dealId);
  return token;
}

export async function sendProposalAction(id: string, dealId: string) {
  await requireSales();
  await (await getSalesRepo()).sendProposal(id);
  pathFor(dealId);
}

export async function upsertProposalAction(dealId: string, fd: FormData) {
  await requireSales();
  const title = String(fd.get("title") ?? "Proposal").trim();
  const notes = String(fd.get("notes") ?? "") || null;
  const labels = fd.getAll("item_label").map(String);
  const amounts = fd.getAll("item_amount").map((v) => Number(v) || 0);
  const items = labels.map((label, i) => ({ label, amount: amounts[i] ?? 0 })).filter((i) => i.label.trim());
  const id = String(fd.get("id") ?? "") || undefined;
  await (await getSalesRepo()).upsertProposal({ id, deal_id: dealId, title, notes, items });
  pathFor(dealId);
}

export async function toggleAutomationAction(id: string, enabled: boolean) {
  await requireSales();
  const repo = await getSalesRepo();
  const current = (await repo.listAutomations()).find((a) => a.id === id);
  if (!current) return;
  await repo.upsertAutomation({ ...current, enabled });
  revalidatePath("/sales/automations");
}

export async function markAlertReadAction(id: string) {
  await requireSales();
  await (await getSalesRepo()).markAlertRead(id);
  pathFor();
}
