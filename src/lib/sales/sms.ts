/**
 * Sales CRM SMS via Twilio.
 *
 * Sends stay off until A2P 10DLC registration is approved, even if Twilio
 * credentials are already on the box. To enable later:
 *   SALES_SMS_PROVIDER=twilio
 *   SALES_SMS_ALLOW_SEND=1
 *   TWILIO_MESSAGING_SERVICE_SID=<sid of a NEW dedicated Sales messaging service>
 *
 * Do not reuse the existing "Unify Notification" messaging service.
 * Outgoing messages remain drafts until a rep clicks Send. This module
 * never auto-sends.
 */

export type SmsSendInput = { to: string; body: string };
export type SmsSendResult = {
  skipped: boolean;
  provider: "none" | "twilio";
  id?: string;
  reason?: string;
};

const DISABLED_REASON =
  "SMS is disabled until Twilio A2P 10DLC registration is approved.";
const WIRED_OFF_REASON =
  "Twilio is wired but sends stay off until A2P 10DLC registration is approved (set SALES_SMS_ALLOW_SEND=1 after approval).";
const MISSING_SERVICE_REASON =
  "Set TWILIO_MESSAGING_SERVICE_SID to the dedicated Sales messaging service. Do not reuse Unify Notification.";

function hasTwilioCreds(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export function smsProvider(): "none" | "twilio" {
  if (process.env.SALES_SMS_PROVIDER === "twilio" && hasTwilioCreds()) return "twilio";
  return "none";
}

/** True only after Luke flips the allow-send flag following A2P approval. */
export function smsEnabled(): boolean {
  return smsProvider() === "twilio" && process.env.SALES_SMS_ALLOW_SEND === "1";
}

/** Normalize a US number to E.164. Returns null if it cannot be used. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+") && digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendSms(input: SmsSendInput): Promise<SmsSendResult> {
  if (smsProvider() !== "twilio") {
    return { skipped: true, provider: "none", reason: DISABLED_REASON };
  }
  if (process.env.SALES_SMS_ALLOW_SEND !== "1") {
    return { skipped: true, provider: "twilio", reason: WIRED_OFF_REASON };
  }
  const serviceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (!serviceSid) {
    return { skipped: true, provider: "twilio", reason: MISSING_SERVICE_REASON };
  }
  const to = toE164(input.to);
  if (!to) {
    return { skipped: true, provider: "twilio", reason: "Phone number is missing or is not a valid US number." };
  }
  const body = (input.body ?? "").trim();
  if (!body) {
    return { skipped: true, provider: "twilio", reason: "Message body is empty." };
  }

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
    // Do not surface Twilio's raw body — it can include account identifiers.
    return {
      skipped: true,
      provider: "twilio",
      reason: `Twilio rejected the send (${res.status}). Check A2P registration and the Sales messaging service.`,
    };
  }

  let id: string | undefined;
  try {
    const data = (await res.json()) as { sid?: unknown };
    if (typeof data.sid === "string" && data.sid) id = data.sid;
  } catch {
    // Delivered as far as we can tell; id is optional.
  }
  return { skipped: false, provider: "twilio", id };
}
