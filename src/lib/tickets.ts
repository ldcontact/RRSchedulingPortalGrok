import type { JobKind, ServiceRequestView } from "@/lib/types";
import { dayKey, fmtDay, fmtTime, timeKey, todayKey, addDays } from "@/lib/time";

/** "Today 9:14am", "Mon 4:22pm" (this week), "Nov 5" (this year), "Nov 5, 2025". */
export function fmtReceived(iso: string) {
  const d = dayKey(iso), T = todayKey();
  if (d === T) return `Today ${fmtTime(iso)}`;
  if (d === addDays(T, -1)) return `Yesterday ${fmtTime(iso)}`;
  if (d > addDays(T, -7)) return `${fmtDay(d, { weekday: "short" })} ${fmtTime(iso)}`;
  return d.slice(0, 4) === T.slice(0, 4) ? fmtDay(d, { month: "short", day: "numeric" }) : fmtDay(d, { month: "short", day: "numeric", year: "numeric" });
}
export const fmtMonthYear = (iso: string) => fmtDay(dayKey(iso), { month: "short", year: "numeric" });
export const fmtDate = (iso: string) => fmtDay(dayKey(iso), { month: "short", day: "numeric", year: "numeric" });
/** Value for <input type="datetime-local"> in the business time zone. */
export const localInput = (iso: string) => `${dayKey(iso)}T${timeKey(iso)}`;

/** Suggested visit type + title for a ticket: warranty unless it's out of warranty or already billable. */
export function visitDefaults(sr: Pick<ServiceRequestView, "warranty_state" | "billable" | "summary">): { kind: JobKind; title: string } {
  const kind: JobKind = sr.warranty_state === "out" || sr.billable ? "service" : "warranty";
  return { kind, title: `${kind === "warranty" ? "Warranty" : "Service"} — ${sr.summary}`.slice(0, 120) };
}

/** Office owner for a new ticket: the person who logged it, unless a staff assignee was explicitly chosen. */
export function resolveNewTicketAssignee(
  explicitId: string | null | undefined,
  creator: { id: string; name: string },
  staff: { id: string; full_name: string }[] = [],
): { id: string; name: string } | { error: string } {
  const chosen = explicitId?.trim() ?? "";
  if (!chosen) {
    if (!creator.id) return { error: "Not signed in." };
    return { id: creator.id, name: creator.name };
  }
  const who = staff.find((p) => p.id === chosen);
  if (!who) return { error: "Pick an admin or manager." };
  return { id: who.id, name: who.full_name };
}
