import { addDays, dayKey, minutesOfDay, zonedToUtc } from "@/lib/time";
import { BATCH_WINDOW_MINUTES, QUIET_HOURS_END_MINUTES, QUIET_HOURS_START_MINUTES } from "./constants";

export function inQuietHours(at: Date): boolean {
  const minutes = minutesOfDay(at);
  return minutes >= QUIET_HOURS_START_MINUTES || minutes < QUIET_HOURS_END_MINUTES;
}

/** Next 7:00 AM CT on or after `at`. If `at` is exactly 7:00, returns `at`. */
export function nextSevenAmCt(at: Date): Date {
  const day = dayKey(at);
  const sevenToday = new Date(zonedToUtc(day, QUIET_HOURS_END_MINUTES));
  if (at.getTime() <= sevenToday.getTime()) return sevenToday;
  return new Date(zonedToUtc(addDays(day, 1), QUIET_HOURS_END_MINUTES));
}

/**
 * Earliest time a staff text may go out: 10 minutes after `at`, but never
 * during quiet hours (8 PM–7 AM CT). Events in quiet hours wait until 7 AM.
 */
export function earliestSendAt(at: Date): Date {
  const batched = new Date(at.getTime() + BATCH_WINDOW_MINUTES * 60_000);
  if (inQuietHours(at) || inQuietHours(batched)) {
    const seven = nextSevenAmCt(at);
    return batched.getTime() > seven.getTime() ? batched : seven;
  }
  return batched;
}

/** Today or tomorrow in the business time zone. */
export function isTodayOrTomorrow(iso: string, now: Date = new Date()): boolean {
  const day = dayKey(iso);
  const today = dayKey(now);
  return day === today || day === addDays(today, 1);
}
