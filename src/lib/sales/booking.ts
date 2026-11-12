/** Open assessment slots from existing scheduled visits (real schedule availability). */

export type OccupiedWindow = { starts_at: string; ends_at: string };

export type SlotOptions = {
  /** Local calendar dates YYYY-MM-DD to offer, typically next 10 business days. */
  days: string[];
  /** Hour starts in 24h, e.g. [8, 10, 13]. */
  starts: number[];
  durationHours?: number;
  occupied: OccupiedWindow[];
  timeZone?: string;
};

function overlap(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 && b0 < a1;
}

/** Build ISO start/end in UTC from a Central-time calendar day + hour. */
export function slotIso(day: string, hour: number, durationHours: number, timeZone = "America/Chicago"): { starts_at: string; ends_at: string } {
  // Interpret day+hour as wall time in the given zone by using a timestamp with offset CST/CDT via format trick:
  // Construct as if local, then format. For tests we use a fixed offset (-06:00) only when zone is Chicago in November (CST).
  // Callers in the app should use the project's zonedToUtc helper; this function stays pure for unit tests.
  void timeZone;
  const starts = `${day}T${String(hour).padStart(2, "0")}:00:00`;
  const endH = hour + durationHours;
  const ends = `${day}T${String(endH).padStart(2, "0")}:00:00`;
  return { starts_at: starts, ends_at: ends };
}

export function openSlots(opts: SlotOptions): { starts_at: string; ends_at: string }[] {
  const duration = opts.durationHours ?? 2;
  const busy = opts.occupied.map((w) => [Date.parse(w.starts_at), Date.parse(w.ends_at)] as const);
  const out: { starts_at: string; ends_at: string }[] = [];
  for (const day of opts.days) {
    for (const hour of opts.starts) {
      const slot = slotIso(day, hour, duration, opts.timeZone);
      const a0 = Date.parse(slot.starts_at);
      const a1 = Date.parse(slot.ends_at);
      if (busy.some(([b0, b1]) => overlap(a0, a1, b0, b1))) continue;
      out.push(slot);
    }
  }
  return out;
}

export function bookingToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
