import { STOP_KEYWORDS } from "./constants";
import { prefsAfterStop } from "./prefs";
import { toE164 } from "./phone";
import type { TeamSmsStore } from "./store";

export function isStopKeyword(body: string | null | undefined): boolean {
  const t = (body ?? "").trim().toUpperCase().replace(/[^\w\s]/g, "");
  return (STOP_KEYWORDS as readonly string[]).includes(t);
}

export type InboundResult = {
  handled: boolean;
  stopped: boolean;
  profileId?: string;
  reason: string;
};

/**
 * Twilio inbound webhook handler for staff texts.
 * STOP (and standard opt-out keywords) turn every switch off on the matching
 * *profile* only — never a customer row.
 */
export async function handleTeamSmsInbound(
  store: TeamSmsStore,
  input: { from?: string | null; body?: string | null; now?: Date },
): Promise<InboundResult> {
  const from = toE164(input.from);
  if (!from) return { handled: false, stopped: false, reason: "Missing or invalid From number." };
  if (!isStopKeyword(input.body)) return { handled: true, stopped: false, reason: "Not a STOP keyword." };

  const member = await store.findMemberByPhone(from);
  if (!member) return { handled: true, stopped: false, reason: "No staff profile matches this number." };

  const at = (input.now ?? new Date()).toISOString();
  await store.setPrefs(member.profile_id, prefsAfterStop(at));
  return { handled: true, stopped: true, profileId: member.profile_id, reason: "Texting turned off after STOP." };
}
