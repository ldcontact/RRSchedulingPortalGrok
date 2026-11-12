import { describe, expect, it } from "vitest";
import { canAccessSales, canDeleteSalesRecord, canSeeAllDeals, canViewDeal, isStaffRole } from "./permissions";

describe("sales permissions", () => {
  it("lets admin, manager, and sales into Sales, but never techs", () => {
    expect(canAccessSales("admin")).toBe(true);
    expect(canAccessSales("manager")).toBe(true);
    expect(canAccessSales("sales")).toBe(true);
    expect(canAccessSales("tech")).toBe(false);
    expect(canAccessSales(null)).toBe(false);
  });

  it("does not treat sales as office staff", () => {
    expect(isStaffRole("sales")).toBe(false);
    expect(isStaffRole("admin")).toBe(true);
  });

  it("lets sales see only their own deals (and unassigned)", () => {
    expect(canSeeAllDeals("sales")).toBe(false);
    expect(canViewDeal({ role: "sales", userId: "u-sales", ownerId: "u-sales" })).toBe(true);
    expect(canViewDeal({ role: "sales", userId: "u-sales", ownerId: null })).toBe(true);
    expect(canViewDeal({ role: "sales", userId: "u-sales", ownerId: "u-other" })).toBe(false);
    expect(canViewDeal({ role: "admin", userId: "u-admin", ownerId: "u-other" })).toBe(true);
    expect(canViewDeal({ role: "tech", userId: "u-tech", ownerId: "u-sales" })).toBe(false);
  });

  it("uses the existing delete rule: admin always, manager with toggle, sales and techs never", () => {
    expect(canDeleteSalesRecord({ role: "admin" })).toBe(true);
    expect(canDeleteSalesRecord({ role: "manager", can_delete: true })).toBe(true);
    expect(canDeleteSalesRecord({ role: "manager", can_delete: false })).toBe(false);
    expect(canDeleteSalesRecord({ role: "sales", can_delete: true })).toBe(false);
    expect(canDeleteSalesRecord({ role: "tech", can_delete: true })).toBe(false);
  });
});
