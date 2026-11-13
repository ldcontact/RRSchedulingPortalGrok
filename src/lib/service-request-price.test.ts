import { describe, expect, it } from "vitest";
import {
  canSeeServicePrice,
  formatServicePrice,
  parseServicePrice,
  priceHistoryBody,
  visibleServiceRequestEvents,
} from "./service-request-price";

describe("canSeeServicePrice", () => {
  it("allows admins, managers, and sales", () => {
    expect(canSeeServicePrice("admin")).toBe(true);
    expect(canSeeServicePrice("manager")).toBe(true);
    expect(canSeeServicePrice("sales")).toBe(true);
  });
  it("hides the price from techs and anyone without a role", () => {
    expect(canSeeServicePrice("tech")).toBe(false);
    expect(canSeeServicePrice(null)).toBe(false);
    expect(canSeeServicePrice(undefined)).toBe(false);
  });
});

describe("parseServicePrice", () => {
  it("treats a blank field as no price", () => {
    expect(parseServicePrice("")).toEqual({ empty: true });
    expect(parseServicePrice("   ")).toEqual({ empty: true });
    expect(parseServicePrice(null)).toEqual({ empty: true });
    expect(parseServicePrice(undefined)).toEqual({ empty: true });
  });
  it("accepts non-negative USD amounts with up to 2 decimals", () => {
    expect(parseServicePrice("0")).toEqual({ amount: 0 });
    expect(parseServicePrice("185")).toEqual({ amount: 185 });
    expect(parseServicePrice("285.00")).toEqual({ amount: 285 });
    expect(parseServicePrice("$1,250.50")).toEqual({ amount: 1250.5 });
    expect(parseServicePrice("  10.5 ")).toEqual({ amount: 10.5 });
  });
  it("rejects negatives, extra decimals, and non-numeric values", () => {
    expect(parseServicePrice("-1")).toEqual({ error: "Enter a valid price in USD, up to 2 decimal places." });
    expect(parseServicePrice("10.999")).toEqual({ error: "Enter a valid price in USD, up to 2 decimal places." });
    expect(parseServicePrice("abc")).toEqual({ error: "Enter a valid price in USD, up to 2 decimal places." });
    expect(parseServicePrice("100000000")).toEqual({ error: "Price is too large." });
  });
});

describe("formatServicePrice and priceHistoryBody", () => {
  it("formats USD with 2 decimal places", () => {
    expect(formatServicePrice(285)).toBe("$285.00");
    expect(formatServicePrice(10.5)).toBe("$10.50");
  });
  it("writes a history line for set, change, and clear", () => {
    expect(priceHistoryBody(null, 285)).toBe("Service price set to $285.00.");
    expect(priceHistoryBody(285, 310.5)).toBe("Service price changed from $285.00 to $310.50.");
    expect(priceHistoryBody(285, null)).toBe("Service price cleared (was $285.00).");
    expect(priceHistoryBody(null, null)).toBe("Service price unchanged.");
  });
});

describe("visibleServiceRequestEvents", () => {
  const events = [
    { id: "1", kind: "created" as const, body: "Logged from a phone call." },
    { id: "2", kind: "price" as const, body: "Service price set to $285.00." },
    { id: "3", kind: "note" as const, body: "Quote a service call." },
  ];
  it("shows the amount to office roles", () => {
    expect(visibleServiceRequestEvents(events, "admin").map((e) => e.kind)).toEqual(["created", "price", "note"]);
    expect(visibleServiceRequestEvents(events, "manager").some((e) => e.kind === "price")).toBe(true);
    expect(visibleServiceRequestEvents(events, "sales").some((e) => e.kind === "price")).toBe(true);
  });
  it("strips price history so a tech never sees the amount", () => {
    const tech = visibleServiceRequestEvents(events, "tech");
    expect(tech.map((e) => e.kind)).toEqual(["created", "note"]);
    expect(tech.some((e) => e.body.includes("$"))).toBe(false);
    expect(visibleServiceRequestEvents(events, null).some((e) => e.kind === "price")).toBe(false);
  });
});
