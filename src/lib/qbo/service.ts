import "server-only";
import { QboApi, type QboAuthProvider } from "./api";
import { readQboConfig, type QboConfig } from "./config";
import { decryptToken, encryptToken } from "./crypto";
import { QboAuthError } from "./errors";
import { fakeIntuitFetch } from "./fake";
import { accessTokenExpiring, refreshTokens, type FetchLike, type QboTokens } from "./oauth";
import { getQboStore, type QboConnectionRow, type QboStore } from "./store";

export type QboState =
  | { kind: "not_configured" }
  | { kind: "disconnected"; config: QboConfig }
  | { kind: "connected"; config: QboConfig; connection: QboConnectionRow };

export function qboFetch(config: QboConfig): FetchLike {
  if (config.fake) {
    if (process.env.NEXT_PUBLIC_RR_MOCK_MODE !== "1") throw new Error("Fake QuickBooks is only for DEV MOCK MODE.");
    return fakeIntuitFetch;
  }
  return (input, init) => fetch(input, init);
}

/** Configured? Connected? Never returns tokens to callers outside this module's API helpers. */
export async function getQboState(store: QboStore = getQboStore()): Promise<QboState> {
  const config = readQboConfig();
  if (!config) return { kind: "not_configured" };
  const connection = await store.getConnection();
  if (!connection || connection.environment !== config.environment) return { kind: "disconnected", config };
  return { kind: "connected", config, connection };
}

export function sealTokens(config: QboConfig, t: QboTokens) {
  return {
    access_token_enc: encryptToken(t.accessToken, config.encKey),
    refresh_token_enc: encryptToken(t.refreshToken, config.encKey),
    access_expires_at: t.accessExpiresAt,
    refresh_expires_at: t.refreshExpiresAt,
  };
}

let refreshing: Promise<string> | null = null;

/** Access-token provider: refresh when expiring (5 min skew) or after a 401, and persist the rotated refresh token. */
export function tokenProvider(config: QboConfig, store: QboStore, fetchImpl: FetchLike): QboAuthProvider {
  const doRefresh = async () => {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const conn = await store.getConnection();
      if (!conn) throw new QboAuthError("QuickBooks is not connected.");
      let refresh: string;
      try { refresh = decryptToken(conn.refresh_token_enc, config.encKey); } catch { throw new QboAuthError("Stored QuickBooks sign-in can't be read (encryption key changed). An admin needs to reconnect."); }
      const t = await refreshTokens(config, refresh, fetchImpl);
      await store.updateConnection(sealTokens(config, t));
      return t.accessToken;
    })();
    try { return await refreshing; } finally { refreshing = null; }
  };
  return {
    async accessToken() {
      const conn = await store.getConnection();
      if (!conn) throw new QboAuthError("QuickBooks is not connected.");
      if (accessTokenExpiring(conn.access_expires_at)) return doRefresh();
      try { return decryptToken(conn.access_token_enc, config.encKey); } catch { return doRefresh(); }
    },
    refresh: doRefresh,
  };
}

/** API client for the connected company, or null when not configured / not connected. */
export async function getQboApi(store: QboStore = getQboStore()): Promise<{ api: QboApi; state: Extract<QboState, { kind: "connected" }> } | null> {
  const state = await getQboState(store);
  if (state.kind !== "connected") return null;
  const fetchImpl = qboFetch(state.config);
  const api = new QboApi({
    environment: state.config.environment,
    realmId: state.connection.realm_id,
    auth: tokenProvider(state.config, store, fetchImpl),
    fetch: fetchImpl,
  });
  return { api, state };
}
