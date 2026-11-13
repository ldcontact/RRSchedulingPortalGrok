import { randomUUID } from "crypto";
import { dayKey, minutesOfDay } from "@/lib/time";
import { formatMorningSummary, morningKey, siteBaseUrl, type MorningVisitLine } from "./copy";
import { inQuietHours } from "./schedule";
import { sendTeamSms, teamSmsEnabled } from "./send";
import { isForbiddenPhone, toE164 } from "./phone";
import type { TeamSmsStore } from "./store";
import type { TeamSmsOutboxRow } from "./types";

export type MorningVisitForMember = { profileId: string } & MorningVisitLine;

export type FlushResult = {
  examined: number;
  sent: number;
  held: number;
  failed: number;
  skipped: number;
  mornings: number;
};

/**
 * Send or re-hold every due outbox row. When the kill switch is off, due
 * queued rows become held (nothing is sent). Held rows stay held.
 */
export async function flushDueTeamSms(store: TeamSmsStore, now: Date = new Date()): Promise<Omit<FlushResult, "mornings">> {
  const rows = await store.listDueOutbox(now.toISOString());
  const result = { examined: rows.length, sent: 0, held: 0, failed: 0, skipped: 0 };
  // Do not send during quiet hours even if a row is somehow due.
  if (inQuietHours(now)) {
    result.skipped = rows.length;
    return result;
  }
  for (const row of rows) {
    if (row.status === "sent" || row.status === "canceled") {
      result.skipped += 1;
      continue;
    }
    if (!teamSmsEnabled() || row.status === "held") {
      if (row.status !== "held") {
        await store.updateOutbox(row.id, { status: "held", error: "TEAM_SMS_ENABLED is off. Message held in the outbox." });
      }
      result.held += 1;
      continue;
    }
    const blocked = !toE164(row.to_phone) || isForbiddenPhone(row.to_phone);
    if (blocked) {
      await store.updateOutbox(row.id, { status: "failed", error: "Refusing to send: reserved or invalid number." });
      result.failed += 1;
      continue;
    }
    const send = await sendTeamSms({ to: row.to_phone, body: row.body });
    if (send.held || (send.skipped && send.reason?.includes("TEAM_SMS_ENABLED"))) {
      await store.updateOutbox(row.id, { status: "held", provider: send.provider, error: send.reason ?? null });
      result.held += 1;
      continue;
    }
    if (send.skipped) {
      await store.updateOutbox(row.id, { status: "failed", provider: send.provider, error: send.reason ?? "Send skipped." });
      result.failed += 1;
      continue;
    }
    await store.updateOutbox(row.id, {
      status: "sent",
      sent_at: now.toISOString(),
      provider: send.provider,
      provider_id: send.id ?? null,
      error: null,
    });
    result.sent += 1;
  }
  return result;
}

/** One morning text per opted-in member listing today's visits in start order. Idempotent per day. */
export async function enqueueMorningSummaries(
  store: TeamSmsStore,
  visits: MorningVisitForMember[],
  now: Date = new Date(),
): Promise<TeamSmsOutboxRow[]> {
  const day = dayKey(now);
  const members = await store.listMorningOptInMembers();
  const byProfile = new Map<string, MorningVisitLine[]>();
  for (const v of visits) {
    const list = byProfile.get(v.profileId) ?? [];
    list.push({ startsAt: v.startsAt, address: v.address, city: v.city });
    byProfile.set(v.profileId, list);
  }
  const created: TeamSmsOutboxRow[] = [];
  for (const member of members) {
    if (!member.active || !member.sms_notify_morning || member.sms_stopped_at) continue;
    const phone = toE164(member.phone);
    if (!phone || isForbiddenPhone(phone)) continue;
    if (await store.hasMorning(member.profile_id, day)) continue;
    const body = formatMorningSummary(byProfile.get(member.profile_id) ?? []);
    const row: TeamSmsOutboxRow = {
      id: randomUUID(),
      profile_id: member.profile_id,
      to_phone: phone,
      kind: "morning",
      body,
      link: `${siteBaseUrl()}/schedule`,
      payload: { morning_for: morningKey(day) },
      status: teamSmsEnabled() ? "queued" : "held",
      send_after: now.toISOString(),
      sent_at: null,
      provider: null,
      provider_id: null,
      error: null,
      created_at: now.toISOString(),
    };
    await store.insertOutbox(row);
    created.push(row);
  }
  return created;
}

export async function runTeamSmsCron(
  store: TeamSmsStore,
  visitsToday: MorningVisitForMember[],
  now: Date = new Date(),
): Promise<FlushResult> {
  // Generate the 7 AM summary once the local clock is at or past 7:00,
  // including during the flush after quiet hours lift.
  const minutes = minutesOfDay(now);
  let mornings = 0;
  if (minutes >= 7 * 60) {
    const created = await enqueueMorningSummaries(store, visitsToday, now);
    mornings = created.length;
  }
  const flush = await flushDueTeamSms(store, now);
  return { ...flush, mornings };
}
