/**
 * Outgoing customer messages are drafts the rep sends.
 * Automations may queue a draft SMS/email; they do not send to the customer
 * unless Luke later opts in to auto-send (auto_send_customer AND allowAutoSend).
 */
export type SendPolicy = {
  /** Global flag — off until Luke says otherwise. */
  allowAutoSend: boolean;
};

export const DEFAULT_SEND_POLICY: SendPolicy = { allowAutoSend: false };

export function customerMessageStartsAsDraft(policy: SendPolicy = DEFAULT_SEND_POLICY, automationAutoSend = false): boolean {
  return !(policy.allowAutoSend && automationAutoSend);
}

export type DeliveryResult = { ok: true; sent: boolean; status: "draft" | "sent" | "skipped"; reason?: string };

export function resolveCustomerDelivery(kind: "sms" | "email", ready: { sms: boolean; email: boolean }, policy: SendPolicy, automationAutoSend: boolean): DeliveryResult {
  if (customerMessageStartsAsDraft(policy, automationAutoSend)) {
    return { ok: true, sent: false, status: "draft", reason: "Outgoing messages stay in draft until a rep sends them." };
  }
  if (kind === "sms" && !ready.sms) {
    return { ok: true, sent: false, status: "draft", reason: "SMS is disabled until a provider (Twilio) is approved." };
  }
  if (kind === "email" && !ready.email) {
    return { ok: true, sent: false, status: "draft", reason: "Email is not configured." };
  }
  return { ok: true, sent: true, status: "sent" };
}
