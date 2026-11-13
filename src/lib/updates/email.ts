import { TZ } from "@/lib/time";
import type { TeamUpdateKind } from "./types";
import { notificationTitle } from "./recipients";

export function updatesAppOrigin(): string {
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://rrschedulingportal.vercel.app";
  return raw.replace(/\/$/, "");
}

export function absoluteUpdateLink(path: string, origin = updatesAppOrigin()): string {
  if (path.startsWith("http")) return path;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

export type UpdateEmailInput = {
  actorName: string;
  contextTitle: string;
  kind: TeamUpdateKind;
  body: string;
  link: string;
  postedAt: string;
};

export type UpdateEmail = { subject: string; text: string; html: string };

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " CT";
}

/** One notification email per event. Internal staff only — never call this with a customer address. */
export function buildUpdateEmail(input: UpdateEmailInput): UpdateEmail {
  const subject = notificationTitle(input.kind, input.actorName, input.contextTitle);
  const url = absoluteUpdateLink(input.link);
  const preview = input.body.trim() || "(no text)";
  const text = [
    subject,
    "",
    preview,
    "",
    `Posted ${when(input.postedAt)}`,
    `Open the thread: ${url}`,
    "",
    "This message is for Retrofit Rebates staff only. Customers are never copied.",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#1f2a24;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #d9d3c7;border-radius:12px;overflow:hidden;">
    <div style="background:#0f3d38;color:#fff;padding:16px 20px;font-family:ui-sans-serif,system-ui,sans-serif;">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">RR Scheduler · Team update</div>
      <div style="font-size:18px;font-weight:700;margin-top:4px;">${escapeHtml(subject)}</div>
    </div>
    <div style="padding:20px;">
      <p style="margin:0 0 12px;white-space:pre-wrap;font-size:16px;line-height:1.45;">${escapeHtml(preview)}</p>
      <p style="margin:0 0 20px;font-size:13px;color:#5b665e;">Posted ${escapeHtml(when(input.postedAt))}</p>
      <p style="margin:0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0f3d38;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-family:ui-sans-serif,system-ui,sans-serif;font-weight:600;">Open the thread</a></p>
    </div>
    <div style="padding:12px 20px;background:#f4f1ea;font-size:11px;color:#5b665e;font-family:ui-sans-serif,system-ui,sans-serif;">
      Internal staff only. Customers are never copied on team updates.
    </div>
  </div>
</body>
</html>`;
  return { subject, text, html };
}
