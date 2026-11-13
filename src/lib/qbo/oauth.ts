import { INTUIT_AUTHORIZE_URL, INTUIT_REVOKE_URL, INTUIT_TOKEN_URL, QBO_SCOPE, type QboConfig } from "./config";
import { QboAuthError, QboError, intuitErrorMessage } from "./errors";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type QboTokens = {
  accessToken: string;
  refreshToken: string;
  /** ISO time the access token expires (Intuit: ~1 hour). */
  accessExpiresAt: string;
  /** ISO time the refresh token expires (Intuit: ~100 days, rolling). */
  refreshExpiresAt: string;
};

/** Intuit authorization-code URL. `state` is the CSRF value also stored in an httpOnly cookie. */
export function buildAuthorizeUrl(cfg: Pick<QboConfig, "clientId" | "redirectUri">, state: string) {
  const u = new URL(INTUIT_AUTHORIZE_URL);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", QBO_SCOPE);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("state", state);
  return u.toString();
}

function basicAuth(cfg: Pick<QboConfig, "clientId" | "clientSecret">) {
  return `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

function toTokens(body: Record<string, unknown>, now: number): QboTokens {
  const access = String(body.access_token ?? "");
  const refresh = String(body.refresh_token ?? "");
  if (!access || !refresh) throw new QboError("QuickBooks did not return tokens. Try connecting again.");
  const expiresIn = Number(body.expires_in ?? 3600);
  const refreshIn = Number(body.x_refresh_token_expires_in ?? 8_726_400);
  return {
    accessToken: access,
    refreshToken: refresh,
    accessExpiresAt: new Date(now + expiresIn * 1000).toISOString(),
    refreshExpiresAt: new Date(now + refreshIn * 1000).toISOString(),
  };
}

async function tokenRequest(cfg: QboConfig, params: Record<string, string>, fetchImpl: FetchLike, now: () => number) {
  const res = await fetchImpl(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(cfg),
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });
  const body = await readJson(res);
  if (!res.ok) {
    const { message, code } = intuitErrorMessage(res.status, body);
    if (code === "invalid_grant" || res.status === 401) throw new QboAuthError(message);
    throw new QboError(message, { status: res.status, code, intuitTid: res.headers.get("intuit_tid") });
  }
  return toTokens((body ?? {}) as Record<string, unknown>, now());
}

/** Exchange the authorization code from /api/qbo/callback for tokens. */
export function exchangeCode(cfg: QboConfig, code: string, fetchImpl: FetchLike = fetch, now = Date.now) {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri }, fetchImpl, now);
}

/** Refresh the access token. Intuit may rotate the refresh token: always store the returned one. */
export function refreshTokens(cfg: QboConfig, refreshToken: string, fetchImpl: FetchLike = fetch, now = Date.now) {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl, now);
}

/** Revoke a refresh (or access) token on disconnect. Best effort: returns false instead of throwing. */
export async function revokeToken(cfg: QboConfig, token: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(INTUIT_REVOKE_URL, {
      method: "POST",
      headers: { Authorization: basicAuth(cfg), Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** True when the access token is expired or within `skewMs` of expiring. */
export function accessTokenExpiring(accessExpiresAt: string, now = Date.now(), skewMs = 5 * 60_000) {
  const t = Date.parse(accessExpiresAt);
  return !Number.isFinite(t) || t - now <= skewMs;
}
