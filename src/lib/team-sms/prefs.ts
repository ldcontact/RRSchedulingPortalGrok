export type TeamSmsPrefs = {
  sms_notify_assignment: boolean;
  sms_notify_same_day: boolean;
  sms_notify_morning: boolean;
  sms_stopped_at: string | null;
};

export const TEAM_SMS_PREF_DEFAULTS: TeamSmsPrefs = {
  sms_notify_assignment: false,
  sms_notify_same_day: false,
  sms_notify_morning: false,
  sms_stopped_at: null,
};

export function normalizeTeamSmsPrefs(row?: Partial<TeamSmsPrefs> | null): TeamSmsPrefs {
  return {
    sms_notify_assignment: !!row?.sms_notify_assignment,
    sms_notify_same_day: !!row?.sms_notify_same_day,
    sms_notify_morning: !!row?.sms_notify_morning,
    sms_stopped_at: row?.sms_stopped_at ?? null,
  };
}

export function anyTeamSmsPrefOn(prefs: Pick<TeamSmsPrefs, "sms_notify_assignment" | "sms_notify_same_day" | "sms_notify_morning">): boolean {
  return !!(prefs.sms_notify_assignment || prefs.sms_notify_same_day || prefs.sms_notify_morning);
}

/** After STOP, every switch is off and a timestamp is recorded. */
export function prefsAfterStop(at: string): TeamSmsPrefs {
  return {
    sms_notify_assignment: false,
    sms_notify_same_day: false,
    sms_notify_morning: false,
    sms_stopped_at: at,
  };
}

/** Turning a switch back on after STOP is a new opt-in and clears the STOP stamp. */
export function prefsFromPatch(previous: TeamSmsPrefs, patch: Partial<TeamSmsPrefs>): TeamSmsPrefs {
  const next = { ...previous, ...patch };
  if (anyTeamSmsPrefOn(next) && previous.sms_stopped_at && !patch.sms_stopped_at) {
    next.sms_stopped_at = null;
  }
  if (!anyTeamSmsPrefOn(next) && patch.sms_stopped_at !== undefined) {
    next.sms_stopped_at = patch.sms_stopped_at;
  }
  return normalizeTeamSmsPrefs(next);
}
