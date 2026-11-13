import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const env = vi.hoisted(() => ({ MOCK_MODE: false }));

const { redirect, requireRole, sendEmail, emailConfigured, getRepo, addServiceRequestEvent } = vi.hoisted(() => ({
  redirect: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT");
  }),
  requireRole: vi.fn(),
  sendEmail: vi.fn(),
  emailConfigured: vi.fn(() => true),
  getRepo: vi.fn(),
  addServiceRequestEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole }));
vi.mock("@/lib/env", () => ({
  get MOCK_MODE() {
    return env.MOCK_MODE;
  },
}));
vi.mock("@/lib/data/repo", () => ({ getRepo, findConflicts: vi.fn() }));
vi.mock("@/lib/geocode/run", () => ({ geocodeServiceRequestById: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail,
  emailConfigured,
  emailMissingMessage: () => "email missing",
}));

import { sendScheduleEmail } from "./actions";

const VISIT = {
  id: "j12",
  starts_at: "2026-11-14T15:00:00.000Z",
  ends_at: "2026-11-14T17:00:00.000Z",
  status: "scheduled",
  assignees: [{ id: "u-tech1", full_name: "Carlos Mendez", color: "#000" }],
};

function fd(over: Record<string, string> = {}) {
  const f = new FormData();
  f.set("request_id", "sr4");
  f.set("to", "dkowalski@egprecision.example");
  f.set("cc", "maria.santos@gmail.com");
  f.set("subject", "Your Retrofit Rebates service visit is scheduled for Saturday, November 14, 2026");
  f.set("body", "Hi Dave,\n\nSee you Saturday.");
  for (const [k, v] of Object.entries(over)) f.set(k, v);
  return f;
}

function banner(url: string) {
  const u = new URL(url, "https://example.test");
  return { path: u.pathname, ok: u.searchParams.get("ok"), error: u.searchParams.get("error") };
}

describe("sendScheduleEmail", () => {
  beforeEach(() => {
    env.MOCK_MODE = false;
    redirect.mockClear();
    sendEmail.mockReset();
    addServiceRequestEvent.mockReset();
    requireRole.mockReset();
    emailConfigured.mockReturnValue(true);
    requireRole.mockResolvedValue({ id: "u-admin", email: "luke@retrofitrebates.com", role: "admin" });
    getRepo.mockResolvedValue({
      getServiceRequest: vi.fn(async () => ({ id: "sr4", number: 1004, contact_email: "dkowalski@egprecision.example" })),
      listJobs: vi.fn(async () => [VISIT]),
      addServiceRequestEvent,
    });
  });

  it("is allowed for admin and manager only", async () => {
    sendEmail.mockResolvedValue({ messageId: "m1", accepted: ["dkowalski@egprecision.example"], rejected: [], provider: "smtp" });
    await expect(sendScheduleEmail(fd())).rejects.toThrow("NEXT_REDIRECT");
    expect(requireRole).toHaveBeenCalledWith("admin", "manager");
  });

  it("does not call the mailer in mock mode, but still logs the send", async () => {
    env.MOCK_MODE = true;
    await expect(sendScheduleEmail(fd())).rejects.toThrow("NEXT_REDIRECT");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(addServiceRequestEvent).toHaveBeenCalledWith("sr4", {
      kind: "emailed",
      body: "Schedule email sent to dkowalski@egprecision.example (cc maria.santos@gmail.com).",
    });
    const { path, ok, error } = banner(String(redirect.mock.calls[0][0]));
    expect(path).toBe("/service-requests/sr4");
    expect(ok).toMatch(/Dev mock mode: schedule email to dkowalski@egprecision.example simulated \(not sent\)/);
    expect(error).toBeNull();
  });

  it("sends through the shared mailer and logs who it went to", async () => {
    sendEmail.mockResolvedValue({
      messageId: "msg-visit",
      accepted: ["dkowalski@egprecision.example", "maria.santos@gmail.com"],
      rejected: [],
      provider: "gmail-api",
    });
    await expect(sendScheduleEmail(fd())).rejects.toThrow("NEXT_REDIRECT");
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0][0];
    expect(arg.to).toBe("dkowalski@egprecision.example");
    expect(arg.cc).toEqual(["maria.santos@gmail.com"]);
    expect(arg.subject).toMatch(/scheduled for Saturday, November 14, 2026/);
    expect(arg.text).toContain("Hi Dave");
    expect(arg.html).toContain("Hi Dave");
    expect(addServiceRequestEvent).toHaveBeenCalledWith("sr4", {
      kind: "emailed",
      body: "Schedule email sent to dkowalski@egprecision.example (cc maria.santos@gmail.com).",
    });
    const { ok, error } = banner(String(redirect.mock.calls[0][0]));
    expect(ok).toBe("Schedule email sent to dkowalski@egprecision.example. CC maria.santos@gmail.com.");
    expect(error).toBeNull();
  });

  it("does not send when the ticket has no visit", async () => {
    getRepo.mockResolvedValue({
      getServiceRequest: vi.fn(async () => ({ id: "sr4", number: 1004 })),
      listJobs: vi.fn(async () => []),
      addServiceRequestEvent,
    });
    await expect(sendScheduleEmail(fd())).rejects.toThrow("NEXT_REDIRECT");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(addServiceRequestEvent).not.toHaveBeenCalled();
    expect(banner(String(redirect.mock.calls[0][0])).error).toBe("Schedule a visit first.");
  });

  it("rejects an invalid To address without sending", async () => {
    await expect(sendScheduleEmail(fd({ to: "not-an-email" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(banner(String(redirect.mock.calls[0][0])).error).toMatch(/valid customer email/i);
  });

  it("surfaces a mailer failure without logging a send", async () => {
    sendEmail.mockRejectedValue(new Error("SMTP connection timed out"));
    await expect(sendScheduleEmail(fd())).rejects.toThrow("NEXT_REDIRECT");
    expect(addServiceRequestEvent).not.toHaveBeenCalled();
    const { error } = banner(String(redirect.mock.calls[0][0]));
    expect(error).toBe("SMTP connection timed out");
    expect(error).not.toContain("NEXT_REDIRECT");
  });
});
