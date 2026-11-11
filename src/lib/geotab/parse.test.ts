import { describe, expect, it } from "vitest";
import { entityId, isInvalidUserError, mergeDeviceSnapshots, parseDurationLabel, resolveGeotabServer, snapshotSpeedMph, vehicleStatus } from "./parse";

describe("mergeDeviceSnapshots", () => {
  const devices = [{ id: "b1", name: "Truck 1 – Ford Transit" }, { id: "b2", name: "Truck 2" }];
  const statuses = [
    { device: { id: "b1" }, latitude: 42.022, longitude: -88.008, speed: 45, isDriving: true, isDeviceCommunicating: true, dateTime: "2026-11-11T16:17:00.000Z", bearing: 120, driver: { id: "u9", name: "Carlos Mendez" } },
    { device: { id: "b2" }, latitude: 42.055, longitude: -88.083, speed: 0, isDriving: false, isDeviceCommunicating: true, currentStateDuration: "00:36:00", dateTime: "2026-11-11T16:16:00.000Z" },
    { device: { id: "b3" }, latitude: 42.0, longitude: -88.0, isDriving: false, isDeviceCommunicating: false },
  ];
  it("joins names from Device onto DeviceStatusInfo and maps driving speed", () => {
    const rows = mergeDeviceSnapshots(devices, statuses, { u9: "Carlos Mendez" });
    expect(rows).toHaveLength(3);
    const t1 = rows.find((r) => r.id === "b1")!;
    expect(t1.name).toBe("Truck 1 – Ford Transit");
    expect(t1.status).toBe("driving");
    expect(t1.geotabDriverName).toBe("Carlos Mendez");
    expect(snapshotSpeedMph(t1)).toBe(28); // 45 km/h
    const t2 = rows.find((r) => r.id === "b2")!;
    expect(t2.status).toBe("stopped");
    expect(parseDurationLabel(t2.currentStateDuration)).toBe("36 min");
    expect(rows.find((r) => r.id === "b3")!.status).toBe("offline");
  });
  it("skips status rows with no coordinates", () => {
    expect(mergeDeviceSnapshots(devices, [{ device: { id: "b1" }, latitude: null, longitude: null, isDriving: true }])).toEqual([]);
  });
});

describe("helpers", () => {
  it("reads opaque entity ids and federation paths", () => {
    expect(entityId({ id: "b14C3EE" })).toBe("b14C3EE");
    expect(entityId("CompanyGroupId")).toBe("CompanyGroupId");
    expect(resolveGeotabServer("my.geotab.com", "ThisServer")).toBe("my.geotab.com");
    expect(resolveGeotabServer("my.geotab.com", "my3.geotab.com")).toBe("my3.geotab.com");
    expect(isInvalidUserError({ name: "InvalidUserException" })).toBe(true);
    expect(isInvalidUserError({ message: "Invalid session @ abc" })).toBe(true);
    expect(isInvalidUserError({ message: "rate limit" })).toBe(false);
    expect(vehicleStatus({ isDriving: true, isDeviceCommunicating: true })).toBe("driving");
  });
});
