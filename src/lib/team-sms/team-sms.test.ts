import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { zonedToUtc, dayKey } from "@/lib/time";
import { FORBIDDEN_MESSAGING_SERVICE_SIDS, FORBIDDEN_PHONE_NUMBERS, TEAM_SMS_MESSAGING_SERVICE_SID_DEFAULT } from "./constants";
import { formatBatchText, formatMorningSummary, formatSingleText, shortAddress, visitAssignmentSummary } from "./copy";
import { enqueueTeamSms } from "./enqueue";
import { enqueueMorningSummaries, flushDueTeamSms } from "./flush";
import { handleTeamSmsInbound, isStopKeyword } from "./inbound";
import { isForbiddenPhone, toE164 } from "./phone";
import { TEAM_SMS_PREF_DEFAULTS, anyTeamSmsPrefOn, normalizeTeamSmsPrefs, prefsAfterStop, prefsFromPatch } from "./prefs";
import { earliestSendAt, inQuietHours, isTodayOrTomorrow, nextSevenAmCt } from "./schedule";
import { cannotSendReason, sendTeamSms, teamMessagingServiceSid, teamSmsEnabled } from "./send";
import type { TeamSmsStore } from "./store";
import type { TeamSmsEventRow, TeamSmsMember, TeamSmsOutboxRow } from "./types";

const TECH = "u-tech1";
const PHONE = "+18475550102";

function member(over: Partial<TeamSmsMember> = {}): TeamSmsMember {
  return {
    profile_id: TECH,
    phone: "(847) 555-0102",
    role: "tech",
    active: true,
    sms_notify_assignment: true,
    sms_notify_same_day: true,
    sms_notify_morning: true,
    sms_stopped_at: null,
    ...over,
  };
}

function memoryStore(seed: TeamSmsMember[] = [member()]): TeamSmsStore & { outbox: TeamSmsOutboxRow[]; events: TeamSmsEventRow[]; members: Map<string, TeamSmsMember> } {
  const members = new Map(seed.map((m) => [m.profile_id, m]));
  const outbox: TeamSmsOutboxRow[] = [];
  const events: TeamSmsEventRow[] = [];
  return {
    members,
    outbox,
    events,
    async getMember(id) { return members.get(id) ?? null; },
    async findMemberByPhone(e164) {
      for (const m of members.values()) if (toE164(m.phone) === e164) return m;
      return null;
    },
    async listMorningOptInMembers() { return [...members.values()].filter((m) => m.sms_notify_morning); },
    async setPrefs(id, prefs) { const m = members.get(id); if (m) Object.assign(m, prefs); },
    async findOpenBatch(profileId, nowIso) {
      return outbox.find((r) => r.profile_id === profileId && (r.status === "queued" || r.status === "held") && r.kind !== "morning" && r.send_after > nowIso) ?? null;
    },
    async insertEvent(row) { events.push(row); },
    async insertOutbox(row) { outbox.push(row); },
    async updateOutbox(id, patch) {
      const row = outbox.find((r) => r.id === id);
      if (row) Object.assign(row, patch);
    },
    async listDueOutbox(nowIso) {
      return outbox.filter((r) => (r.status === "queued" || r.status === "held") && r.send_after <= nowIso);
    },
    async listEventsForOutbox(id) { return events.filter((e) => e.outbox_id === id); },
    async hasMorning(profileId, day) {
      return outbox.some((r) => r.profile_id === profileId && r.kind === "morning" && r.payload.morning_for === day);
    },
  };
}

const ENV_KEYS = ["TEAM_SMS_ENABLED", "TEAM_SMS_MESSAGING_SERVICE_SID", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"] as const;
let envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
  envBackup = {};
  for (const k of ENV_KEYS) {
    envBackup[k] = process.env[k];
    delete process.env[k];
  }
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (envBackup[k] === undefined) delete process.env[k];
    else process.env[k] = envBackup[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prefs", () => {
  it("defaults every switch off", () => {
    expect(normalizeTeamSmsPrefs(null)).toEqual(TEAM_SMS_PREF_DEFAULTS);
    expect(anyTeamSmsPrefOn(TEAM_SMS_PREF_DEFAULTS)).toBe(false);
  });

  it("STOP clears every switch and turning one back on is a new opt-in", () => {
    const stopped = prefsAfterStop("2026-11-13T14:00:00.000Z");
    expect(stopped.sms_notify_assignment).toBe(false);
    expect(stopped.sms_stopped_at).toBe("2026-11-13T14:00:00.000Z");
    const again = prefsFromPatch(stopped, { sms_notify_assignment: true });
    expect(again.sms_notify_assignment).toBe(true);
    expect(again.sms_stopped_at).toBeNull();
  });
});

