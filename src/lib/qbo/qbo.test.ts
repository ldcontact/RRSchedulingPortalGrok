import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { QboApi } from "./api";
import { INTUIT_AUTHORIZE_URL, INTUIT_REVOKE_URL, INTUIT_TOKEN_URL, QBO_DEFAULT_REDIRECT_URI, qboInvoiceAppUrl, qboSetupIssues, readQboConfig, type QboConfig } from "./config";
import { completeConnection, disconnectQbo, stateMatches } from "./connect";
import { decryptToken, encryptToken } from "./crypto";
import { QboAuthError, QboError } from "./errors";
import { buildInvoicePayload, defaultInvoiceLineDescription, estimateTotals, validateInvoiceDraft, withServiceLocationMemo } from "./invoice";
import { createInvoiceForTicket, fillLinkedCustomer, invoiceEmailedHistory, invoiceView, refreshInvoice, sendInvoiceForTicket, suggestCustomer, voidInvoiceForTicket } from "./invoices";
import { accessTokenExpiring, buildAuthorizeUrl, exchangeCode, refreshTokens, revokeToken } from "./oauth";
import { canManageQboConnection, canUseQboInvoices } from "./permissions";
import { getQboState, tokenProvider } from "./service";
import { deriveInvoiceStatus, invoiceListChipText } from "./status";
import { explainQboStoreError } from "./store";
import { TEST_KEY, memoryStore, scriptedFetch } from "./test-helpers";
import { visibleServiceRequestEvents } from "@/lib/service-request-price";

const CFG: QboConfig = { clientId: "cid", clientSecret: "csecret", environment: "sandbox", redirectUri: QBO_DEFAULT_REDIRECT_URI, encKey: TEST_KEY, fake: false };
const API_HOST = "sandbox-quickbooks.api.intuit.com";
const staticAuth = { accessToken: async () => "AT", refresh: async () => "AT2" };
const noSleep = async () => {};

function api(fetchImpl: ReturnType<typeof scriptedFetch>["fetch"], auth = staticAuth) {
  return new QboApi({ environment: "sandbox", realmId: "123", auth, fetch: fetchImpl, sleep: noSleep });
}
const draft = (over: Record<string, unknown> = {}) => ({
  customerId: "58", txnDate: "2026-11-13", dueDate: "2026-12-13", termId: "3", taxCodeId: "NON",
  lines: [{ itemId: "1", description: "No heat in bay 2", qty: "1", rate: "285.00" }],
  customerMemo: "Replaced the igniter.", warrantyNote: "", ...over,
});

describe("encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const sealed = encryptToken("secret-refresh-token", TEST_KEY);
    expect(sealed).not.toContain("secret-refresh-token");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptToken(sealed, TEST_KEY)).toBe("secret-refresh-token");
    expect(encryptToken("x", TEST_KEY)).not.toBe(encryptToken("x", TEST_KEY)); // random IV
  });
  it("accepts a 64-char hex key and rejects tampering / wrong keys / short keys", () => {
    const hex = "ab".repeat(32);
    expect(decryptToken(encryptToken("t", hex), hex)).toBe("t");
    const sealed = encryptToken("token", TEST_KEY);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(parts.join("."), TEST_KEY)).toThrow();
    expect(() => decryptToken(sealed, Buffer.alloc(32, 9).toString("base64"))).toThrow();
    expect(() => encryptToken("t", "too-short")).toThrow(/32 bytes/);
  });
});

