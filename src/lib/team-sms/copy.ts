import { dayKey } from "@/lib/time";
import type { TeamSmsEntityType } from "./constants";

const STREET_ABBR: Array<[RegExp, string]> = [
  [/\bStreet\b/gi, "St"],
  [/\bCourt\b/gi, "Ct"],
  [/\bAvenue\b/gi, "Ave"],
  [/\bRoad\b/gi, "Rd"],
  [/\bBoulevard\b/gi, "Blvd"],
  [/\bParkway\b/gi, "Pkwy"],
  [/\bDrive\b/gi, "Dr"],
  [/\bLane\b/gi, "Ln"],
  [/\bPlace\b/gi, "Pl"],
  [/\bSouth\b/gi, "S"],
  [/\bNorth\b/gi, "N"],
  [/\bEast\b/gi, "E"],
  [/\bWest\b/gi, "W"],
];

export function shortAddress(address?: string | null, city?: string | null): string {
  let street = (address ?? "").trim();
  for (const [re, to] of STREET_ABBR) street = street.replace(re, to);
  street = street.replace(/,/g, "").replace(/\s+/g, " ").trim();
  const town = (city ?? "").trim();
  if (street && town) return `${street}, ${town}`;
  return street || town;
}

/** "Tue 9:00 AM" in the business time zone. */
export function fmtSmsWhen(iso: string): string {
  const raw = new Date(iso).toLocaleString("en-US", {
    timeZone: process.env.NEXT_PUBLIC_TZ || "America/Chicago",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return raw.replace(",", "");
}

export function siteBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "https://rrschedulingportal.vercel.app";
  return raw.replace(/\/$/, "");
}

export function entityPath(type: TeamSmsEntityType, id: string): string {
  if (type === "visit") return `/jobs/${id}`;
  if (type === "service_request") return `/service-requests/${id}`;
  return `/tasks/${id}`;
}

export function entityLink(type: TeamSmsEntityType, id: string): string {
  return `${siteBaseUrl()}${entityPath(type, id)}`;
}

export type TeamSmsFragment = {
  kind: "assignment" | "same_day";
  entityType: TeamSmsEntityType;
  summary: string;
  link: string;
};

export function visitAssignmentSummary(startsAt: string, address?: string | null, city?: string | null): string {
  const where = shortAddress(address, city);
  return where ? `New visit ${fmtSmsWhen(startsAt)}, ${where}` : `New visit ${fmtSmsWhen(startsAt)}`;
}

export function visitChangeSummary(change: "moved" | "cancelled" | "reassigned", startsAt: string, address?: string | null, city?: string | null): string {
  const when = fmtSmsWhen(startsAt);
  const where = shortAddress(address, city);
  const loc = where ? `, ${where}` : "";
  if (change === "moved") return `Visit moved to ${when}${loc}`;
  if (change === "cancelled") return `Visit cancelled ${when}${loc}`;
  return `Visit reassigned ${when}${loc}`;
}

export function serviceRequestAssignmentSummary(number?: number | null, summary?: string | null): string {
  if (number != null) return `New service request #${number} assigned to you`;
  if (summary) return `New service request: ${summary}`;
  return "New service request assigned to you";
}

export function taskAssignmentSummary(title: string, due?: string | null): string {
  const dueBit = due ? `, due ${new Date(due + (due.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}` : "";
  return `New task: ${title}${dueBit}`;
}

function openLink(link: string): string {
  return `Open: ${link}`;
}

/** One event, ready to send. */
export function formatSingleText(fragment: TeamSmsFragment): string {
  return `RR: ${fragment.summary}. ${openLink(fragment.link)}`;
}

/** Several events in one 10-minute window, one text. */
export function formatBatchText(fragments: TeamSmsFragment[]): string {
  if (fragments.length === 0) return "";
  if (fragments.length === 1) return formatSingleText(fragments[0]!);
  const parts = fragments.map((f) => f.summary);
  const firstLink = fragments[0]!.link;
  const mixed = fragments.some((f) => f.link !== firstLink);
  const link = mixed ? `${siteBaseUrl()}/` : firstLink;
  return `RR: ${fragments.length} updates: ${parts.join("; ")}. ${openLink(link)}`;
}

export type MorningVisitLine = { startsAt: string; address?: string | null; city?: string | null };

export function formatMorningSummary(visits: MorningVisitLine[]): string {
  const link = `${siteBaseUrl()}/schedule`;
  if (visits.length === 0) return `RR: No visits today. ${openLink(link)}`;
  const lines = [...visits]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((v) => {
      const time = fmtSmsWhen(v.startsAt).replace(/^[A-Za-z]{3}\s/, "");
      const where = shortAddress(v.address, v.city);
      return where ? `${time} ${where}` : time;
    });
  return `RR: Today: ${lines.join("; ")}. ${openLink(link)}`;
}

export function morningKey(day: string): string {
  return day || dayKey(new Date());
}
