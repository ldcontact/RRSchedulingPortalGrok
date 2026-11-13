import {
  FORBIDDEN_MESSAGING_SERVICE_SIDS,
  TEAM_SMS_MESSAGING_SERVICE_SID_DEFAULT,
} from "./constants";
import { isForbiddenPhone, toE164 } from "./phone";

export type TeamSmsSendResult = {
  skipped: boolean;
  held: boolean;
  provider: "none" | "twilio";
  id?: string;
  reason?: string;
};

/** Kill switch. Default off — nothing is sent until TEAM_SMS_ENABLED=1. */
export function teamSmsEnabled(): boolean {
  const raw = (process.env.TEAM_SMS_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function teamMessagingServiceSid(): string {
  return (process.env.TEAM_SMS_MESSAGING_SERVICE_SID ?? TEAM_SMS_MESSAGING_SERVICE_SID_DEFAULT).trim();
}

function hasTwilioCreds(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export function cannotSendReason(to: string, serviceSid = teamMessagingServiceSid()): string | null {
  if ((FORBIDDEN_MESSAGING_SERVICE_SIDS as readonly string[]).includes(serviceSid)) {
    return "Refusing to send: this Messaging Service is reserved and must not be used for team texts.";
  }
  const e164 = toE164(to);
  if (!e164) return "Phone number is missing or is not a valid US number.";
  if (isForbiddenPhone(e164)) {
    return "Refusing to send: this number is reserved and must not be used for team texts.";
  }
  return null;
}

/**
 * Deliver a staff text through the team Messaging Service.
 * Returns held/skipped when the kill switch is off or Twilio is not wired.
 * Never throws; never sends through the reserved Unify service or number.
 */
export async function sendTeamSms(input: { to: string; body: string }): Promise<TeamSmsSendResult> {
  const blocked = cannotSendReason(input.to);
  if (blocked) return { skipped: true, held: false, provider: "none", reason: blocked };

  if (!teamSmsEnabled()) {
    return { skipped: true, held: true, provider: hasTwilioCreds() ? "twilio" : "none", reason: "TEAM_SMS_ENABLED is off. Message held in the outbox." };
  }
  if (!hasTwilioCreds()) {
    return { skipped: true, held: true, provider: "none", reason: "Twilio credentials are not set. Message held." };
  }

  const body = (input.body ?? "").trim();
  if (!body) return { skipped: true, held: false, provider: "twilio", reason: "Message body is empty." };

  const to = toE164(input.to)!;
  const serviceSid = teamMessagingServiceSid();
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      Body: body,
      MessagingServiceSid: serviceSid,
    }),
  });

  if (!res.ok) {
    return {
      skipped: true,
      held: false,
      provider: "twilio",
      reason: `Twilio rejected the send (${res.status}). Check A2P registration and the team messaging service.`,
    };
  }

  let id: string | undefined;
  try {
    const data = (await res.json()) as { sid?: unknown };
    if (typeof data.sid === "string" && data.sid) id = data.sid;
  } catch {
    // id is optional
  }
  return { skipped: false, held: false, provider: "twilio", id };
}