describe("config", () => {
  it("is not configured without client id, secret and encryption key", () => {
    expect(readQboConfig({})).toBeNull();
    expect(readQboConfig({ QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b" })).toBeNull();
  });
  it("defaults to sandbox and the production redirect URI", () => {
    const c = readQboConfig({ QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b", QBO_TOKEN_ENC_KEY: TEST_KEY })!;
    expect(c.environment).toBe("sandbox");
    expect(c.redirectUri).toBe("https://rr-scheduling-portal-grokv1.vercel.app/api/qbo/callback");
    expect(c.fake).toBe(false);
    expect(readQboConfig({ QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b", QBO_TOKEN_ENC_KEY: TEST_KEY, QBO_ENVIRONMENT: "production" })!.environment).toBe("production");
  });
  it("uses the fake only in mock mode with no real keys", () => {
    expect(readQboConfig({ NEXT_PUBLIC_RR_MOCK_MODE: "1" })!.fake).toBe(true);
    expect(readQboConfig({ NEXT_PUBLIC_RR_MOCK_MODE: "1", RR_QBO_FAKE: "0" })).toBeNull();
    const fakeKey = readQboConfig({ NEXT_PUBLIC_RR_MOCK_MODE: "1" })!.encKey;
    expect(decryptToken(encryptToken("x", fakeKey), fakeKey)).toBe("x");
  });
  it("links invoices to the right QuickBooks app", () => {
    expect(qboInvoiceAppUrl("sandbox", "145")).toBe("https://app.sandbox.qbo.intuit.com/app/invoice?txnId=145");
    expect(qboInvoiceAppUrl("production", "145")).toBe("https://app.qbo.intuit.com/app/invoice?txnId=145");
  });
  it("lists the actual setup problem, including a bad encryption key, and is empty when keys are valid", () => {
    expect(qboSetupIssues({})).toEqual([
      "QBO_CLIENT_ID is missing",
      "QBO_CLIENT_SECRET is missing",
      "QBO_TOKEN_ENC_KEY is missing",
    ]);
    const present = { QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b", QBO_TOKEN_ENC_KEY: "too-short" };
    expect(readQboConfig(present)).toBeNull();
    expect(qboSetupIssues(present)).toEqual([
      "QBO_TOKEN_ENC_KEY must be 32 bytes (base64, typically 44 characters, or 64 hex characters)",
    ]);
    // 32 random bytes as standard base64 (44 chars with padding) — same format as
    // PowerShell [Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))
    const psKey = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString("base64");
    expect(psKey).toHaveLength(44);
    expect(qboSetupIssues({ QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b", QBO_TOKEN_ENC_KEY: psKey })).toEqual([]);
    expect(readQboConfig({ QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b", QBO_TOKEN_ENC_KEY: psKey })).not.toBeNull();
  });
});

describe("store errors", () => {
  it("explains an Invalid API key as a rejected SUPABASE_SERVICE_ROLE_KEY without leaking values", () => {
    const msg = explainQboStoreError("Invalid API key");
    expect(msg).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(msg).toContain("Invalid API key");
    expect(msg).toContain("tsvjugacbiqkjqazixlv");
    expect(msg.toLowerCase()).not.toContain("eyj");
  });
  it("returns an error state (not not_configured) when the connection store fails", async () => {
    const env = { QBO_CLIENT_ID: "a", QBO_CLIENT_SECRET: "b", QBO_TOKEN_ENC_KEY: TEST_KEY };
    const prev = { ...process.env };
    Object.assign(process.env, env);
    try {
      const { store } = memoryStore();
      store.getConnection = async () => { throw new Error(explainQboStoreError("Invalid API key")); };
      const state = await getQboState(store);
      expect(state.kind).toBe("error");
      if (state.kind === "error") {
        expect(state.message).toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(qboSetupIssues(env)).toEqual([]);
      }
    } finally {
      for (const k of Object.keys(env)) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });
});

describe("OAuth", () => {
  it("builds the Intuit authorize URL with accounting scope and state", () => {
    const u = new URL(buildAuthorizeUrl(CFG, "st8"));
    expect(`${u.origin}${u.pathname}`).toBe(INTUIT_AUTHORIZE_URL);
    expect(u.searchParams.get("scope")).toBe("com.intuit.quickbooks.accounting");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("state")).toBe("st8");
    expect(u.searchParams.get("redirect_uri")).toBe(QBO_DEFAULT_REDIRECT_URI);
    expect(u.searchParams.get("client_id")).toBe("cid");
  });
  it("exchanges the code with Basic auth and form body", async () => {
    const f = scriptedFetch(() => ({ json: { access_token: "A1", refresh_token: "R1", expires_in: 3600, x_refresh_token_expires_in: 8726400 } }));
    const t = await exchangeCode(CFG, "code123", f.fetch, () => Date.parse("2026-11-13T00:00:00Z"));
    expect(f.calls[0].url.toString()).toBe(INTUIT_TOKEN_URL);
    expect(f.calls[0].headers.authorization).toBe(`Basic ${Buffer.from("cid:csecret").toString("base64")}`);
    const body = new URLSearchParams(f.calls[0].body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("code123");
    expect(body.get("redirect_uri")).toBe(QBO_DEFAULT_REDIRECT_URI);
    expect(t).toEqual({ accessToken: "A1", refreshToken: "R1", accessExpiresAt: "2026-11-13T01:00:00.000Z", refreshExpiresAt: new Date(Date.parse("2026-11-13T00:00:00Z") + 8726400e3).toISOString() });
  });
  it("refreshes and returns the rotated refresh token; invalid_grant means reconnect", async () => {
    const f = scriptedFetch((c) => new URLSearchParams(c.body).get("refresh_token") === "OLD"
      ? { json: { access_token: "A2", refresh_token: "NEW", expires_in: 3600 } }
      : { status: 400, json: { error: "invalid_grant" } });
    const t = await refreshTokens(CFG, "OLD", f.fetch);
    expect(t.refreshToken).toBe("NEW");
    expect(new URLSearchParams(f.calls[0].body).get("grant_type")).toBe("refresh_token");
    await expect(refreshTokens(CFG, "BAD", f.fetch)).rejects.toBeInstanceOf(QboAuthError);
  });
  it("revokes best-effort", async () => {
    const ok = scriptedFetch(() => ({ status: 200 }));
    expect(await revokeToken(CFG, "R1", ok.fetch)).toBe(true);
    expect(ok.calls[0].url.toString()).toBe(INTUIT_REVOKE_URL);
    expect(JSON.parse(ok.calls[0].body)).toEqual({ token: "R1" });
    expect(await revokeToken(CFG, "R1", async () => { throw new Error("offline"); })).toBe(false);
  });
  it("checks CSRF state in constant time", () => {
    expect(stateMatches("abc", "abc")).toBe(true);
    expect(stateMatches("abc", "abd")).toBe(false);
    expect(stateMatches("abc", "abcd")).toBe(false);
    expect(stateMatches(undefined, "abc")).toBe(false);
    expect(stateMatches("abc", null)).toBe(false);
  });
  it("flags access tokens that are about to expire", () => {
    const now = Date.parse("2026-11-13T12:00:00Z");
    expect(accessTokenExpiring("2026-11-13T12:03:00Z", now)).toBe(true);
    expect(accessTokenExpiring("2026-11-13T12:30:00Z", now)).toBe(false);
    expect(accessTokenExpiring("garbage", now)).toBe(true);
  });
});

describe("token refresh + storage", () => {
  const conn = (over = {}) => ({
    realm_id: "123", environment: "sandbox" as const, company_name: "Co",
    access_token_enc: encryptToken("OLD-AT", TEST_KEY), refresh_token_enc: encryptToken("OLD-RT", TEST_KEY),
    access_expires_at: new Date(Date.now() + 3600e3).toISOString(), refresh_expires_at: new Date(Date.now() + 90 * 864e5).toISOString(),
    connected_by: "u1", connected_by_name: "Luke", connected_at: new Date().toISOString(), last_sync_at: null,
    default_item_id: null, default_item_name: null, default_term_id: null, default_term_name: null, default_tax_code_id: "NON", default_tax_code_name: "Non-taxable",
    ...over,
  });
  it("uses the stored token while fresh, refreshes when expiring and stores the rotated pair encrypted", async () => {
    const { store, db } = memoryStore({ connection: conn() });
    const f = scriptedFetch(() => ({ json: { access_token: "NEW-AT", refresh_token: "NEW-RT", expires_in: 3600 } }));
    const p = tokenProvider(CFG, store, f.fetch);
    expect(await p.accessToken()).toBe("OLD-AT");
    expect(f.calls).toHaveLength(0);
    db.connection = { ...db.connection!, access_expires_at: new Date(Date.now() + 60e3).toISOString() };
    expect(await p.accessToken()).toBe("NEW-AT");
    expect(new URLSearchParams(f.calls[0].body).get("refresh_token")).toBe("OLD-RT");
    expect(decryptToken(db.connection!.refresh_token_enc, TEST_KEY)).toBe("NEW-RT");
    expect(JSON.stringify(db.connection)).not.toContain("NEW-RT");
  });
  it("retries a 401 once with a refreshed token", async () => {
    const { store } = memoryStore({ connection: conn() });
    const f = scriptedFetch((c) => {
      if (c.url.host === "oauth.platform.intuit.com") return { json: { access_token: "FRESH", refresh_token: "RT2", expires_in: 3600 } };
      return c.headers.authorization === "Bearer FRESH" ? { json: { CompanyInfo: { CompanyName: "Retrofit Rebates" } } } : { status: 401, json: { fault: "AuthenticationFailed" } };
    });
    const a = new QboApi({ environment: "sandbox", realmId: "123", auth: tokenProvider(CFG, store, f.fetch), fetch: f.fetch, sleep: noSleep });
    expect(await a.companyName()).toBe("Retrofit Rebates");
    expect(f.calls.map((c) => c.url.host)).toEqual([API_HOST, "oauth.platform.intuit.com", API_HOST]);
  });
  it("completes the connection with encrypted tokens and sensible defaults; disconnect revokes and deletes", async () => {
    const { store, db } = memoryStore();
    const f = scriptedFetch((c) => {
      if (c.url.toString() === INTUIT_TOKEN_URL) return { json: { access_token: "AT-1", refresh_token: "RT-1", expires_in: 3600 } };
      if (c.url.toString() === INTUIT_REVOKE_URL) return { status: 200 };
      if (c.url.pathname.endsWith("/companyinfo/123")) return { json: { CompanyInfo: { CompanyName: "Retrofit Rebates, Inc." } } };
      const q = c.url.searchParams.get("query") ?? "";
      if (q.includes("from Item")) return { json: { QueryResponse: { Item: [{ Id: "9", Name: "Service call", Type: "Service" }] } } };
      if (q.includes("from Term")) return { json: { QueryResponse: { Term: [{ Id: "3", Name: "Net 30", DueDays: 30 }] } } };
      return undefined;
    });
    const r = await completeConnection({ config: CFG, code: "c", realmId: "123", store, fetchImpl: f.fetch, user: { id: "u1", name: "Luke" } });
    expect(r.companyName).toBe("Retrofit Rebates, Inc.");
    const row = db.connection!;
    expect(row.realm_id).toBe("123");
    expect(row.default_item_id).toBe("9");
    expect(row.default_term_name).toBe("Net 30");
    expect(JSON.stringify(row)).not.toMatch(/AT-1|RT-1/);
    expect(decryptToken(row.refresh_token_enc, TEST_KEY)).toBe("RT-1");
    const d = await disconnectQbo({ config: CFG, store, fetchImpl: f.fetch });
    expect(d.revoked).toBe(true);
    expect(JSON.parse(f.calls.at(-1)!.body)).toEqual({ token: "RT-1" });
    expect(db.connection).toBeNull();
  });
});

describe("QuickBooks API client", () => {
  it("pins minorversion, sends bearer token, and backs off on 429", async () => {
    let n = 0;
    const sleep = vi.fn(async () => {});
    const f = scriptedFetch(() => (++n === 1 ? { status: 429, headers: { "retry-after": "2" }, json: {} } : { json: { QueryResponse: { Term: [{ Id: "1", Name: "Net 15", DueDays: 15 }] } } }));
    const a = new QboApi({ environment: "sandbox", realmId: "123", auth: staticAuth, fetch: f.fetch, sleep });
    expect(await a.listTerms()).toEqual([{ id: "1", name: "Net 15", dueDays: 15 }]);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(f.calls[1].url.host).toBe(API_HOST);
    expect(f.calls[1].url.pathname).toBe("/v3/company/123/query");
    expect(f.calls[1].url.searchParams.get("minorversion")).toBe("75");
    expect(f.calls[1].headers.authorization).toBe("Bearer AT");
  });
  it("surfaces Intuit Fault messages nicely", async () => {
    const f = scriptedFetch(() => ({ status: 400, json: { Fault: { Error: [{ Message: "Business Validation Error", Detail: "Invalid Reference Id : Item assigned to this transaction has been deleted", code: "6000" }], type: "ValidationFault" } } }));
    const err = await api(f.fetch).createInvoice({ CustomerRef: { value: "1" } }).catch((e) => e);
    expect(err).toBeInstanceOf(QboError);
    expect(err.message).toBe("QuickBooks: Business Validation Error — Invalid Reference Id : Item assigned to this transaction has been deleted");
    const rl = scriptedFetch(() => ({ status: 429, json: {} }));
    expect((await api(rl.fetch).listTerms().catch((e) => e)).message).toMatch(/rate limit/);
  });
  it("searches customers by name and email with escaped query literals", async () => {
    const f = scriptedFetch((c) => {
      const q = c.url.searchParams.get("query")!;
      if (q.includes("DisplayName like")) return { json: { QueryResponse: { Customer: [{ Id: "58", DisplayName: "O'Hare Auto", PrimaryEmailAddr: { Address: "o@x.example" }, BillAddr: { Line1: "1 Main", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60601" } }] } } };
      return { json: { QueryResponse: {} } };
    });
    const r = await api(f.fetch).searchCustomers("O'Hare");
    expect(f.calls[0].url.searchParams.get("query")).toBe("select * from Customer where DisplayName like '%O\\'Hare%' maxresults 20");
    expect(f.calls[1].url.searchParams.get("query")).toContain("CompanyName like");
    expect(r).toEqual([{ id: "58", name: "O'Hare Auto", email: "o@x.example", address: "1 Main, Chicago, IL 60601" }]);
    await api(f.fetch).searchCustomers("tony@golfrdautobody.example");
    expect(f.calls.at(-1)!.url.searchParams.get("query")).toBe("select * from Customer where PrimaryEmailAddr = 'tony@golfrdautobody.example' maxresults 20");
  });
  it("never duplicates a customer: reuses an exact display-name match", async () => {
    const existing = scriptedFetch((c) => (c.method === "GET" ? { json: { QueryResponse: { Customer: [{ Id: "58", DisplayName: "Golf Road Auto Body" }] } } } : undefined));
    const r1 = await api(existing.fetch).createCustomer({ name: "Golf Road Auto Body" });
    expect(r1).toMatchObject({ existed: true, customer: { id: "58" } });
    expect(existing.calls.every((c) => c.method === "GET")).toBe(true);
    const fresh = scriptedFetch((c) => (c.method === "GET" ? { json: { QueryResponse: {} } } : { json: { Customer: { Id: "201", DisplayName: "New Co" } } }));
    const r2 = await api(fresh.fetch).createCustomer({ name: "New: Co", email: "a@b.example", address: "1 Main", city: "Roselle", state: "IL", zip: "60172" });
    expect(r2).toMatchObject({ existed: false, customer: { id: "201" } });
    const post = fresh.calls.find((c) => c.method === "POST")!;
    expect(post.url.pathname).toBe("/v3/company/123/customer");
    expect(JSON.parse(post.body)).toEqual({
      DisplayName: "New Co", CompanyName: "New Co",
      PrimaryEmailAddr: { Address: "a@b.example" },
      BillAddr: { Line1: "1 Main", City: "Roselle", CountrySubDivisionCode: "IL", PostalCode: "60172", Country: "US" },
      ShipAddr: { Line1: "1 Main", City: "Roselle", CountrySubDivisionCode: "IL", PostalCode: "60172", Country: "US" },
    });
  });
  it("voids with the current SyncToken via operation=void", async () => {
    const f = scriptedFetch((c) => (c.method === "GET" ? { json: { Invoice: { Id: "145", SyncToken: "3", TotalAmt: 285, Balance: 285 } } } : { json: { Invoice: { Id: "145", SyncToken: "4", TotalAmt: 0, Balance: 0 } } }));
    await api(f.fetch).voidInvoice("145");
    const post = f.calls[1];
    expect(post.url.pathname).toBe("/v3/company/123/invoice");
    expect(post.url.searchParams.get("operation")).toBe("void");
    expect(JSON.parse(post.body)).toEqual({ Id: "145", SyncToken: "3", sparse: true });
  });
  it("refuses an emailed invoice payload", async () => {
    const f = scriptedFetch(() => ({ json: { Invoice: { Id: "1", SyncToken: "0" } } }));
    await expect(api(f.fetch).createInvoice({ EmailStatus: "NeedToSend" })).rejects.toThrow(/without email/);
    expect(f.calls).toHaveLength(0);
  });
});

describe("invoice payload", () => {
  it("builds a not-emailed draft with service line, terms, memo, private note", () => {
    const v = validateInvoiceDraft(draft({ warrantyNote: "Labor covered under the 12-month warranty." }));
    if ("error" in v) throw new Error(v.error);
    const p = buildInvoicePayload({ ...v.draft, privateNote: "RR Scheduler SR-1002" });
    expect(p).toEqual({
      CustomerRef: { value: "58" }, TxnDate: "2026-11-13", DueDate: "2026-12-13", EmailStatus: "NotSet",
      Line: [{ DetailType: "SalesItemLineDetail", Amount: 285, Description: "No heat in bay 2", SalesItemLineDetail: { ItemRef: { value: "1" }, Qty: 1, UnitPrice: 285, TaxCodeRef: { value: "NON" } } }],
      SalesTermRef: { value: "3" },
      CustomerMemo: { value: "Replaced the igniter.\n\nLabor covered under the 12-month warranty." },
      PrivateNote: "RR Scheduler SR-1002",
    });
    expect(p).not.toHaveProperty("BillEmail");
    expect(p).not.toHaveProperty("ShipAddr");
  });
  it("sets BillEmail and ShipAddr on the draft but keeps EmailStatus NotSet", () => {
    const v = validateInvoiceDraft(draft({
      billEmail: "office@example.com",
      shipAddr: { line1: "2626 N Lincoln Ave", city: "Chicago", state: "IL", zip: "60614" },
      customerMemo: "Fix lights basement",
    }));
    if ("error" in v) throw new Error(v.error);
    const p = buildInvoicePayload({ ...v.draft, customerMemo: withServiceLocationMemo(v.draft.customerMemo, "2626 N Lincoln Ave, Chicago, IL 60614"), privateNote: "RR Scheduler SR-1002" });
    expect(p.EmailStatus).toBe("NotSet");
    expect(p.BillEmail).toEqual({ Address: "office@example.com" });
    expect(p.ShipAddr).toEqual({ Line1: "2626 N Lincoln Ave", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60614", Country: "US" });
    expect((p.CustomerMemo as { value: string }).value).toContain("Service location: 2626 N Lincoln Ave, Chicago, IL 60614");
  });
  it("describes the line with the SR number, issue, and visit", () => {
    expect(defaultInvoiceLineDescription({ ticketNo: "SR-1002", summary: "Fix lights basement", description: "3x 2x4s being ballasts", visitLabel: "Mon, Nov 16 9:00 AM–11:00 AM" })).toBe(
      "SR-1002 — Fix lights basement\n3x 2x4s being ballasts\nVisit: Mon, Nov 16 9:00 AM–11:00 AM",
    );
  });
  it("applies a sales tax code to taxable invoices", () => {
    const v = validateInvoiceDraft(draft({ taxCodeId: "5" }));
    if ("error" in v) throw new Error(v.error);
    const p = buildInvoicePayload(v.draft) as { Line: { SalesItemLineDetail: { TaxCodeRef: { value: string } } }[]; TxnTaxDetail: unknown };
    expect(p.Line[0].SalesItemLineDetail.TaxCodeRef.value).toBe("TAX");
    expect(p.TxnTaxDetail).toEqual({ TxnTaxCodeRef: { value: "5" } });
    expect(estimateTotals([{ qty: 1, rate: 285 }], 10.25)).toEqual({ subtotal: 285, tax: 29.21, total: 314.21 });
  });
  it("rejects bad drafts", () => {
    expect(validateInvoiceDraft(draft({ customerId: "" }))).toEqual({ error: "Match or create a QuickBooks customer first." });
    expect(validateInvoiceDraft(draft({ dueDate: "2026-11-01" }))).toEqual({ error: "Due date can't be before the invoice date." });
    expect(validateInvoiceDraft(draft({ lines: [] }))).toEqual({ error: "Add at least one line." });
    expect(validateInvoiceDraft(draft({ lines: [{ itemId: "1", qty: "1", rate: "-5" }] }))).toHaveProperty("error");
    expect(validateInvoiceDraft(draft({ lines: [{ itemId: "1", qty: "1", rate: "10.555" }] }))).toHaveProperty("error");
    expect(validateInvoiceDraft(draft({ lines: [{ itemId: "1", qty: "1", rate: "0" }] }))).toEqual({ error: "Invoice total must be more than $0." });
    expect(validateInvoiceDraft(draft({ lines: [{ itemId: "", qty: "1", rate: "5" }] }))).toEqual({ error: "Line 1: pick a QuickBooks item." });
  });
});

describe("status mapping", () => {
  const today = "2026-11-13";
  it("derives Draft / Sent / Paid / Overdue", () => {
    expect(deriveInvoiceStatus({ total: 285, balance: 285, emailStatus: "NotSet", dueDate: "2026-12-13" }, today)).toBe("draft");
    expect(deriveInvoiceStatus({ total: 285, balance: 285, emailStatus: "EmailSent", dueDate: "2026-12-13" }, today)).toBe("sent");
    expect(deriveInvoiceStatus({ total: 285, balance: 0, emailStatus: "EmailSent", dueDate: "2026-10-01" }, today)).toBe("paid");
    expect(deriveInvoiceStatus({ total: 285, balance: 100, emailStatus: "EmailSent", dueDate: "2026-11-12" }, today)).toBe("overdue");
    expect(deriveInvoiceStatus({ total: 285, balance: 285, emailStatus: "NotSet", dueDate: "2026-11-13" }, today)).toBe("draft");
  });
  it("labels list chips", () => {
    expect(invoiceListChipText("draft", "1047")).toBe("Draft #1047");
    expect(invoiceListChipText("paid", "1041")).toBe("Paid");
    expect(invoiceListChipText("overdue", "1040")).toBe("Overdue #1040");
  });
});

describe("permissions", () => {
  it("invoices are admins and managers only; connecting is admin only", () => {
    expect(canUseQboInvoices("admin")).toBe(true);
    expect(canUseQboInvoices("manager")).toBe(true);
    expect(canUseQboInvoices("sales")).toBe(false);
    expect(canUseQboInvoices("tech")).toBe(false);
    expect(canUseQboInvoices(null)).toBe(false);
    expect(canManageQboConnection("admin")).toBe(true);
    expect(canManageQboConnection("manager")).toBe(false);
  });
  it("hides invoice history from techs and sales", () => {
    const ev = [{ kind: "note" as const }, { kind: "invoice" as const }, { kind: "price" as const }];
    expect(visibleServiceRequestEvents(ev, "manager").map((e) => e.kind)).toEqual(["note", "invoice", "price"]);
    expect(visibleServiceRequestEvents(ev, "sales").map((e) => e.kind)).toEqual(["note", "price"]);
    expect(visibleServiceRequestEvents(ev, "tech").map((e) => e.kind)).toEqual(["note"]);
  });
});

describe("ticket invoice flow", () => {
  function intuit() {
    const invoices: Record<string, { Id: string; SyncToken: string; DocNumber: string; TotalAmt: number; Balance: number; EmailStatus: string; DueDate: string; TxnDate: string }> = {};
    const f = scriptedFetch((c) => {
      const p = c.url.pathname.replace("/v3/company/123/", "");
      const q = c.url.searchParams.get("query") ?? "";
      if (p === "query" && q.includes("DisplayName =")) return { json: { QueryResponse: q.includes("Golf Road Auto Body") ? { Customer: [{ Id: "58", DisplayName: "Golf Road Auto Body" }] } : {} } };
      if (p === "query") return { json: { QueryResponse: {} } };
      if (p === "customer/58") return { json: { Customer: { Id: "58", DisplayName: "Golf Road Auto Body" } } };
      if (p === "invoice" && c.method === "POST" && c.url.searchParams.get("operation") === "void") { invoices["145"].Balance = 0; invoices["145"].TotalAmt = 0; return { json: { Invoice: invoices["145"] } }; }
      if (p === "invoice" && c.method === "POST") { invoices["145"] = { Id: "145", SyncToken: "0", DocNumber: "1047", TotalAmt: 285, Balance: 285, EmailStatus: "NotSet", DueDate: "2026-12-13", TxnDate: "2026-11-13" }; return { json: { Invoice: invoices["145"] } }; }
      if (p === "invoice/145") return { json: { Invoice: invoices["145"] } };
      return undefined;
    });
    return { f, invoices };
  }
  it("matches the customer, creates a not-emailed invoice, saves the mapping, blocks duplicates, refreshes and voids", async () => {
    const { store, db } = memoryStore();
    const { f, invoices } = intuit();
    const a = api(f.fetch);
    const s = await suggestCustomer(a, store, { id: "c2", name: "Golf Road Auto Body", email: null });
    expect(s?.customer.id).toBe("58");
    const v = validateInvoiceDraft(draft());
    if ("error" in v) throw new Error(v.error);
    const row = await createInvoiceForTicket({ api: a, store, environment: "sandbox", serviceRequestId: "sr2", portalCustomerId: "c2", draft: v.draft, user: { id: "u1" } });
    expect(row).toMatchObject({ service_request_id: "sr2", qbo_invoice_id: "145", doc_number: "1047", total: 285, balance: 285, status: "draft" });
    expect(db.links).toEqual([expect.objectContaining({ customer_id: "c2", qbo_customer_id: "58" })]);
    const post = f.calls.find((c) => c.method === "POST")!;
    expect(JSON.parse(post.body).EmailStatus).toBe("NotSet");
    expect(f.calls.some((c) => c.url.pathname.endsWith("/send"))).toBe(false);
    expect(invoiceView(row, "2026-11-13")).toMatchObject({ number: "1047", amount: 285, status: "draft", openUrl: "https://app.sandbox.qbo.intuit.com/app/invoice?txnId=145" });
    // linked customer is reused next time
    expect((await suggestCustomer(a, store, { id: "c2", name: "Renamed", email: null }))).toMatchObject({ linked: true, customer: { id: "58" } });
    await expect(createInvoiceForTicket({ api: a, store, environment: "sandbox", serviceRequestId: "sr2", portalCustomerId: "c2", draft: v.draft, user: { id: "u1" } })).rejects.toThrow(/already has an invoice/);
    invoices["145"].EmailStatus = "EmailSent";
    expect((await refreshInvoice(a, store, row, "2026-11-13")).status).toBe("sent");
    await voidInvoiceForTicket(a, store, db.invoices[0], { id: "u1" }, "2026-11-13");
    expect(db.invoices[0].voided_at).not.toBeNull();
    expect(await store.getActiveInvoice("sr2")).toBeNull();
  });
  it("won't void a paid invoice", async () => {
    const { store, db } = memoryStore();
    const { f, invoices } = intuit();
    const a = api(f.fetch);
    const v = validateInvoiceDraft(draft());
    if ("error" in v) throw new Error(v.error);
    await createInvoiceForTicket({ api: a, store, environment: "sandbox", serviceRequestId: "sr5", portalCustomerId: "c2", draft: v.draft, user: { id: "u1" } });
    invoices["145"].Balance = 0;
    await expect(voidInvoiceForTicket(a, store, db.invoices[0], { id: "u1" }, "2026-11-13")).rejects.toThrow(/paid/);
    expect(f.calls.some((c) => c.url.searchParams.get("operation") === "void")).toBe(false);
  });
});


describe("send invoice via QuickBooks /send only", () => {
  it("POSTs /invoice/{id}/send?sendTo= and records emailed_at, and create still never calls /send", async () => {
    const { store, db } = memoryStore();
    const invoices: Record<string, { Id: string; SyncToken: string; DocNumber: string; TotalAmt: number; Balance: number; EmailStatus: string; DueDate: string; TxnDate: string }> = {};
    const f = scriptedFetch((c) => {
      const path = c.url.pathname.replace("/v3/company/123/", "");
      if (path === "customer/58") return { json: { Customer: { Id: "58", DisplayName: "Golf Road Auto Body" } } };
      if (path === "invoice" && c.method === "POST") { invoices["145"] = { Id: "145", SyncToken: "0", DocNumber: "1047", TotalAmt: 285, Balance: 285, EmailStatus: "NotSet", DueDate: "2026-12-13", TxnDate: "2026-11-13" }; return { json: { Invoice: invoices["145"] } }; }
      if (path === "invoice/145/send") {
        expect(c.method).toBe("POST");
        expect(c.url.searchParams.get("sendTo")).toBe("office@example.com");
        invoices["145"] = { ...invoices["145"], EmailStatus: "EmailSent", SyncToken: "1" };
        return { json: { Invoice: invoices["145"] } };
      }
      if (path === "invoice/145") return { json: { Invoice: invoices["145"] } };
      return { json: { QueryResponse: {} } };
    });
    const a = api(f.fetch);
    const v = validateInvoiceDraft(draft());
    if ("error" in v) throw new Error(v.error);
    const row = await createInvoiceForTicket({ api: a, store, environment: "sandbox", serviceRequestId: "sr2", portalCustomerId: "c2", draft: v.draft, user: { id: "u1" } });
    expect(f.calls.some((c) => c.url.pathname.endsWith("/send"))).toBe(false);
    await expect(sendInvoiceForTicket({ api: a, store, row, sendTo: "not-an-email", user: { id: "u1", name: "Luke" }, today: "2026-11-13" })).rejects.toThrow(/valid email/);
    const sent = await sendInvoiceForTicket({ api: a, store, row, sendTo: " office@example.com ", user: { id: "u1", name: "Luke" }, today: "2026-11-13" });
    expect(sent.history).toBe("Invoice #1047 emailed to office@example.com by Luke.");
    expect(sent.row).toMatchObject({ email_status: "EmailSent", status: "sent", emailed_to: "office@example.com" });
    expect(sent.row.emailed_at).toBeTruthy();
    expect(invoiceView(sent.row, "2026-11-13")).toMatchObject({ emailedTo: "office@example.com", status: "sent" });
    expect(invoiceEmailedHistory("1047", "office@example.com", "Luke")).toBe(sent.history);
  });
});

describe("sparse fill-blanks customer update", () => {
  it("fills only blank QuickBooks fields and merges addresses so Country does not wipe Line1", async () => {
    const { store } = memoryStore();
    await store.setCustomerLink({ customer_id: "c9", realm_id: "123", qbo_customer_id: "99", qbo_display_name: "2626 N Lincoln Corporation", linked_by: "u1", linked_at: "2026-11-13T00:00:00Z" });
    const existing = {
      Id: "99", SyncToken: "4", DisplayName: "2626 N Lincoln Corporation",
      PrimaryEmailAddr: { Address: "rjrajnauth@gmail.com" },
      PrimaryPhone: { FreeFormNumber: "(312) 618-4349" },
      BillAddr: { Line1: "2626 N Lincoln Ave", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60614" },
    };
    const f = scriptedFetch((c) => {
      const path = c.url.pathname.replace("/v3/company/123/", "");
      if (path === "customer/99" && c.method === "GET") return { json: { Customer: existing } };
      if (path === "customer" && c.method === "POST") return { json: { Customer: { ...existing, ...JSON.parse(c.body), SyncToken: "5" } } };
      return { json: {} };
    });
    const result = await fillLinkedCustomer(api(f.fetch), store, "c9", {
      id: "c9", name: "2626 N Lincoln Corporation", email: "rjrajnauth@gmail.com", phone: "(312) 618-4349",
      address: "2626 N Lincoln Ave", city: "Chicago", state: "IL", zip: "60614",
      contactName: "Rodney Rajnauth", contactEmail: "rjrajnauth@gmail.com", contactPhone: "(312) 618-4349",
      siteAddress: "2626 N Lincoln Ave", siteCity: "Chicago", siteState: "IL", siteZip: "60614",
    });
    expect(result).toBe("updated");
    const post = f.calls.find((c) => c.method === "POST")!;
    const body = JSON.parse(post.body);
    expect(body).toMatchObject({ Id: "99", SyncToken: "4", sparse: true, CompanyName: "2626 N Lincoln Corporation", GivenName: "Rodney", FamilyName: "Rajnauth" });
    expect(body.PrimaryEmailAddr).toBeUndefined();
    expect(body.PrimaryPhone).toBeUndefined();
    expect(body.BillAddr).toEqual({ Line1: "2626 N Lincoln Ave", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60614", Country: "US" });
    expect(body.ShipAddr).toEqual({ Line1: "2626 N Lincoln Ave", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60614", Country: "US" });
    expect(body.Notes).toBe("RR Scheduler customer c9");
  });
  it("is a no-op when QuickBooks already has the fields", async () => {
    const { store } = memoryStore();
    await store.setCustomerLink({ customer_id: "c9", realm_id: "123", qbo_customer_id: "99", qbo_display_name: "2626 N Lincoln Corporation", linked_by: "u1", linked_at: "2026-11-13T00:00:00Z" });
    const full = {
      Id: "99", SyncToken: "5", DisplayName: "2626 N Lincoln Corporation", CompanyName: "Edited in QBO", GivenName: "Rod", FamilyName: "Rajnauth",
      PrimaryEmailAddr: { Address: "other@example.com" }, PrimaryPhone: { FreeFormNumber: "1" },
      BillAddr: { Line1: "Edited St", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60614", Country: "US" },
      ShipAddr: { Line1: "Edited St", City: "Chicago", CountrySubDivisionCode: "IL", PostalCode: "60614", Country: "US" },
      Notes: "Keep this",
    };
    const f = scriptedFetch((c) => ({ json: { Customer: full } }));
    expect(await fillLinkedCustomer(api(f.fetch), store, "c9", {
      id: "c9", name: "2626 N Lincoln Corporation", contactName: "Rodney Rajnauth",
      address: "2626 N Lincoln Ave", city: "Chicago", state: "IL", zip: "60614",
    })).toBe("unchanged");
    expect(f.calls.every((c) => c.method === "GET")).toBe(true);
  });
});
