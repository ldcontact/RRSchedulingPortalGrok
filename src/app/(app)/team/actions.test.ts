import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { redirect, requireRole, sendEmail, emailConfigured } = vi.hoisted(() => ({
  redirect: vi.fn((url: string): never => {
    const err = new Error("NEXT_REDIRECT");
    throw err;
  }),
  requireRole: vi.fn(),
  sendEmail: vi.fn(),
  emailConfigured: vi.fn(() => true),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("@/lib/env", () => ({ MOCK_MODE: false }));
vi.mock("@/lib/data/repo", () => ({ getRepo: vi.fn() }));
vi.mock("@/lib/site", () => ({ siteUrl: vi.fn() }));
vi.mock("@/lib/admin-users", () => ({
  adminKeyMissingMessage: vi.fn(),
  banAuthUser: vi.fn(),
  setAuthPassword: vi.fn(),
  updateAuthEmail: vi.fn(),
  validateAdminPassword: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail,
  emailConfigured,
  emailMissingMessage: () => "email missing",
}));

import { sendSelfTestEmail } from "./actions";

describe("sendSelfTestEmail", () => {
  beforeEach(() => {
    redirect.mockClear();
    sendEmail.mockReset();
    requireRole.mockReset();
    emailConfigured.mockReturnValue(true);
    requireRole.mockResolvedValue({ id: "admin-1", email: "admin@example.com", role: "admin" });
  });

  it("redirects to a success banner after a successful send, not NEXT_REDIRECT", async () => {
    sendEmail.mockResolvedValue({
      messageId: "msg-123",
      accepted: ["admin@example.com"],
      rejected: [],
      provider: "gmail_api",
    });
    await expect(sendSelfTestEmail()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledTimes(1);
    const url = String(redirect.mock.calls[0][0]);
    expect(url.startsWith("/team?ok=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Test email sent to admin@example.com. Message ID: msg-123"));
    expect(url).not.toContain("error=");
    expect(url).not.toContain("NEXT_REDIRECT");
  });

  it("redirects to an error banner when sendEmail throws a real failure", async () => {
    sendEmail.mockRejectedValue(new Error("SMTP connection timed out"));
    await expect(sendSelfTestEmail()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledTimes(1);
    const url = String(redirect.mock.calls[0][0]);
    expect(url.startsWith("/team?error=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("SMTP connection timed out");
    expect(decodeURIComponent(url)).not.toContain("NEXT_REDIRECT");
  });
});
