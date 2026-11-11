/**
 * Outbound SMTP configuration. Safe to import from tests (no server-only).
 * Never log SMTP_PASSWORD or include it in thrown messages.
 */
export const DEFAULT_EMAIL_FROM_NAME = "Retrofit Rebates Scheduler";
export const DEFAULT_SMTP_HOST = "smtp.gmail.com";
export const DEFAULT_SMTP_PORT = 465;

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

export function smtpMissingMessage() {
  return "Outbound email is not configured. Set SMTP_USER and SMTP_PASSWORD (and optionally SMTP_HOST, SMTP_PORT, EMAIL_FROM) in the server environment.";
}

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
 * a bare mailbox, or a display name (which is paired with SMTP_USER).
 */
export function formatFromAddress(from: string | undefined, user: string): string {
  const trimmed = from?.trim() ?? "";
  if (!trimmed) return `"${DEFAULT_EMAIL_FROM_NAME}" <${user}>`;
  if (trimmed.includes("<")) return trimmed;
  if (trimmed.includes("@")) return `"${DEFAULT_EMAIL_FROM_NAME}" <${trimmed}>`;
  return `"${trimmed}" <${user}>`;
}

export type SmtpEnvSource = Record<string, string | undefined>;

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

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export type SendEmailResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
};

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

export function sanitizeSmtpError(err: unknown): Error {
  const e = err && typeof err === "object" ? (err as { message?: string; response?: string; responseCode?: number }) : null;
  const raw = String(e?.response || e?.message || err);
  const clean = raw
    .replace(/pass(?:word)?["']?\s*[:=]\s*["']?[^,"'\s]+/gi, "password=[redacted]")
    .replace(/AUTH[^\n]{0,200}/gi, "AUTH [redacted]");
  return new Error(e?.responseCode ? `SMTP ${e.responseCode}: ${clean}` : clean);
}
