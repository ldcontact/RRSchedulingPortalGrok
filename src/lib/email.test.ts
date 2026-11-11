import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EMAIL_FROM_NAME,
  DEFAULT_SMTP_HOST,
  DEFAULT_SMTP_PORT,
  formatFromAddress,
  parseSmtpPort,
  requireSendInput,
  sanitizeSmtpError,
  smtpConfigured,
  smtpEnv,
  smtpSecureForPort,
  smtpTransportOptions,
} from "./email-config";

const KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubSmtp(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) vi.stubEnv(key, values[key] ?? "");
}

describe("formatFromAddress", () => {
  it("defaults to the product display name and SMTP user", () => {
    expect(formatFromAddress(undefined, "scheduler@retrofitrebates.com")).toBe(
      `"${DEFAULT_EMAIL_FROM_NAME}" <scheduler@retrofitrebates.com>`,
    );
    expect(formatFromAddress("  ", "scheduler@retrofitrebates.com")).toBe(
      `"${DEFAULT_EMAIL_FROM_NAME}" <scheduler@retrofitrebates.com>`,
    );
  });
  it("keeps a full Name <email> value", () => {
    expect(formatFromAddress("Office <office@retrofitrebates.com>", "scheduler@retrofitrebates.com")).toBe(
      "Office <office@retrofitrebates.com>",
    );
  });
  it("wraps a bare mailbox with the default display name", () => {
    expect(formatFromAddress("office@retrofitrebates.com", "scheduler@retrofitrebates.com")).toBe(
      `"${DEFAULT_EMAIL_FROM_NAME}" <office@retrofitrebates.com>`,
    );
  });
  it("pairs a display name with SMTP_USER", () => {
    expect(formatFromAddress("Retrofit Rebates Scheduler", "scheduler@retrofitrebates.com")).toBe(
      `"Retrofit Rebates Scheduler" <scheduler@retrofitrebates.com>`,
    );
  });
});

describe("parseSmtpPort / smtpSecureForPort", () => {
  it("defaults to 465 with implicit TLS", () => {
    expect(parseSmtpPort(undefined)).toBe(DEFAULT_SMTP_PORT);
    expect(parseSmtpPort("")).toBe(465);
    expect(smtpSecureForPort(465)).toBe(true);
  });
  it("treats 587 as STARTTLS", () => {
    expect(parseSmtpPort("587")).toBe(587);
    expect(smtpSecureForPort(587)).toBe(false);
  });
  it("rejects invalid ports", () => {
    expect(() => parseSmtpPort("0")).toThrow(/valid TCP port/);
    expect(() => parseSmtpPort("smtp")).toThrow(/valid TCP port/);
  });
});

describe("smtpEnv", () => {
  it("returns null when user or password is missing", () => {
    expect(smtpEnv({})).toBeNull();
    expect(smtpEnv({ SMTP_USER: "scheduler@retrofitrebates.com" })).toBeNull();
    expect(smtpEnv({ SMTP_PASSWORD: "x" })).toBeNull();
    expect(smtpConfigured({})).toBe(false);
  });
  it("fills Gmail defaults and formats From", () => {
    const cfg = smtpEnv({
      SMTP_USER: " scheduler@retrofitrebates.com ",
      SMTP_PASSWORD: "app-password",
      EMAIL_FROM: "Retrofit Rebates Scheduler",
    });
    expect(cfg).toMatchObject({
      host: DEFAULT_SMTP_HOST,
      port: 465,
      secure: true,
      user: "scheduler@retrofitrebates.com",
      from: `"Retrofit Rebates Scheduler" <scheduler@retrofitrebates.com>`,
    });
    expect(cfg?.password).toBe("app-password");
    expect(smtpConfigured({ SMTP_USER: "s@x.com", SMTP_PASSWORD: "x" })).toBe(true);
  });
  it("honors explicit host and port 587", () => {
    const cfg = smtpEnv({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "s@x.com",
      SMTP_PASSWORD: "x",
    });
    expect(cfg).toMatchObject({ host: "smtp.example.com", port: 587, secure: false });
    const opts = smtpTransportOptions(cfg!);
    expect(opts).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "s@x.com", pass: "x" },
      tls: { servername: "smtp.example.com" },
    });
  });
  it("reads from process.env via stubs", () => {
    stubSmtp({ SMTP_USER: "s@x.com", SMTP_PASSWORD: "secret" });
    expect(smtpEnv()?.user).toBe("s@x.com");
  });
});

describe("requireSendInput", () => {
  it("normalizes recipients and rejects blanks", () => {
    expect(requireSendInput({ to: " a@x.com ", subject: "Hi", text: "Hello" })).toEqual(["a@x.com"]);
    expect(() => requireSendInput({ to: "  ", subject: "Hi", text: "Hello" })).toThrow(/recipient/);
    expect(() => requireSendInput({ to: "a@x.com", subject: "  ", text: "Hello" })).toThrow(/subject/);
    expect(() => requireSendInput({ to: "a@x.com", subject: "Hi", text: "  " })).toThrow(/body/);
  });
});

describe("sanitizeSmtpError", () => {
  it("does not repeat credentials and includes the SMTP status", () => {
    const err = sanitizeSmtpError({
      responseCode: 535,
      response: '535-5.7.8 Username and Password not accepted. pass="super-secret"',
      message: "Invalid login: pass=super-secret AUTH PLAIN AHNjaGVkdWxlcg",
    });
    expect(err.message).toMatch(/^SMTP 535:/);
    expect(err.message).not.toContain("super-secret");
    expect(err.message).not.toMatch(/AUTH PLAIN/);
  });
});
