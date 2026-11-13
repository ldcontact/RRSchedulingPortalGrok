import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ user: null as null | { id: string; name: string; role: string }, complete: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => h.user) }));
vi.mock("@/lib/qbo/service", () => ({ qboFetch: vi.fn() }));
vi.mock("@/lib/qbo/store", () => ({ getQboStore: vi.fn(() => ({})) }));
vi.mock("@/lib/qbo/connect", async (orig) => ({ ...(await orig<typeof import("@/lib/qbo/connect")>()), completeConnection: h.complete }));

import { GET as connect } from "./connect/route";
import { GET as callback } from "./callback/route";

const ENV = { QBO_CLIENT_ID: "cid", QBO_CLIENT_SECRET: "sec", QBO_TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString("base64") };
const msg = (res: Response) => { const u = new URL(res.headers.get("location")!, "https://rr.example"); return { path: u.pathname, ok: u.searchParams.get("ok"), error: u.searchParams.get("error"), u }; };

describe("/api/qbo routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    vi.stubEnv("NEXT_PUBLIC_RR_MOCK_MODE", "");
    h.user = { id: "u1", name: "Luke", role: "admin" };
  });

  it("connect: admin gets Intuit URL + httpOnly state cookie; managers and techs are refused", async () => {
    const res = await connect(new NextRequest("https://rr.example/api/qbo/connect"));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.host).toBe("appcenter.intuit.com");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/rr_qbo_oauth_state=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toContain(`rr_qbo_oauth_state=${loc.searchParams.get("state")}`);
    for (const role of ["manager", "tech", "sales"]) {
      h.user = { id: "u2", name: "X", role };
      expect(msg(await connect(new NextRequest("https://rr.example/api/qbo/connect"))).error).toBe("Only an admin can connect QuickBooks.");
    }
  });

  it("connect: not configured", async () => {
    vi.stubEnv("QBO_CLIENT_ID", "");
    expect(msg(await connect(new NextRequest("https://rr.example/api/qbo/connect"))).error).toMatch(/not configured/);
  });

  it("callback: rejects a missing or mismatched state (CSRF) before exchanging", async () => {
    const req = new NextRequest("https://rr.example/api/qbo/callback?code=c&realmId=123&state=evil", { headers: { cookie: "rr_qbo_oauth_state=good" } });
    expect(msg(await callback(req)).error).toMatch(/didn't match/);
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("callback: non-admins can't complete a connection", async () => {
    h.user = { id: "u2", name: "M", role: "manager" };
    const req = new NextRequest("https://rr.example/api/qbo/callback?code=c&realmId=123&state=good", { headers: { cookie: "rr_qbo_oauth_state=good" } });
    expect(msg(await callback(req)).error).toBe("Only an admin can connect QuickBooks.");
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("callback: admin with matching state stores the connection and clears the cookie", async () => {
    h.complete.mockResolvedValue({ companyName: "Retrofit Rebates, Inc." });
    const req = new NextRequest("https://rr.example/api/qbo/callback?code=c&realmId=123&state=good", { headers: { cookie: "rr_qbo_oauth_state=good" } });
    const res = await callback(req);
    expect(msg(res)).toMatchObject({ path: "/settings/integrations", ok: "Connected to Retrofit Rebates, Inc. (sandbox)." });
    expect(h.complete).toHaveBeenCalledWith(expect.objectContaining({ code: "c", realmId: "123", user: { id: "u1", name: "Luke" } }));
    expect(res.headers.get("set-cookie")).toMatch(/rr_qbo_oauth_state=;/);
  });

  it("callback: user cancelled at Intuit", async () => {
    const req = new NextRequest("https://rr.example/api/qbo/callback?error=access_denied&state=good", { headers: { cookie: "rr_qbo_oauth_state=good" } });
    expect(msg(await callback(req)).error).toBe("QuickBooks connection was cancelled.");
  });
});
