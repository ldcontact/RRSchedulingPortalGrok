/**
 * QuickBooks Online (Intuit) configuration. Server-side only: none of these
 * values are NEXT_PUBLIC and the client secret / encryption key never reach the browser.
 *
 * Required to turn the integration on:
 *   QBO_CLIENT_ID, QBO_CLIENT_SECRET   Intuit app keys (sandbox keys first)
 *   QBO_TOKEN_ENC_KEY                  32-byte key (base64 or 64 hex chars) for AES-256-GCM token encryption
 * Optional:
 *   QBO_ENVIRONMENT                    "sandbox" (default) or "production"
 *   QBO_REDIRECT_URI                   default https://rr-scheduling-portal-grokv1.vercel.app/api/qbo/callback
 *
 * DEV MOCK MODE: with NEXT_PUBLIC_RR_MOCK_MODE=1 and no QBO_CLIENT_ID, a local fake
 * Intuit server (src/lib/qbo/fake.ts) is used so the screens can be exercised without
 * any Intuit account. Set RR_QBO_FAKE=0 to see the "Not configured" state instead.
 */
import { parseEncKey } from "./crypto";

export type QboEnvironment = "sandbox" | "production";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_MINOR_VERSION = "75";
export const QBO_DEFAULT_REDIRECT_URI = "https://rr-scheduling-portal-grokv1.vercel.app/api/qbo/callback";

export const INTUIT_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const INTUIT_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export type QboConfig = {
  clientId: string;
  clientSecret: string;
  environment: QboEnvironment;
  redirectUri: string;
  encKey: string;
  /** DEV MOCK MODE only: talk to the in-process fake Intuit instead of the network. */
  fake: boolean;
};

type Env = Record<string, string | undefined>;

export function parseQboEnvironment(v: string | undefined): QboEnvironment {
  return (v ?? "").trim().toLowerCase() === "production" ? "production" : "sandbox";
}

/** Config from env, or null when the integration is not configured (feature shows "Not configured"). */
export function readQboConfig(env: Env = process.env): QboConfig | null {
  const clientId = (env.QBO_CLIENT_ID ?? "").trim();
  const clientSecret = (env.QBO_CLIENT_SECRET ?? "").trim();
  const encKey = (env.QBO_TOKEN_ENC_KEY ?? "").trim();
  const environment = parseQboEnvironment(env.QBO_ENVIRONMENT);
  const redirectUri = (env.QBO_REDIRECT_URI ?? "").trim() || QBO_DEFAULT_REDIRECT_URI;
  const mock = env.NEXT_PUBLIC_RR_MOCK_MODE === "1";
  if (mock && !clientId && env.RR_QBO_FAKE !== "0") {
    return {
      clientId: "fake-client", clientSecret: "fake-secret", environment: "sandbox",
      redirectUri: "/api/qbo/callback",
      encKey: encKey || "ZmFrZS1kZXYtb25seS1rZXktMzItYnl0ZXMtbG9uZyE=",
      fake: true,
    };
  }
  if (!clientId || !clientSecret || !encKey) return null;
  try { parseEncKey(encKey); } catch { return null; }
  return { clientId, clientSecret, environment, redirectUri, encKey, fake: false };
}

/** Human-readable setup problems for the Settings card. Names and format only, never values. */
export function qboSetupIssues(env: Env = process.env): string[] {
  const issues: string[] = [];
  if (!(env.QBO_CLIENT_ID ?? "").trim()) issues.push("QBO_CLIENT_ID is missing");
  if (!(env.QBO_CLIENT_SECRET ?? "").trim()) issues.push("QBO_CLIENT_SECRET is missing");
  const enc = (env.QBO_TOKEN_ENC_KEY ?? "").trim();
  if (!enc) issues.push("QBO_TOKEN_ENC_KEY is missing");
  else {
    try { parseEncKey(enc); } catch {
      issues.push("QBO_TOKEN_ENC_KEY must be 32 bytes (base64, typically 44 characters, or 64 hex characters)");
    }
  }
  return issues;
}

/** Which required env vars are empty, for tests and callers that only need names. */
export function missingQboEnv(env: Env = process.env): string[] {
  return ["QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "QBO_TOKEN_ENC_KEY"].filter((k) => !(env[k] ?? "").trim());
}

export function qboApiBase(environment: QboEnvironment) {
  return environment === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
}

/** Link that opens an invoice in the QuickBooks web app for the right environment. */
export function qboInvoiceAppUrl(environment: QboEnvironment, invoiceId: string) {
  const host = environment === "production" ? "https://app.qbo.intuit.com" : "https://app.sandbox.qbo.intuit.com";
  return `${host}/app/invoice?txnId=${encodeURIComponent(invoiceId)}`;
}
