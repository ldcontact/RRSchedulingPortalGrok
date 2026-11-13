import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sendMail = vi.fn();
const close = vi.fn();
const createTransport = vi.fn(() => ({ sendMail, close }));
const authorize = vi.fn();
const jwtCtor = vi.fn(function JWT(this: unknown, opts: unknown) {
  return { authorize, opts };
});

vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("google-auth-library", () => ({ JWT: jwtCtor }));

const DUMMY_PEM = "-----BEGIN PRIVATE KEY-----\nMIIBdummy\n-----END PRIVATE KEY-----\n";
const SA = {
  type: "service_account",
  project_id: "rr-scheduler-mail-514420",
  private_key_id: "abc",
  private_key: DUMMY_PEM,
  client_email: "rr-scheduler-mailer@rr-scheduler-mail-514420.iam.gserviceaccount.com",
  client_id: "100574981655353125304",
};

function stubSmtp() {
  vi.stubEnv("SMTP_USER", "admin@retrofitrebates.com");
  vi.stubEnv("SMTP_PASSWORD", "app-password");
  vi.stubEnv("EMAIL_FROM", "Retrofit Rebates Scheduler");
}

describe("sendEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMail.mockReset();
    close.mockReset();
    createTransport.mockClear();
    authorize.mockReset();
    jwtCtor.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv("GOOGLE_MAILER_SA_JSON", "");
    vi.stubEnv("GOOGLE_MAILER_SA_JSON_B64", "");
    vi.stubEnv("EMAIL_SENDER", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends through nodemailer and returns the message id", async () => {
    stubSmtp();
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
        auth: { user: "admin@retrofitrebates.com", pass: "app-password" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Retrofit Rebates Scheduler" <admin@retrofitrebates.com>',
        to: ["luke@retrofitrebates.com"],
        subject: "RR Scheduler test email",
      }),
    );
    expect(result).toEqual({
      messageId: "<abc@smtp.gmail.com>",
      accepted: ["luke@retrofitrebates.com"],
      rejected: [],
      provider: "smtp",
    });
    expect(close).toHaveBeenCalled();
  });

  it("passes CC recipients through SMTP", async () => {
    stubSmtp();
    sendMail.mockResolvedValue({
      messageId: "<cc@smtp.gmail.com>",
      accepted: ["dave@x.com", "maria@x.com"],
      rejected: [],
    });
    const { sendEmail } = await import("./email");
    await sendEmail({
      to: "dave@x.com",
      cc: "maria@x.com",
      subject: "Visit scheduled",
      text: "See you Saturday.",
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["dave@x.com"],
        cc: ["maria@x.com"],
        subject: "Visit scheduled",
      }),
    );
  });

  it("logs and skips when neither Gmail API nor SMTP is configured", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendEmail } = await import("./email");
    const result = await sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" });
    expect(result).toEqual({ messageId: "", accepted: [], rejected: [], provider: "none", skipped: true });
    expect(createTransport).not.toHaveBeenCalled();
    expect(jwtCtor).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("[email] skipped send:"), expect.stringMatching(/GOOGLE_MAILER_SA_JSON|SMTP_USER/));
    info.mockRestore();
  });

  it("sanitizes transporter failures", async () => {
    stubSmtp();
    sendMail.mockRejectedValue({ responseCode: 535, response: "535 bad pass=super-secret" });
    const { sendEmail } = await import("./email");
    await expect(sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" })).rejects.toThrow(/SMTP 535/);
    await expect(sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" })).rejects.not.toThrow(/super-secret/);
    expect(close).toHaveBeenCalled();
  });

  it("prefers the Gmail API when a service account is configured, even if SMTP is also set", async () => {
    stubSmtp();
    vi.stubEnv("GOOGLE_MAILER_SA_JSON", JSON.stringify(SA));
    vi.stubEnv("EMAIL_SENDER", "admin@retrofitrebates.com");
    authorize.mockResolvedValue({ access_token: "tok-gmail", token_type: "Bearer" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "msg-123", threadId: "thr-1", labelIds: ["SENT"] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { sendEmail } = await import("./email");
    const result = await sendEmail({
      to: "luke@retrofitrebates.com",
      subject: "RR Scheduler test email",
      text: "Hello from the portal.",
    });
    expect(jwtCtor).toHaveBeenCalledWith(expect.objectContaining({
      email: SA.client_email,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      subject: "admin@retrofitrebates.com",
    }));
    const jwtArgs = jwtCtor.mock.calls[0]?.[0] as { key?: string };
    expect(jwtArgs.key).toBe(DUMMY_PEM);
    expect(createTransport).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      expect.objectContaining({ method: "POST" }),
    );
    const sent = fetchMock.mock.calls[0][1] as { headers: Record<string, string>; body: string };
    expect(sent.headers.Authorization).toBe("Bearer tok-gmail");
    const raw = JSON.parse(sent.body).raw as string;
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(decoded).toContain("From: \"Retrofit Rebates Scheduler\" <admin@retrofitrebates.com>");
    expect(decoded).toContain("To: luke@retrofitrebates.com");
    expect(decoded).toContain("Subject: RR Scheduler test email");
    expect(decoded).not.toContain("Cc:");
    expect(result).toEqual({
      messageId: "msg-123",
      accepted: ["luke@retrofitrebates.com"],
      rejected: [],
      provider: "gmail-api",
    });
  });

  it("includes Cc in the Gmail API RFC2822 payload", async () => {
    vi.stubEnv("GOOGLE_MAILER_SA_JSON", JSON.stringify(SA));
    vi.stubEnv("EMAIL_SENDER", "admin@retrofitrebates.com");
    authorize.mockResolvedValue({ access_token: "tok-cc" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "msg-cc" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { sendEmail } = await import("./email");
    await sendEmail({
      to: "dave@x.com",
      cc: ["maria@x.com", "luke@retrofitrebates.com"],
      subject: "Visit scheduled",
      text: "See you Saturday.",
    });
    const sent = fetchMock.mock.calls[0][1] as { body: string };
    const raw = JSON.parse(sent.body).raw as string;
    const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    expect(decoded).toContain("To: dave@x.com");
    expect(decoded).toContain("Cc: maria@x.com, luke@retrofitrebates.com");
  });

  it("sanitizes Gmail API failures and does not leak the private key", async () => {
    vi.stubEnv("GOOGLE_MAILER_SA_JSON", JSON.stringify(SA));
    authorize.mockRejectedValue({
      status: 401,
      error: "unauthorized_client",
      message: `unauthorized_client key=${DUMMY_PEM} ya29.secret-token`,
    });
    const { sendEmail } = await import("./email");
    await expect(sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" })).rejects.toThrow(/Gmail API/);
    await expect(sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" })).rejects.toThrow(/unauthorized_client/);
    await expect(sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" })).rejects.not.toThrow(/BEGIN PRIVATE KEY/);
    await expect(sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" })).rejects.not.toThrow(/ya29/);
  });

  it("accepts a base64 service-account key", async () => {
    vi.stubEnv("GOOGLE_MAILER_SA_JSON_B64", Buffer.from(JSON.stringify(SA), "utf8").toString("base64"));
    authorize.mockResolvedValue({ access_token: "tok-b64" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "msg-b64" }) });
    vi.stubGlobal("fetch", fetchMock);
    const { sendEmail } = await import("./email");
    const result = await sendEmail({ to: "a@x.com", subject: "Hi", text: "Hello" });
    expect(result).toEqual({ messageId: "msg-b64", accepted: ["a@x.com"], rejected: [], provider: "gmail-api" });
  });
});
