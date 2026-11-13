import type { TeamSmsEventRow, TeamSmsMember, TeamSmsOutboxRow } from "./types";
import type { TeamSmsPrefs } from "./prefs";

export type TeamSmsStore = {
  getMember(profileId: string): Promise<TeamSmsMember | null>;
  findMemberByPhone(e164: string): Promise<TeamSmsMember | null>;
  listMorningOptInMembers(): Promise<TeamSmsMember[]>;
  setPrefs(profileId: string, prefs: TeamSmsPrefs): Promise<void>;
  findOpenBatch(profileId: string, nowIso: string): Promise<TeamSmsOutboxRow | null>;
  insertEvent(row: TeamSmsEventRow): Promise<void>;
  insertOutbox(row: TeamSmsOutboxRow): Promise<void>;
  updateOutbox(id: string, patch: Partial<TeamSmsOutboxRow>): Promise<void>;
  listDueOutbox(nowIso: string): Promise<TeamSmsOutboxRow[]>;
  listEventsForOutbox(outboxId: string): Promise<TeamSmsEventRow[]>;
  hasMorning(profileId: string, day: string): Promise<boolean>;
};

export const OPEN_BATCH_STATUSES = ["queued", "held"] as const;
