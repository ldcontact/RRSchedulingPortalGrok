/**
 * Outbound email configuration. Safe to import from tests (no server-only).
 * Never log SMTP_PASSWORD, service-account private keys, or access tokens.
 */
export const DEFAULT_EMAIL_FROM_NAME = "Retrofit Rebates Scheduler";
export const DEFAULT_EMAIL_SENDER = "admin@retrofitrebates.com";
export const DEFAULT_SMTP_HOST = "smtp.gmail.com";
export const DEFAULT_SMTP_PORT = 465;
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export type SmtpEnvSource = Record<string, string | undefined>;

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  tls: { servername: string };
};

export type GmailApiConfig = {
  clientEmail: string;
  privateKey: string;
  clientId: string;
  projectId: string;
  sender: string;
  from: string;
};

export type EmailTransport = "gmail-api" | "smtp" | "none";

export type SendEmailInput = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  /** RFC Message-ID for this message, including angle brackets. */
  messageId?: string;
  /** In-Reply-To header (root Message-ID) so later mail threads in Gmail. */
  inReplyTo?: string;
  /** References header; usually the same as inReplyTo for this app. */
  references?: string;
};

export type SendEmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  provider: EmailTransport;
  skipped?: boolean;
};

export function smtpMissingMessage() {
  return "Outbound email is not configured. Set GOOGLE_MAILER_SA_JSON (or GOOGLE_MAILER_SA_JSON_B64) and EMAIL_SENDER, or SMTP_USER and SMTP_PASSWORD, in the server environment.";
}

export const emailMissingMessage = smtpMissingMessage;

export function parseSmtpPort(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_SMTP_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }
  return n;
}

/** Port 465 uses implicit TLS; other ports (e.g. 587) use STARTTLS. */
export function smtpSecureForPort(port: number): boolean {
  return port === 465;
}

/**
 * Build a From header. EMAIL_FROM may be a full `Name <email>` value,
 * a bare mailbox, or a display name (which is paired with the sender mailbox).
 */
export function formatFromAddress(from: string | undefined, user: string): string {
  const trimmed = from?.trim() ?? "";
  if (!trimmed) return `"${DEFAULT_EMAIL_FROM_NAME}" <${user}>`;
  if (trimmed.includes("<")) return trimmed;
  if (trimmed.includes("@")) return `"${DEFAULT_EMAIL_FROM_NAME}" <${trimmed}>`;
  return `"${trimmed}" <${user}>`;
}

export function smtpEnv(env: SmtpEnvSource = process.env): SmtpConfig | null {
  const user = env.SMTP_USER?.trim() ?? "";
  const password = env.SMTP_PASSWORD ?? "";
  if (!user || !password) return null;
  const host = env.SMTP_HOST?.trim() || DEFAULT_SMTP_HOST;
  const port = parseSmtpPort(env.SMTP_PORT);
  return {
    host,
    port,
    secure: smtpSecureForPort(port),
    user,
    password,
    from: formatFromAddress(env.EMAIL_FROM, user),
  };
}

export function smtpConfigured(env: SmtpEnvSource = process.env): boolean {
  return smtpEnv(env) != null;
}

export function smtpTransportOptions(cfg: SmtpConfig): SmtpTransportOptions {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    tls: { servername: cfg.host },
  };
}

export type ServiceAccountFields = {
  type: string;
  project_id: string;
  client_email: string;
  client_id: string;
  private_key: string;
};

function looksLikePem(key: string): boolean {
  return /-----BEGIN ([A-Z0-9 ]+)?PRIVATE KEY-----/.test(key) && /-----END ([A-Z0-9 ]+)?PRIVATE KEY-----/.test(key);
}

function readJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function decodeMaybeBase64Json(raw: string): Record<string, unknown> | null {
  const compact = raw.replace(/\s+/g, "");
  try {
    const decoded = Buffer.from(compact, "base64").toString("utf8").trim();
    if (!decoded.startsWith("{")) return null;
    return readJsonObject(decoded);
  } catch {
    return null;
  }
}

/** Parse a Workspace service-account key object. Returns null if it is missing or incomplete. Never logs the key. */
export function parseServiceAccountJson(raw: string | undefined): ServiceAccountFields | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const obj = trimmed.startsWith("{") ? readJsonObject(trimmed) : decodeMaybeBase64Json(trimmed);
  if (!obj) return null;
  const type = typeof obj.type === "string" ? obj.type : "";
  const project_id = typeof obj.project_id === "string" ? obj.project_id : "";
  const client_email = typeof obj.client_email === "string" ? obj.client_email.trim() : "";
  const client_id = typeof obj.client_id === "string" ? obj.client_id.trim() : "";
  let private_key = typeof obj.private_key === "string" ? obj.private_key : "";
  // Some pastes keep a single-line key with escaped newlines.
  if (private_key.includes("\\n") && !private_key.includes("\n")) {
    private_key = private_key.replace(/\\n/g, "\n");
  }
  if (type !== "service_account" || !client_email.includes("@") || !looksLikePem(private_key)) return null;
  return { type, project_id, client_email, client_id, private_key };
}

