import { timingSafeEqual } from "node:crypto";

/** Compare the xAgent webhook secret without leaking it into logs or error messages. */
export function webhookSecretConfigured(secret = process.env.SALES_LEAD_WEBHOOK_SECRET): boolean {
  return !!secret && secret.length >= 8;
}

export function checkWebhookSecret(provided: string | null | undefined, secret = process.env.SALES_LEAD_WEBHOOK_SECRET): boolean {
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