describe("schedule", () => {
  it("treats 8 PM–7 AM CT as quiet hours and queues until 7 AM", () => {
    const eightPm = new Date(zonedToUtc("2026-11-13", 20 * 60));
    const sixAm = new Date(zonedToUtc("2026-11-14", 6 * 60));
    const sevenAm = new Date(zonedToUtc("2026-11-14", 7 * 60));
    const nineAm = new Date(zonedToUtc("2026-11-13", 9 * 60));
    expect(inQuietHours(eightPm)).toBe(true);
    expect(inQuietHours(sixAm)).toBe(true);
    expect(inQuietHours(sevenAm)).toBe(false);
    expect(inQuietHours(nineAm)).toBe(false);
    expect(earliestSendAt(eightPm).toISOString()).toBe(sevenAm.toISOString());
    expect(earliestSendAt(sixAm).toISOString()).toBe(sevenAm.toISOString());
    expect(nextSevenAmCt(sevenAm).toISOString()).toBe(sevenAm.toISOString());
  });

  it("batches 10 minutes later during the day", () => {
    const at = new Date(zonedToUtc("2026-11-13", 11 * 60));
    expect(earliestSendAt(at).getTime() - at.getTime()).toBe(10 * 60 * 1000);
  });

  it("flags visits today or tomorrow only", () => {
    const now = new Date(zonedToUtc("2026-11-13", 12 * 60));
    expect(isTodayOrTomorrow(zonedToUtc("2026-11-13", 15 * 60), now)).toBe(true);
    expect(isTodayOrTomorrow(zonedToUtc("2026-11-14", 9 * 60), now)).toBe(true);
    expect(isTodayOrTomorrow(zonedToUtc("2026-11-15", 9 * 60), now)).toBe(false);
  });
});

describe("copy", () => {
  it("shortens a street and matches the approved shape", () => {
    expect(shortAddress("3642 South 52nd Court", "Cicero")).toBe("3642 S 52nd Ct, Cicero");
    const starts = zonedToUtc("2026-11-17", 9 * 60);
    const summary = visitAssignmentSummary(starts, "3642 South 52nd Court", "Cicero");
    const body = formatSingleText({
      kind: "assignment",
      entityType: "visit",
      summary,
      link: "https://app.example.com/jobs/job-1",
    });
    expect(body).toBe(`RR: New visit Tue 9:00 AM, 3642 S 52nd Ct, Cicero. Open: https://app.example.com/jobs/job-1`);
  });

  it("batches several events into one text and uses / when links differ", () => {
    const body = formatBatchText([
      { kind: "assignment", entityType: "visit", summary: "New visit Tue 9:00 AM, 3642 S 52nd Ct, Cicero", link: "https://app.example.com/jobs/1" },
      { kind: "assignment", entityType: "task", summary: "New task: Check permit", link: "https://app.example.com/tasks/2" },
    ]);
    expect(body.startsWith("RR: 2 updates:")).toBe(true);
    expect(body).toContain("Open: https://app.example.com/");
  });

  it("lists morning visits in order", () => {
    const body = formatMorningSummary([
      { startsAt: zonedToUtc(dayKey(new Date()), 13 * 60), address: "219 Oakton St", city: "Des Plaines" },
      { startsAt: zonedToUtc(dayKey(new Date()), 9 * 60), address: "3642 South 52nd Court", city: "Cicero" },
    ]);
    expect(body.startsWith("RR: Today: 9:00 AM 3642 S 52nd Ct, Cicero; 1:00 PM 219 Oakton St, Des Plaines.")).toBe(true);
    expect(body).toContain("Open: https://app.example.com/schedule");
  });
});

