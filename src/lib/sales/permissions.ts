import type { Role } from "@/lib/types";

/** Office staff who already run the portal (unchanged). */
export const isStaffRole = (role: Role | null | undefined) => role === "admin" || role === "manager";

/** Admin, manager, or sales — anyone who may open the Sales section. Techs never can. */
export const canAccessSales = (role: Role | null | undefined) => isStaffRole(role) || role === "sales";

/** Admin, manager, and sales all see the whole pipeline. Techs never do. */
export const canSeeAllDeals = (role: Role | null | undefined) => canAccessSales(role);

export const canManageAutomations = (role: Role | null | undefined) => isStaffRole(role) || role === "sales";

export const canConvertDeal = (role: Role | null | undefined) => canAccessSales(role);

/** Same delete rule as the rest of the portal: admins always; managers only with the toggle; techs never. Sales never delete customers, projects, visits, or deals. */
export function canDeleteSalesRecord(user: { role: Role | null | undefined; can_delete?: boolean | null }) {
  if (user.role === "admin") return true;
  if (user.role === "manager") return !!user.can_delete;
  return false;
}

export function canViewDeal(opts: {
  role: Role | null | undefined;
  userId: string;
  ownerId: string | null;
}): boolean {
  if (!canAccessSales(opts.role)) return false;
  if (canSeeAllDeals(opts.role)) return true;
  return !opts.ownerId || opts.ownerId === opts.userId;
}
