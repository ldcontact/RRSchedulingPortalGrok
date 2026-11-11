import { describe, expect, it } from "vitest";
import { etaMinutes, formatDistance, haversineMeters, isArrived, kmhToMph, metersToMiles } from "./distance";

describe("haversineMeters", () => {
  it("is ~0 for the same point", () => {
    expect(haversineMeters({ lat: 42.03, lng: -88.08 }, { lat: 42.03, lng: -88.08 })).toBeLessThan(0.01);
  });
  it("measures a known short hop in Schaumburg (~2.3 mi)", () => {
    // Truck 1 sample -> Elk Grove Precision, from the mockup (~2.3 mi)
    const m = haversineMeters({ lat: 42.022, lng: -88.008 }, { lat: 42.0039, lng: -87.9703 });
    const miles = metersToMiles(m);
    expect(miles).toBeGreaterThan(2.1);
    expect(miles).toBeLessThan(2.5);
  });
});

describe("isArrived", () => {
  const visit = { lat: 42.0548, lng: -88.0815 };
  it("is true when a stopped truck is within 150 m", () => {
    expect(isArrived({ status: "stopped", lat: 42.05516, lng: -88.08235 }, visit)).toBe(true);
  });
  it("is false when driving, even if close", () => {
    expect(isArrived({ status: "driving", lat: 42.05516, lng: -88.08235 }, visit)).toBe(false);
  });
  it("is false when farther than 150 m or the visit has no coords", () => {
    expect(isArrived({ status: "stopped", lat: 42.022, lng: -88.008 }, visit)).toBe(false);
    expect(isArrived({ status: "stopped", lat: 42.05516, lng: -88.08235 }, null)).toBe(false);
  });
});

describe("formatters", () => {
  it("formats short distances as On site and converts km/h", () => {
    expect(formatDistance(40)).toBe("On site");
    expect(formatDistance(1609.344 * 2.3)).toBe("2.3 mi");
    expect(kmhToMph(100)).toBeCloseTo(62.137, 2);
    expect(etaMinutes(1609.344 * 2.5, 30)).toBe(5);
  });
});