describe("send kill switch and denylist", () => {
  it("defaults TEAM_SMS_ENABLED off and uses the approved team Messaging Service", () => {
    expect(teamSmsEnabled()).toBe(false);
    expect(teamMessagingServiceSid()).toBe(TEAM_SMS_MESSAGING_SERVICE_SID_DEFAULT);
  });

  it("refuses the reserved Unify service and number", () => {
    expect(cannotSendReason(PHONE, FORBIDDEN_MESSAGING_SERVICE_SIDS[0])).toMatch(/reserved/);
    expect(cannotSendReason(FORBIDDEN_PHONE_NUMBERS[0])).toMatch(/reserved/);
    expect(isForbiddenPhone(FORBIDDEN_PHONE_NUMBERS[0])).toBe(true);
  });

  it("holds instead of calling Twilio when the kill switch is off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendTeamSms({ to: PHONE, body: "RR: hi" });
    expect(result.held).toBe(true);
    expect(result.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not post to Twilio even if enabled when the destination is reserved", async () => {
    process.env.TEAM_SMS_ENABLED = "1";
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendTeamSms({ to: FORBIDDEN_PHONE_NUMBERS[0], body: "RR: hi" });
    expect(result.skipped).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("enqueue and flush", () => {
  it("writes held rows when the kill switch is off and batches two events in 10 minutes", async () => {
    const store = memoryStore();
    const now = new Date(zonedToUtc("2026-11-13", 11 * 60));
    const first = await enqueueTeamSms(store, {
      profileId: TECH, kind: "assignment", entityType: "visit", entityId: "job-1",
      summary: "New visit Tue 9:00 AM, 3642 S 52nd Ct, Cicero",
      link: "https://app.example.com/jobs/job-1",
      now,
    });
    expect(first?.status).toBe("held");
    const second = await enqueueTeamSms(store, {
      profileId: TECH, kind: "assignment", entityType: "task", entityId: "task-1",
      summary: "New task: Check permit",
      link: "https://app.example.com/tasks/task-1",
      now: new Date(now.getTime() + 2 * 60 * 1000),
    });
    expect(second?.id).toBe(first?.id);
    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0]!.kind).toBe("batch");
    expect(store.outbox[0]!.body).toContain("2 updates");
  });

  it("does not enqueue when the switch is off, there is no phone, or the actor assigned themselves", async () => {
    const store = memoryStore([
      member({ sms_notify_assignment: false }),
    ]);
    const now = new Date(zonedToUtc("2026-11-13", 11 * 60));
    expect(await enqueueTeamSms(store, {
      profileId: TECH, kind: "assignment", entityType: "visit", entityId: "j1",
      summary: "New visit", link: "https://app.example.com/jobs/j1", now,
    })).toBeNull();

    const noPhone = memoryStore([member({ phone: null })]);
    expect(await enqueueTeamSms(noPhone, {
      profileId: TECH, kind: "assignment", entityType: "visit", entityId: "j1",
      summary: "New visit", link: "https://app.example.com/jobs/j1", now,
    })).toBeNull();

    const self = memoryStore();
    expect(await enqueueTeamSms(self, {
      profileId: TECH, kind: "assignment", entityType: "visit", entityId: "j1",
      summary: "New visit", link: "https://app.example.com/jobs/j1", now, actorId: TECH,
    })).toBeNull();
  });

  it("flush leaves held messages unsent when the kill switch is off", async () => {
    const store = memoryStore();
    const now = new Date(zonedToUtc("2026-11-13", 11 * 60));
    await enqueueTeamSms(store, {
      profileId: TECH, kind: "assignment", entityType: "visit", entityId: "j1",
      summary: "New visit Tue 9:00 AM, 3642 S 52nd Ct, Cicero",
      link: "https://app.example.com/jobs/j1", now,
    });
    const dueAt = new Date(now.getTime() + 11 * 60 * 1000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await flushDueTeamSms(store, dueAt);
    expect(result.held).toBe(1);
    expect(result.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.outbox[0]!.status).toBe("held");
  });

  it("creates one idempotent morning summary per person", async () => {
    const store = memoryStore();
    const now = new Date(zonedToUtc("2026-11-13", 7 * 60));
    const visits = [
      { profileId: TECH, startsAt: zonedToUtc("2026-11-13", 9 * 60), address: "3642 South 52nd Court", city: "Cicero" },
    ];
    const first = await enqueueMorningSummaries(store, visits, now);
    const second = await enqueueMorningSummaries(store, visits, now);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(first[0]!.status).toBe("held");
    expect(first[0]!.body).toContain("Today:");
  });
});

describe("inbound STOP", () => {
  it("recognizes standard opt-out keywords", () => {
    expect(isStopKeyword("stop")).toBe(true);
    expect(isStopKeyword("STOPALL")).toBe(true);
    expect(isStopKeyword("hello")).toBe(false);
  });

  it("turns the matching staff profile's texting off and never looks up customers", async () => {
    const store = memoryStore();
    const result = await handleTeamSmsInbound(store, { from: "8475550102", body: "STOP", now: new Date("2026-11-13T15:00:00.000Z") });
    expect(result.stopped).toBe(true);
    expect(store.members.get(TECH)?.sms_notify_assignment).toBe(false);
    expect(store.members.get(TECH)?.sms_notify_morning).toBe(false);
    expect(store.members.get(TECH)?.sms_stopped_at).toBe("2026-11-13T15:00:00.000Z");
  });
});
