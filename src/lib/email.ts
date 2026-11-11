import "server-only";
import nodemailer from "nodemailer";
import { JWT } from "google-auth-library";
import {
  GMAIL_SEND_SCOPE,
  asAddressList,
  buildRfc2822Message,
  emailMissingMessage,
  gmailApiEnv,
  requireSendInput,
  resolveEmailTransport,
  sanitizeGmailError,
  sanitizeSmtpError,
  smtpEnv,
  smtpTransportOptions,
  toBase64Url,
  type GmailApiConfig,
  type SendEmailInput,
  type SendEmailResult,
} from "@/lib/email-config";

export {
  DEFAULT_EMAIL_FROM_NAME,
  DEFAULT_EMAIL_SENDER,
  DEFAULT_SMTP_HOST,
  DEFAULT_SMTP_PORT,
  emailConfigured,
  emailMissingMessage,
  gmailApiConfigured,
  gmailApiEnv,
  resolveEmailTransport,
  smtpConfigured,
  smtpEnv,
  smtpMissingMessage,
  type SendEmailInput,
  type SendEmailResult,
  type SmtpConfig,
} from "@/lib/email-config";

async function sendViaGmailApi(cfg: GmailApiConfig, input: SendEmailInput, to: string[]): Promise<SendEmailResult> {
  try {
    const client = new JWT({
      email: cfg.clientEmail,
      key: cfg.privateKey,
      scopes: [GMAIL_SEND_SCOPE],
      subject: cfg.sender,
    });
    const tok = await client.authorize();
    const accessToken = tok?.access_token;
    if (!accessToken) throw new Error("did not return an access token");
    const raw = toBase64Url(buildRfc2822Message({
      from: cfg.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
    }));
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    const body = await res.json().catch(() => ({})) as {
      id?: string;
      error?: { message?: string; status?: string; errors?: { reason?: string }[] };
    };
    if (!res.ok) {
      const reason = body.error?.errors?.[0]?.reason || body.error?.status || res.statusText;
      const message = body.error?.message || reason || `HTTP ${res.status}`;
      throw Object.assign(new Error(message), { status: res.status, error: reason });
    }
    return {
      messageId: body.id ?? "",
      accepted: to,
      rejected: [],
      provider: "gmail-api",
    };
  } catch (err) {
    throw sanitizeGmailError(err);
  }
}

async function sendViaSmtp(input: SendEmailInput, to: string[]): Promise<SendEmailResult> {
  const cfg = smtpEnv();
  if (!cfg) throw new Error(emailMissingMessage());
  const transporter = nodemailer.createTransport(smtpTransportOptions(cfg));
  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
    });
    return {
      messageId: info.messageId ?? "",
      accepted: asAddressList(info.accepted),
      rejected: asAddressList(info.rejected),
      provider: "smtp",
    };
  } catch (err) {
    throw sanitizeSmtpError(err);
  } finally {
    transporter.close();
  }
}

/**
 * Send a single email. Prefers the Gmail API service account when configured,
 * otherwise SMTP. If neither is configured, logs and skips (does not throw).
 * Never logs credentials or access tokens.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transport = resolveEmailTransport();
  if (transport === "none") {
    console.info("[email] skipped send:", emailMissingMessage());
    return { messageId: "", accepted: [], rejected: [], provider: "none", skipped: true };
  }
  const to = requireSendInput(input);
  if (transport === "gmail-api") {
    const cfg = gmailApiEnv();
    if (!cfg) throw new Error(emailMissingMessage());
    return sendViaGmailApi(cfg, input, to);
  }
  return sendViaSmtp(input, to);
}
