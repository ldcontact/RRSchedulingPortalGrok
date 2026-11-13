import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTeamSmsPrefs, type TeamSmsPrefs } from "./prefs";
import { toE164 } from "./phone";
import type { TeamSmsStore } from "./store";
import type { TeamSmsEventRow, TeamSmsMember, TeamSmsOutboxRow } from "./types";

type ProfileRow = {
  id: string;
  phone: string | null;
  role: string | null;
  active: boolean;
  deleted_at?: string | null;
  sms_notify_assignment?: boolean;
  sms_notify_same_day?: boolean;
  sms_notify_morning?: boolean;
  sms_stopped_at?: string | null;
};

function toMember(p: ProfileRow): TeamSmsMember {
  return {
    profile_id: p.id,
    phone: p.phone,
    role: p.role,
    active: !!p.active && !p.deleted_at,
    ...normalizeTeamSmsPrefs(p),
  };
}

const PREF_COLS = "id, phone, role, active, deleted_at, sms_notify_assignment, sms_notify_same_day, sms_notify_morning, sms_stopped_at";

export function supabaseTeamSmsStore(s: SupabaseClient): TeamSmsStore {
  return {
    async getMember(profileId) {
      const { data, error } = await s.from("profiles").select(PREF_COLS).eq("id", profileId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? toMember(data as ProfileRow) : null;
    },
    async findMemberByPhone(e164) {
      const { data, error } = await s.from("profiles").select(PREF_COLS).is("deleted_at", null).not("phone", "is", null);
      if (error) throw error;
      const match = ((data ?? []) as ProfileRow[]).find((p) => toE164(p.phone) === e164);
      return match ? toMember(match) : null;
    },
    async listMorningOptInMembers() {
      const { data, error } = await s.from("profiles").select(PREF_COLS).eq("sms_notify_morning", true).eq("active", true).is("deleted_at", null).not("role", "is", null).is("sms_stopped_at", null);
      if (error) throw error;
      return ((data ?? []) as ProfileRow[]).map(toMember);
    },
    async setPrefs(profileId, prefs) {
      const { error } = await s.from("profiles").update({
        sms_notify_assignment: prefs.sms_notify_assignment,
        sms_notify_same_day: prefs.sms_notify_same_day,
        sms_notify_morning: prefs.sms_notify_morning,
        sms_stopped_at: prefs.sms_stopped_at,
      }).eq("id", profileId);
      if (error) throw error;
    },
    async findOpenBatch(profileId, nowIso) {
      const { data, error } = await s.from("team_sms_outbox")
        .select("*")
        .eq("profile_id", profileId)
        .in("status", ["queued", "held"])
        .neq("kind", "morning")
        .gt("send_after", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as TeamSmsOutboxRow | null) ?? null;
    },
    async insertEvent(row) {
      const { error } = await s.from("team_sms_events").insert(row);
      if (error) throw error;
    },
    async insertOutbox(row) {
      const { error } = await s.from("team_sms_outbox").insert(row);
      if (error) throw error;
    },
    async updateOutbox(id, patch) {
      const { error } = await s.from("team_sms_outbox").update(patch).eq("id", id);
      if (error) throw error;
    },
    async listDueOutbox(nowIso) {
      const { data, error } = await s.from("team_sms_outbox")
        .select("*")
        .in("status", ["queued", "held"])
        .lte("send_after", nowIso)
        .order("send_after");
      if (error) throw error;
      return (data ?? []) as TeamSmsOutboxRow[];
    },
    async listEventsForOutbox(outboxId) {
      const { data, error } = await s.from("team_sms_events").select("*").eq("outbox_id", outboxId).order("created_at");
      if (error) throw error;
      return (data ?? []) as TeamSmsEventRow[];
    },
    async hasMorning(profileId, day) {
      const { data, error } = await s.from("team_sms_outbox").select("id").eq("profile_id", profileId).eq("kind", "morning").contains("payload", { morning_for: day }).limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  };
}

export async function applyTeamSmsPrefs(
  s: SupabaseClient,
  email: string,
  patch: Partial<Pick<TeamSmsPrefs, "sms_notify_assignment" | "sms_notify_same_day" | "sms_notify_morning">>,
) {
  const e = email.toLowerCase();
  const { error: invErr } = await s.from("invites").update(patch).eq("email", e);
  if (invErr) throw invErr;
  const { data: existing } = await s.from("profiles").select(PREF_COLS).eq("email", e).is("deleted_at", null).maybeSingle();
  if (!existing) return;
  const prev = normalizeTeamSmsPrefs(existing as ProfileRow);
  const next = {
    ...prev,
    ...patch,
    sms_stopped_at: (patch.sms_notify_assignment || patch.sms_notify_same_day || patch.sms_notify_morning) ? null : prev.sms_stopped_at,
  };
  // If they turned a switch on after STOP, clear the stamp.
  if (next.sms_notify_assignment || next.sms_notify_same_day || next.sms_notify_morning) next.sms_stopped_at = null;
  const { error } = await s.from("profiles").update(next).eq("email", e).is("deleted_at", null);
  if (error) throw error;
}
