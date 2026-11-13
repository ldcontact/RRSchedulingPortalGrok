import type { Role, SREvent } from "@/lib/types";

/** Admins, managers, and sales may see and edit a service price. Techs never can. */
export const SERVICE_PRICE_ROLES: readonly Role[] = ["admin", "manager", "sales"];

export function canSeeServicePrice(role: Role | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "sales";
}

const PRICE_RE = /^\d+(\.\d{1,2})?$/;
const PRICE_MAX = 99_999_999.99;

export type ParsedServicePrice = { amount: number } | { empty: true } | { error: string };

/** Parse a USD amount from a form field. Empty is allowed (no price). Rejects negatives and more than 2 decimals. */
export function parseServicePrice(raw: string | null | undefined): ParsedServicePrice {
  const v = String(raw ?? "").trim().replace(/[$,\s]/g, "");
  if (!v) return { empty: true };
  if (!PRICE_RE.test(v)) return { error: "Enter a valid price in USD, up to 2 decimal places." };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { error: "Price must be zero or more." };
  if (n > PRICE_MAX) return { error: "Price is too large." };
  return { amount: Math.round(n * 100) / 100 };
}

export function formatServicePrice(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Ticket history line for a price set, change, or clear. Callers must not show this to techs. */
export function priceHistoryBody(prev: number | null, next: number | null): string {
  if (prev == null && next != null) return `Service price set to ${formatServicePrice(next)}.`;
  if (prev != null && next == null) return `Service price cleared (was ${formatServicePrice(prev)}).`;
  if (prev != null && next != null) return `Service price changed from ${formatServicePrice(prev)} to ${formatServicePrice(next)}.`;
  return "Service price unchanged.";
}

/** Drop price history from a ticket timeline when the viewer must not see the amount. */
export function visibleServiceRequestEvents<T extends Pick<SREvent, "kind">>(events: T[], role: Role | null | undefined): T[] {
  if (canSeeServicePrice(role)) return events;
  return events.filter((e) => e.kind !== "price");
}
