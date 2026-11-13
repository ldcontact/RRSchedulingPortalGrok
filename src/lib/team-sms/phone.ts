import { FORBIDDEN_PHONE_NUMBERS } from "./constants";

/** Normalize a US number to E.164. Returns null if it cannot be used. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (trimmed.startsWith("+") && digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function isForbiddenPhone(raw: string | null | undefined): boolean {
  const e164 = toE164(raw);
  if (!e164) return false;
  return (FORBIDDEN_PHONE_NUMBERS as readonly string[]).includes(e164);
}
