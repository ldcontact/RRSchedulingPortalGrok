import "server-only";
import type { Channel } from "@/lib/types";

/**
 * Outbound customer messaging. Phase 2 only LOGS messages (to public.messages);
 * nothing is actually sent. To go live later, implement a provider below and
 * select it with MESSAGING_PROVIDER, e.g.:
 *   - text:  Twilio  (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)
 *   - email: Resend  (RESEND_API_KEY, RESEND_FROM)
 * The caller always records the message in the log regardless of provider.
 */
export type Outbound = { channel: Channel; to: { phone?: string | null; email?: string | null; name?: string }; subject?: string | null; body: string };
export type SendResult = { delivered: boolean; provider: string; detail?: string };

export interface MessagingProvider { name: string; send(m: Outbound): Promise<SendResult> }

const logOnly: MessagingProvider = {
  name: "log-only",
  async send() { return { delivered: false, provider: "log-only", detail: "Logged only. No message was sent." }; },
};

// Example shape for later (kept out of the bundle until configured):
// const twilio: MessagingProvider = { name: "twilio", async send(m) { /* POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json */ } };
// const resend: MessagingProvider = { name: "resend", async send(m) { /* POST https://api.resend.com/emails */ } };

export function getProvider(_channel: Channel): MessagingProvider {
  void _channel;
  return logOnly;
}

export async function sendCustomerMessage(m: Outbound): Promise<SendResult> {
  if (m.channel === "call" || m.channel === "note") return { delivered: false, provider: "manual", detail: "Logged." };
  return getProvider(m.channel).send(m);
}
