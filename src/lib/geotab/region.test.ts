import { describe, expect, it } from "vitest";
import { autoFitPoints, hasValidCoordinates, includeInAutoFit, isInContinentalUS, isMappablePoint, isRecentPing } from "./region";

const SCHAUMBURG = { latitude: 42.033, longitude: -88.083 };
const AS_OF = "2026-11-11T16:15:00.000Z";

describe("coordinate filters", () => {
  it("rejects missing, non-finite, and 0,0 coordinates", () => {
    expect(hasValidCoordinates(null, -88)).toBe(false);
    expect(hasValidCoordinates(42, undefined)).toBe(false);
    expect(hasValidCoordinates(Number.NaN, -88)).toBe(false);
    expect(hasValidCoordinates(0, 0)).toBe(false);
    expect(hasValidCoordinates(42.03, -88.08)).toBe(true);
  });
  it("accepts continental US points and rejects ones far outside", () => {
    expect(isInContinentalUS(42.03, -88.08)).toBe(true);
    expect(isInContinentalUS(25.76, -80.19)).toBe(true); // Miami
    expect(isInContinentalUS(21.3, -157.8)).toBe(false); // Honolulu
    expect(isInContinentalUS(61.2, -149.9)).toBe(false); // Anchorage
    expect(isMappablePoint(-10, -10)).toBe(false); // stale off-Africa style point
    expect(isMappablePoint(0, 0)).toBe(false);
    expect(isMappablePoint(SCHAUMBURG.latitude, SCHAUMBURG.longitude)).toBe(true);
  });
});

describe("recency and auto-fit", () => {
  it("treats a ping within 7 days as recent and an April ping as stale", () => {
    expect(isRecentPing("2026-11-11T16:06:00.000Z", AS_OF)).toBe(true);
    expect(isRecentPing("2026-11-10T19:13:00.000Z", AS_OF)).toBe(true);
    expect(isRecentPing("2026-11-04T16:15:00.000Z", AS_OF)).toBe(true); // exactly 7 days
    expect(isRecentPing("2026-11-03T16:15:00.000Z", AS_OF)).toBe(false);
    expect(isRecentPing("2026-04-29T19:13:00.000Z", AS_OF)).toBe(false);
    expect(isRecentPing(null, AS_OF)).toBe(false);
  });
  it("fits recent in-region vehicles and visits, but not stale or out-of-region points", () => {
    const vehicles = [
      { ...SCHAUMBURG, lastUpdate: "2026-11-11T16:06:00.000Z", isDeviceCommunicating: true, status: "stopped" },
      { latitude: -10, longitude: -10, lastUpdate: "2026-04-29T19:13:00.000Z", isDeviceCommunicating: false, status: "offline" },
      { latitude: 42.08, longitude: -88.02, lastUpdate: "2026-04-29T19:13:00.000Z", isDeviceCommunicating: false, status: "offline" },
    ];
    const visits = [{ latitude: 42.048, longitude: -88.101 }];
    const pts = autoFitPoints(vehicles, visits, AS_OF);
    expect(pts).toHaveLength(2);
    expect(pts).toEqual(expect.arrayContaining([
      { latitude: SCHAUMBURG.latitude, longitude: SCHAUMBURG.longitude },
      { latitude: 42.048, longitude: -88.101 },
    ]));
    expect(includeInAutoFit(vehicles[1], AS_OF)).toBe(false);
    expect(includeInAutoFit(vehicles[2], AS_OF)).toBe(false);
    expect(isMappablePoint(vehicles[2].latitude, vehicles[2].longitude)).toBe(true);
  });
});
