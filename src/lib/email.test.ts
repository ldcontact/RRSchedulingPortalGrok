import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_EMAIL_FROM_NAME,
  DEFAULT_EMAIL_SENDER,
  DEFAULT_SMTP_HOST,
  DEFAULT_SMTP_PORT,
  buildRfc2822Message,
  emailConfigured,
  formatFromAddress,
  gmailApiConfigured,
  gmailApiEnv,
  parseServiceAccountJson,
  parseSmtpPort,
  requireSendInput,
  resolveEmailTransport,
  sanitizeGmailError,
  sanitizeSmtpError,
  smtpConfigured,
  smtpEnv,
  smtpSecureForPort,
  smtpTransportOptions,
  toBase64Url,
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
    expect(formatFromAddress(undefined, "admin@retrofitrebates.com")).toBe(
      `"${DEFAULT_EMAIL_FROM_NAME}" <admin@retrofitrebates.com>`,
    );
    expect(formatFromAddress("  ", "admin@retrofitrebates.com")).toBe(
      `"${DEFAULT_EMAIL_FROM_NAME}" <admin@retrofitrebates.com>`,
    );
  });
  it("keeps a full Name <email> value", () => {
    expect(formatFromAddress("Office <office@retrofitrebates.com>", "admin@retrofitrebates.com")).toBe(
      "Office <office@retrofitrebates.com>",
    );
  });
  it("wraps a bare mailbox with the default display name", () => {
    expect(formatFromAddress("office@retrofitrebates.com", "admin@retrofitrebates.com")).toBe(
      `"${DEFAULT_EMAIL_FROM_NAME}" <office@retrofitrebates.com>`,
    );
  });
  it("pairs a display name with SMTP_USER", () => {
    expect(formatFromAddress("Retrofit Rebates Scheduler", "admin@retrofitrebates.com")).toBe(
      `"Retrofit Rebates Scheduler" <admin@retrofitrebates.com>`,
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
    expect(smtpEnv({ SMTP_USER: "admin@retrofitrebates.com" })).toBeNull();
    expect(smtpEnv({ SMTP_PASSWORD: "x" })).toBeNull();
    expect(smtpConfigured({})).toBe(false);
  });
  it("fills Gmail defaults and formats From", () => {
    const cfg = smtpEnv({
      SMTP_USER: " admin@retrofitrebates.com ",
      SMTP_PASSWORD: "app-password",
      EMAIL_FROM: "Retrofit Rebates Scheduler",
    });
    expect(cfg).toMatchObject({
      host: DEFAULT_SMTP_HOST,
      port: 465,
      secure: true,
      user: "admin@retrofitrebates.com",
      from: `"Retrofit Rebates Scheduler" <admin@retrofitrebates.com>`,
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

const DUMMY_PEM = "-----BEGIN PRIVATE KEY-----\nMIIBdummy\n-----END PRIVATE KEY-----\n";
const SA = {
  type: "service_account",
  project_id: "rr-scheduler-mail-514420",
  private_key_id: "abc",
  private_key: DUMMY_PEM,
  client_email: "rr-scheduler-mailer@rr-scheduler-mail-514420.iam.gserviceaccount.com",
  client_id: "100574981655353125304",
};

describe("parseServiceAccountJson / gmailApiEnv", () => {
  it("parses a valid service-account key and ignores incomplete JSON", () => {
    const parsed = parseServiceAccountJson(JSON.stringify(SA));
    expect(parsed).toMatchObject({
      type: "service_account",
      project_id: "rr-scheduler-mail-514420",
      client_email: SA.client_email,
      client_id: SA.client_id,
    });
    expect(parsed?.private_key).toContain("BEGIN PRIVATE KEY");
    expect(parseServiceAccountJson(undefined)).toBeNull();
    expect(parseServiceAccountJson("{")).toBeNull();
    expect(parseServiceAccountJson(JSON.stringify({ type: "service_account", client_email: "x@y.com" }))).toBeNull();
  });
  it("unescapes a single-line private_key and accepts base64 input", () => {
    const oneLine = { ...SA, private_key: "-----BEGIN PRIVATE KEY-----\\nMIIBdummy\\n-----END PRIVATE KEY-----\\n" };
    expect(parseServiceAccountJson(JSON.stringify(oneLine))?.private_key).toContain("\n");
    const b64 = Buffer.from(JSON.stringify(SA), "utf8").toString("base64");
    expect(parseServiceAccountJson(b64)?.client_email).toBe(SA.client_email);
  });
  it("prefers Gmail API over SMTP when both are set", () => {
    const env = {
      GOOGLE_MAILER_SA_JSON: JSON.stringify(SA),
      EMAIL_SENDER: "admin@retrofitrebates.com",
      EMAIL_FROM: "Retrofit Rebates Scheduler",
      SMTP_USER: "admin@retrofitrebates.com",
      SMTP_PASSWORD: "x",
    };
    expect(gmailApiConfigured(env)).toBe(true);
    expect(smtpConfigured(env)).toBe(true);
    expect(emailConfigured(env)).toBe(true);
    expect(resolveEmailTransport(env)).toBe("gmail-api");
    const cfg = gmailApiEnv(env)!;
    expect(cfg.sender).toBe(DEFAULT_EMAIL_SENDER);
    expect(cfg.from).toBe(`"${DEFAULT_EMAIL_FROM_NAME}" <admin@retrofitrebates.com>`);
    expect(cfg.clientEmail).toBe(SA.client_email);
  });
  it("defaults EMAIL_SENDER and reports none when nothing is configured", () => {
    expect(resolveEmailTransport({})).toBe("none");
    expect(emailConfigured({})).toBe(false);
    const cfg = gmailApiEnv({ GOOGLE_MAILER_SA_JSON: JSON.stringify(SA) })!;
    expect(cfg.sender).toBe(DEFAULT_EMAIL_SENDER);
  });
});

describe("buildRfc2822Message / toBase64Url", () => {
  it("builds a plain and a multipart message", () => {
    const plain = buildRfc2822Message({ from: "A <a@x.com>", to: ["b@x.com"], subject: "Hi", text: "Hello" });
    expect(plain).toContain("From: A <a@x.com>");
    expect(plain).toContain("Content-Type: text/plain; charset=utf-8");
    expect(plain).not.toContain("multipart/alternative");
    const multi = buildRfc2822Message({ from: "A <a@x.com>", to: ["b@x.com"], subject: "Hi", text: "Hello", html: "<p>Hello</p>" });
    expect(multi).toContain("multipart/alternative");
    expect(multi).toContain("<p>Hello</p>");
    const encoded = toBase64Url(plain);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("sets Message-ID, In-Reply-To, and References for a threaded reply", () => {
    const raw = buildRfc2822Message({
      from: "A <a@x.com>",
      to: ["b@x.com"],
      subject: "Task: Hello",
      text: "Updated",
      messageId: "<reply@x.com>",
      inReplyTo: "<root@x.com>",
      references: "<root@x.com>",
    });
    expect(raw).toContain("Message-ID: <reply@x.com>");
    expect(raw).toContain("In-Reply-To: <root@x.com>");
    expect(raw).toContain("References: <root@x.com>");
    expect(raw).toContain("Date: ");
  });

  it("adds a Cc header when recipients are provided", () => {
    const raw = buildRfc2822Message({
      from: "A <a@x.com>",
      to: ["b@x.com"],
      cc: ["c@x.com", "d@x.com"],
      subject: "Hi",
      text: "Hello",
    });
    expect(raw).toContain("To: b@x.com");
    expect(raw).toContain("Cc: c@x.com, d@x.com");
    const plain = buildRfc2822Message({ from: "A <a@x.com>", to: ["b@x.com"], subject: "Hi", text: "Hello" });
    expect(plain).not.toContain("Cc:");
  });
});

describe("sanitizeGmailError", () => {
  it("redacts PEM material and tokens", () => {
    const err = sanitizeGmailError({
      status: 401,
      error: "unauthorized_client",
      message: `unauthorized_client ${DUMMY_PEM} ya29.abc-token`,
    });
    expect(err.message).toMatch(/Gmail API 401 unauthorized_client/);
    expect(err.message).not.toContain("BEGIN PRIVATE KEY");
    expect(err.message).not.toContain("ya29");
  });
});
