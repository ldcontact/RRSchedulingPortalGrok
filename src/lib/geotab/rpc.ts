/**
 * MyGeotab JSON-RPC helper. Safe to import from a Node script (no server-only).
 * Never log passwords, session IDs, or request bodies that contain them.
 */
import { isInvalidUserError, resolveGeotabServer } from "./parse";

export type GeotabCreds = { database: string; userName: string; sessionId?: string; password?: string };

export function geotabEnv(): { database: string; userName: string; password: string; server: string } | null {
  const database = process.env.GEOTAB_DATABASE?.trim() ?? "";
  const userName = process.env.GEOTAB_USERNAME?.trim() ?? "";
  const password = process.env.GEOTAB_PASSWORD ?? "";
  const server = (process.env.GEOTAB_SERVER?.trim() || "my.geotab.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!database || !userName || !password) return null;
  return { database, userName, password, server };
}

export class GeotabRpc {
  server: string;
  credentials: GeotabCreds | null = null;
  private password: string;

  constructor(opts: { database: string; userName: string; password: string; server: string }) {
    this.server = opts.server;
    this.password = opts.password;
    this.credentials = { database: opts.database, userName: opts.userName };
  }

  private endpoint() {
    return `https://${this.server}/apiv1`;
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}, retried = false): Promise<T> {
    const creds: GeotabCreds = this.credentials && this.credentials.sessionId
      ? { database: this.credentials.database, userName: this.credentials.userName, sessionId: this.credentials.sessionId }
      : { database: this.credentials!.database, userName: this.credentials!.userName, password: this.password };
    const body = { method, params: method === "Authenticate" ? params : { ...params, credentials: creds } };
    const res = await fetch(this.endpoint(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { result?: T; error?: { message?: string; name?: string; data?: unknown } };
    if (json.error) {
      if (!retried && method !== "Authenticate" && isInvalidUserError(json.error)) {
        await this.authenticate();
        return this.call<T>(method, params, true);
      }
      throw new Error(json.error.message || json.error.name || "Geotab request failed");
    }
    return json.result as T;
  }

  async authenticate(): Promise<void> {
    const result = await this.call<{ path?: string; credentials?: { database: string; userName: string; sessionId: string } }>("Authenticate", {
      database: this.credentials!.database,
      userName: this.credentials!.userName,
      password: this.password,
    });
    if (!result?.credentials?.sessionId) throw new Error("Geotab authentication failed");
    this.server = resolveGeotabServer(this.server, result.path);
    this.credentials = {
      database: result.credentials.database,
      userName: result.credentials.userName,
      sessionId: result.credentials.sessionId,
    };
  }

  async getDevices(): Promise<unknown[]> {
    if (!this.credentials?.sessionId) await this.authenticate();
    const rows = await this.call<unknown[]>("Get", { typeName: "Device" });
    return Array.isArray(rows) ? rows : [];
  }

  async getDeviceStatusInfo(): Promise<unknown[]> {
    if (!this.credentials?.sessionId) await this.authenticate();
    const rows = await this.call<unknown[]>("Get", { typeName: "DeviceStatusInfo" });
    return Array.isArray(rows) ? rows : [];
  }

  async getUsersByIds(ids: string[]): Promise<unknown[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return [];
    if (!this.credentials?.sessionId) await this.authenticate();
    const rows = await this.call<unknown[]>("Get", { typeName: "User", search: { id: unique.length === 1 ? unique[0] : undefined } });
    // When multiple ids, fetch without id filter is heavy; try MultiCall-style individual Gets is overkill.
    // A single Get User returns users the service account can see; we map by id.
    const list = Array.isArray(rows) ? rows : [];
    if (unique.length === 1) return list;
    return list.filter((u) => {
      const id = u && typeof u === "object" && "id" in u ? String((u as { id: unknown }).id) : "";
      return unique.includes(id);
    });
  }
}
