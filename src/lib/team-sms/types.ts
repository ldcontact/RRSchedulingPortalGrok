import type { TeamSmsEntityType, TeamSmsKind, TeamSmsStatus } from "./constants";
import type { TeamSmsPrefs } from "./prefs";

export type TeamSmsOutboxRow = {
  id: string;
  profile_id: string;
  to_phone: string;
  kind: TeamSmsKind;
  body: string;
  link: string | null;
  payload: Record<string, unknown>;
  status: TeamSmsStatus;
  send_after: string;
  sent_at: string | null;
  provider: string | null;
  provider_id: string | null;
  error: string | null;
  created_at: string;
};

export type TeamSmsEventRow = {
  id: string;
  profile_id: string;
  kind: "assignment" | "same_day";
  entity_type: TeamSmsEntityType;
  entity_id: string;
  summary: string;
  link: string;
  payload: Record<string, unknown>;
  outbox_id: string | null;
  created_at: string;
};

export type TeamSmsMember = TeamSmsPrefs & {
  profile_id: string;
  phone: string | null;
  role: string | null;
  active: boolean;
};

export type EnqueueInput = {
  profileId: string;
  kind: "assignment" | "same_day";
  entityType: TeamSmsEntityType;
  entityId: string;
  summary: string;
  link: string;
  payload?: Record<string, unknown>;
  now?: Date;
  actorId?: string | null;
};
