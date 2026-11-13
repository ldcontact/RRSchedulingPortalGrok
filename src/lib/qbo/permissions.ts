import type { Role } from "@/lib/types";

/** Invoices: admins and managers only. Techs never; sales no. Enforced in every server action and route. */
export function canUseQboInvoices(role: Role | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

/** Connect / disconnect the QuickBooks company: admins only. */
export function canManageQboConnection(role: Role | null | undefined): boolean {
  return role === "admin";
}
