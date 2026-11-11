import "server-only";
import nodemailer from "nodemailer";
import {
  asAddressList,
  requireSendInput,
  sanitizeSmtpError,
  smtpEnv,
  smtpMissingMessage,
  smtpTransportOptions,
  type SendEmailInput,
  type SendEmailResult,
} from "@/lib/email-config";

export {
  DEFAULT_EMAIL_FROM_NAME,
  DEFAULT_SMTP_HOST,
  DEFAULT_SMTP_PORT,
  smtpConfigured,
  smtpEnv,
  smtpMissingMessage,
  type SendEmailInput,
  type SendEmailResult,
  type SmtpConfig,
} from "@/lib/email-config";

/** Send a single email through the configured SMTP mailbox. Does not log credentials. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = smtpEnv();
  if (!cfg) throw new Error(smtpMissingMessage());
  const to = requireSendInput(input);
  const transporter = nodemailer.createTransport(smtpTransportOptions(cfg));
  try {
    const info = await transporter.sendMail({
      from: cfg.from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
    });
    return {
      messageId: info.messageId ?? "",
      accepted: asAddressList(info.accepted),
      rejected: asAddressList(info.rejected),
    };
  } catch (err) {
    throw sanitizeSmtpError(err);
  } finally {
    transporter.close();
  }
}