export function parseServiceAccountFromEnv(env: SmtpEnvSource = process.env): ServiceAccountFields | null {
  const direct = parseServiceAccountJson(env.GOOGLE_MAILER_SA_JSON);
  if (direct) return direct;
  return parseServiceAccountJson(env.GOOGLE_MAILER_SA_JSON_B64);
}

export function gmailApiEnv(env: SmtpEnvSource = process.env): GmailApiConfig | null {
  const sa = parseServiceAccountFromEnv(env);
  if (!sa) return null;
  const sender = env.EMAIL_SENDER?.trim() || DEFAULT_EMAIL_SENDER;
  return {
    clientEmail: sa.client_email,
    privateKey: sa.private_key,
    clientId: sa.client_id,
    projectId: sa.project_id,
    sender,
    from: formatFromAddress(env.EMAIL_FROM, sender),
  };
}

export function gmailApiConfigured(env: SmtpEnvSource = process.env): boolean {
  return gmailApiEnv(env) != null;
}

export function emailConfigured(env: SmtpEnvSource = process.env): boolean {
  return gmailApiConfigured(env) || smtpConfigured(env);
}

/** Prefer the Gmail API service account when present; otherwise SMTP. */
export function resolveEmailTransport(env: SmtpEnvSource = process.env): EmailTransport {
  if (gmailApiConfigured(env)) return "gmail-api";
  if (smtpConfigured(env)) return "smtp";
  return "none";
}

export function normalizeRecipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).map((s) => s.trim()).filter(Boolean);
}

export function requireSendInput(input: SendEmailInput): string[] {
  const to = normalizeRecipients(input.to);
  if (!to.length) throw new Error("A recipient is required.");
  if (!input.subject.trim()) throw new Error("A subject is required.");
  if (!input.text.trim() && !input.html?.trim()) throw new Error("A message body is required.");
  return to;
}

export function asAddressList(value: unknown): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

export function redactSecrets(raw: string): string {
  return raw
    .replace(/-----BEGIN[\s\S]*?-----END[^-]+-----/g, "[redacted-pem]")
    .replace(/pass(?:word)?["']?\s*[:=]\s*["']?[^,"'\s]+/gi, "password=[redacted]")
    .replace(/AUTH[^\n]{0,200}/gi, "AUTH [redacted]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-token]");
}

export function sanitizeSmtpError(err: unknown): Error {
  const e = err && typeof err === "object" ? (err as { message?: string; response?: string; responseCode?: number }) : null;
  const raw = String(e?.response || e?.message || err);
  const clean = redactSecrets(raw);
  return new Error(e?.responseCode ? `SMTP ${e.responseCode}: ${clean}` : clean);
}

type GmailErr = {
  message?: string;
  code?: string | number;
  status?: number;
  error?: string;
  response?: {
    status?: number;
    data?: { error?: string | { message?: string; status?: string }; error_description?: string };
  };
};

export function sanitizeGmailError(err: unknown): Error {
  const e = err && typeof err === "object" ? (err as GmailErr) : null;
  const data = e?.response?.data;
  const nested = data && typeof data.error === "object" && data.error ? data.error : null;
  const status = e?.status || e?.response?.status || (typeof e?.code === "number" ? e.code : undefined);
  const code = nested?.status || (typeof data?.error === "string" ? data.error : undefined) || e?.error || (typeof e?.code === "string" ? e.code : undefined);
  const raw = String(nested?.message || (typeof data?.error === "string" ? data.error_description || data.error : "") || e?.message || err);
  const clean = redactSecrets(raw);
  const label = [status, code].filter(Boolean).join(" ");
  return new Error(label ? `Gmail API ${label}: ${clean}` : `Gmail API: ${clean}`);
}

export function rfc2822Date(d = new Date()): string {
  return d.toUTCString().replace(/GMT$/, "+0000");
}

export function buildRfc2822Message(input: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  date?: Date;
}): string {
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    `Subject: ${input.subject}`,
    `Date: ${rfc2822Date(input.date)}`,
  ];
  if (input.cc?.length) headers.push(`Cc: ${input.cc.join(", ")}`);
  if (input.messageId) headers.push(`Message-ID: ${input.messageId}`);
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references || input.inReplyTo) headers.push(`References: ${input.references || input.inReplyTo}`);
  headers.push("MIME-Version: 1.0");
  if (input.replyTo) headers.push(`Reply-To: ${input.replyTo}`);
  if (input.html?.trim()) {
    const boundary = `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      input.text,
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      input.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }
  return [...headers, "Content-Type: text/plain; charset=utf-8", "", input.text].join("\r\n");
}

export function toBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
