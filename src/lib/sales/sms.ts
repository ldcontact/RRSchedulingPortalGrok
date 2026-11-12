/** SMS provider interface. Disabled until Luke approves Twilio — no signup or keys in this work. */

export type SmsSendInput = { to: string; body: string };
export type SmsSendResult = { skipped: boolean; provider: "none" | "twilio"; id?: string; reason?: string };

export function smsProvider(): "none" | "twilio" {
  if (process.env.SALES_SMS_PROVIDER === "twilio" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return "twilio";
  }
  return "none";
}

export function smsEnabled() {
  return smsProvider() !== "none";
}

export async function sendSms(input: SmsSendInput): Promise<SmsSendResult> {
  if (!smsEnabled()) {
    return { skipped: true, provider: "none", reason: "SMS is disabled until Luke approves a provider (Twilio)." };
  }
  // Intentionally not implemented: do not call Twilio until approved and keys are set by Luke.
  void input;
  return { skipped: true, provider: "twilio", reason: "Twilio send is not wired yet." };
}
