import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendMail = vi.fn();
const close = vi.fn();
const createTransport = vi.fn(() => ({ sendMail, close }));

vi.mock("nodemailer", () => ({ default: { createTransport } }));

describe("sendEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMail.mockReset();
    close.mockReset();
    createTransport.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv("SMTP_USER", "scheduler@retrofitrebates.com");
    vi.stubEnv("SMTP_PASSWORD", "app-password");
    vi.stubEnv("EMAIL_FROM", "Retrofit Rebates Scheduler");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends through nodemailer and returns the message id", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@smtp.gmail.com>", accepted: ["luke@retrofitrebates.com"], rejected: [] });
    const { sendEmail } = await import("./email");
    const result = await sendEmail({
      to: "luke@retrofitrebates.com",
      subject: "RR Scheduler test email",
      text: "The portal can now send from this mailbox.",
    });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: "scheduler@retrofitrebates.com", pass: "app-password" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Retrofit Rebates Scheduler" <scheduler@retrofitrebates.com>',
        to: ["luke@retrofitrebates.com"],
        subject: "RR Scheduler test email",
      }),
    );
    expect(result).toEqual({
      messageId: "<abc@smtp.gmail.com>",
      accepted: ["luke@retrofitrebates.com"],
      rejected: [],
    });
    expect(close).toHaveBeenCalled();
  });

  it("throws a clear error when SMTP is not configured", async () => {
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASSWORD", "");
    const { sendEmail } = await import("./email");
    await expect(sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" })).rejects.toThrow(/SMTP_USER/);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("sanitizes transporter failures", async () => {
    sendMail.mockRejectedValue({ responseCode: 535, response: "535 bad pass=super-secret" });
    const { sendEmail } = await import("./email");
    await expect(sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" })).rejects.toThrow(/SMTP 535/);
    await expect(sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" })).rejects.not.toThrow(/super-secret/);
    expect(close).toHaveBeenCalled();
  });
});
