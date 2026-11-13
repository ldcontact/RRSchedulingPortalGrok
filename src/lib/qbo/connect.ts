import { randomBytes, timingSafeEqual } from "node:crypto";
import { QboApi } from "./api";
import type { QboConfig } from "./config";
import { decryptToken, encryptToken } from "./crypto";
import { QboError } from "./errors";
import { exchangeCode, revokeToken, type FetchLike } from "./oauth";
import type { QboStore } from "./store";

export const QBO_STATE_COOKIE = "rr_qbo_oauth_state";

export function newOAuthState() {
  return randomBytes(24).toString("base64url");
}

/** Constant-time CSRF check of the `state` query param against the httpOnly cookie. */
export function stateMatches(cookieValue: string | null | undefined, param: string | null | undefined) {
  if (!cookieValue || !param) return false;
  const a = Buffer.from(cookieValue), b = Buffer.from(param);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Exchange the code, read the company name and sensible defaults, and store encrypted tokens. */
export async function completeConnection(opts: {
  config: QboConfig; code: string; realmId: string; store: QboStore; fetchImpl: FetchLike;
  user: { id: string; name: string };
}): Promise<{ companyName: string }> {
  const { config, code, realmId, store, fetchImpl, user } = opts;
  if (!code || !/^[0-9A-Za-z-]{1,40}$/.test(realmId)) throw new QboError("QuickBooks did not return a company. Try connecting again.");
  const tokens = await exchangeCode(config, code, fetchImpl);
  const api = new QboApi({
    environment: config.environment, realmId, fetch: fetchImpl,
    auth: { accessToken: async () => tokens.accessToken, refresh: async () => tokens.accessToken },
  });
  const companyName = await api.companyName();
  // Defaults are best effort; the admin can change them on the Settings card.
  const [items, terms] = await Promise.all([api.listItems().catch(() => []), api.listTerms().catch(() => [])]);
  const item = items.find((i) => i.name.toLowerCase() === "service call") ?? null;
  const term = terms.find((t) => t.name.toLowerCase() === "net 30") ?? null;
  const prev = await store.getConnection();
  const keepDefaults = prev && prev.realm_id === realmId;
  const now = new Date().toISOString();
  await store.saveConnection({
    realm_id: realmId,
    environment: config.environment,
    company_name: companyName,
    access_token_enc: encryptToken(tokens.accessToken, config.encKey),
    refresh_token_enc: encryptToken(tokens.refreshToken, config.encKey),
    access_expires_at: tokens.accessExpiresAt,
    refresh_expires_at: tokens.refreshExpiresAt,
    connected_by: user.id,
    connected_by_name: user.name,
    connected_at: now,
    last_sync_at: now,
    default_item_id: keepDefaults ? prev.default_item_id : item?.id ?? null,
    default_item_name: keepDefaults ? prev.default_item_name : item?.name ?? null,
    default_term_id: keepDefaults ? prev.default_term_id : term?.id ?? null,
    default_term_name: keepDefaults ? prev.default_term_name : term?.name ?? null,
    default_tax_code_id: keepDefaults ? prev.default_tax_code_id : "NON",
    default_tax_code_name: keepDefaults ? prev.default_tax_code_name : "Non-taxable",
  });
  return { companyName };
}

/** Revoke the refresh token at Intuit (best effort) and delete the stored connection. */
export async function disconnectQbo(opts: { config: QboConfig; store: QboStore; fetchImpl: FetchLike }): Promise<{ revoked: boolean }> {
  const conn = await opts.store.getConnection();
  if (!conn) return { revoked: false };
  let revoked = false;
  try {
    revoked = await revokeToken(opts.config, decryptToken(conn.refresh_token_enc, opts.config.encKey), opts.fetchImpl);
  } catch {
    revoked = false;
  }
  await opts.store.deleteConnection();
  return { revoked };
}
