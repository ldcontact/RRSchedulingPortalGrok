/**
 * Time-zone helpers. Jobs are stored as UTC timestamps; the business runs on one
 * local clock (default America/Chicago, override with NEXT_PUBLIC_TZ). Servers on
 * Vercel run in UTC, so never rely on the process time zone.
 */
export const TZ = process.env.NEXT_PUBLIC_TZ || "America/Chicago";

const partsFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function parts(d: Date) {
  const o: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(d)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute };
}
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" of an instant in the business time zone. */
export function dayKey(iso: string | Date): string { const p = parts(new Date(iso)); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
/** Minutes since local midnight. */
export function minutesOfDay(iso: string | Date): number { const p = parts(new Date(iso)); return p.h * 60 + p.min; }
/** "HH:MM" local. */
export function timeKey(iso: string | Date): string { const p = parts(new Date(iso)); return `${pad(p.h)}:${pad(p.min)}`; }
export const todayKey = () => dayKey(new Date());

/** Local wall-clock (day "YYYY-MM-DD", minutes) -> UTC ISO string. */
export function zonedToUtc(day: string, minutes: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  // offset at that instant (handles DST): local(guess) - guess
  const p = parts(new Date(guess));
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  const t = guess - (asUtc - guess);
  const p2 = parts(new Date(t)); // second pass for DST edges
  const asUtc2 = Date.UTC(p2.y, p2.m - 1, p2.d, p2.h, p2.min);
  return new Date(guess - (asUtc2 - t)).toISOString();
}
export const parseHHMM = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export const weekday = (day: string) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
/** Monday of the week containing day. */
export const weekStart = (day: string) => addDays(day, -((weekday(day) + 6) % 7));
export const monthStart = (day: string) => day.slice(0, 8) + "01";
export const validDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

const utcNoon = (day: string) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
export const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  utcNoon(day).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
export const fmtRange = (a: string, b: string) => `${fmtTime(a)}–${fmtTime(b)}`;
export const fmtWhen = (iso: string) => `${fmtDay(dayKey(iso))} · ${fmtTime(iso)}`;
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const fmtMinutes = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}${mm ? ":" + pad(mm) : ""}${h < 12 ? "am" : "pm"}`; };
export const overlaps = (a1: string, a2: string, b1: string, b2: string) => a1 < b2 && b1 < a2;
export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
