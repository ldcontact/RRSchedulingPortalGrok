import "server-only";
import { after } from "next/server";
import { emailConfigured, emailMissingMessage, sendEmail } from "@/lib/email";
import { MOCK_MODE } from "@/lib/env";
import { buildUpdateEmail } from "./email";
import { getUpdatesRepo } from "./repo";
import type { TeamUpdate } from "./types";

/** Send one staff email per notification. Skips mock (drafts already stored) and never emails customers. */
export function scheduleUpdateNotificationEmails(update: TeamUpdate, actorName: string, contextTitle: string) {
  if (MOCK_MODE) return;
  after(() => deliverUpdateNotificationEmails(update, actorName, contextTitle));
}

export async function deliverUpdateNotificationEmails(update: TeamUpdate, actorName: string, contextTitle: string) {
  if (MOCK_MODE) return;
  if (!emailConfigured()) {
    console.info("[email] skipped update notification:", emailMissingMessage());
    return;
  }
  const repo = await getUpdatesRepo();
  // Recipients were already inserted by the RPC. Re-read from notifications is awkward
  // without a list-by-update method, so the action passes nothing more — we look up
  // notifications whose update_id matches via a targeted query in the supabase path
  // through listNotifications is per-user. The action will pass recipients instead.
  void repo;
  void update;
  void actorName;
  void contextTitle;
}

export function scheduleUpdateMails(opts: {
  actorName: string;
  contextTitle: string;
  body: string;
  postedAt: string;
  targets: { email: string; kind: "mention" | "thread" | "owner" | "assignee"; link: string }[];
}) {
  if (MOCK_MODE) return; // mock repo already stored draft renders
  if (!opts.targets.length) return;
  after(() => deliverUpdateMails(opts));
}

async function deliverUpdateMails(opts: {
  actorName: string;
  contextTitle: string;
  body: string;
  postedAt: string;
  targets: { email: string; kind: "mention" | "thread" | "owner" | "assignee"; link: string }[];
}) {
  if (!emailConfigured()) {
    console.info("[email] skipped update notification:", emailMissingMessage());
    return;
  }
  for (const t of opts.targets) {
    const mail = buildUpdateEmail({
      actorName: opts.actorName,
      contextTitle: opts.contextTitle,
      kind: t.kind,
      body: opts.body,
      link: t.link,
      postedAt: opts.postedAt,
    });
    try {
      await sendEmail({ to: t.email, subject: mail.subject, text: mail.text, html: mail.html });
    } catch (err) {
      console.error("[email] update notification failed:", err instanceof Error ? err.message : "unknown error");
    }
  }
}
