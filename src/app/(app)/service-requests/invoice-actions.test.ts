import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  role: "admin" as string,
  redirect: vi.fn((url: string): never => { throw new Error(`NEXT_REDIRECT ${url}`); }),
  getQboApi: vi.fn(),
  getQboState: vi.fn(),
  disconnectQbo: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Same contract as the real requireRole: anyone outside the listed roles is redirected away.
vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(async (...roles: string[]) => {
    if (!roles.includes(h.role)) h.redirect("/?denied=1");
    return { id: "u1", role: h.role, name: "Luke" };
  }),
}));
vi.mock("@/lib/data/repo", () => ({ getRepo: vi.fn(async () => ({ getServiceRequest: vi.fn(async () => null), addServiceRequestEvent: vi.fn() })) }));
vi.mock("@/lib/qbo/service", () => ({ getQboApi: h.getQboApi, getQboState: h.getQboState, qboFetch: vi.fn() }));
vi.mock("@/lib/qbo/store", () => ({ getQboStore: vi.fn(() => ({ getActiveInvoice: vi.fn(async () => null), updateConnection: vi.fn() })) }));
vi.mock("@/lib/qbo/connect", () => ({ disconnectQbo: h.disconnectQbo }));

import { createInvoiceAction, createQboCustomerAction, searchQboCustomersAction, sendInvoiceAction, updateQboCustomerAction, voidInvoiceAction } from "./invoice-actions";
import { disconnectQboAction } from "../settings/integrations/actions";

const confirmFd = () => { const f = new FormData(); f.set("confirm", "1"); return f; };

describe("QuickBooks server actions permissions", () => {
  beforeEach(() => { vi.clearAllMocks(); h.getQboApi.mockResolvedValue(null); });

  it.each(["tech", "sales"])("%s can't search, create customers, create or void invoices", async (role) => {
    h.role = role;
    await expect(searchQboCustomersAction("golf")).rejects.toThrow("NEXT_REDIRECT /?denied=1");
    await expect(createQboCustomerAction("sr2")).rejects.toThrow("NEXT_REDIRECT /?denied=1");
    await expect(createInvoiceAction("sr2", {})).rejects.toThrow("NEXT_REDIRECT /?denied=1");
    await expect(voidInvoiceAction("sr2", confirmFd())).rejects.toThrow("NEXT_REDIRECT /?denied=1");
    await expect(sendInvoiceAction("sr2", confirmFd())).rejects.toThrow("NEXT_REDIRECT /?denied=1");
    await expect(updateQboCustomerAction("sr2", confirmFd())).rejects.toThrow("NEXT_REDIRECT /?denied=1");
    expect(h.getQboApi).not.toHaveBeenCalled();
  });

  it("managers reach QuickBooks (and get a friendly not-connected error)", async () => {
    h.role = "manager";
    expect(await searchQboCustomersAction("golf")).toEqual({ error: "QuickBooks isn't connected. An admin can connect it in Settings." });
    expect(h.getQboApi).toHaveBeenCalled();
  });

  it("validates the draft before any QuickBooks call", async () => {
    h.role = "admin";
    expect(await createInvoiceAction("sr2", { customerId: "" })).toEqual({ error: "Match or create a QuickBooks customer first." });
    expect(h.getQboApi).not.toHaveBeenCalled();
  });

  it("void needs the confirm field", async () => {
    h.role = "admin";
    await expect(voidInvoiceAction("sr2", new FormData())).rejects.toThrow(/error=Confirm%20to%20void/);
  });

  it("send and update-customer need the confirm field, and send validates the email", async () => {
    h.role = "admin";
    await expect(sendInvoiceAction("sr2", new FormData())).rejects.toThrow(/error=Confirm%20to%20send/);
    const bad = new FormData(); bad.set("confirm", "1"); bad.set("send_to", "not-an-email");
    await expect(sendInvoiceAction("sr2", bad)).rejects.toThrow(/error=Enter%20a%20valid%20email/);
    await expect(updateQboCustomerAction("sr2", new FormData())).rejects.toThrow(/error=Confirm%20to%20update/);
    expect(h.getQboApi).not.toHaveBeenCalled();
  });

  it("only admins can disconnect, and only after confirming", async () => {
    h.role = "manager";
    await expect(disconnectQboAction(confirmFd())).rejects.toThrow(/Only%20an%20admin/);
    h.role = "tech";
    await expect(disconnectQboAction(confirmFd())).rejects.toThrow("NEXT_REDIRECT /?denied=1");
    h.role = "admin";
    await expect(disconnectQboAction(new FormData())).rejects.toThrow(/Confirm%20to%20disconnect/);
    expect(h.disconnectQbo).not.toHaveBeenCalled();
    h.getQboState.mockResolvedValue({ kind: "connected", config: {}, connection: { company_name: "Retrofit Rebates, Inc." } });
    await expect(disconnectQboAction(confirmFd())).rejects.toThrow(/ok=QuickBooks/);
    expect(h.disconnectQbo).toHaveBeenCalledTimes(1);
  });
});
