import { describe, expect, it } from "vitest";
import type { FleetVehicle } from "@/lib/geotab/types";
import { truckCardHtml, unmappedVehicleNames } from "./truck-card";

const base: FleetVehicle = {
  id: "gt-t1",
  name: "Truck 1 – Ford Transit",
  label: null,
  status: "driving",
  speedMph: 28,
  latitude: 42.03,
  longitude: -87.97,
  heading: 120,
  lastUpdate: "2026-11-13T15:24:00.000Z",
  isDeviceCommunicating: true,
  stoppedForLabel: null,
  parkedSince: null,
  geotabDriverName: null,
  profile: { id: "u-tech1", full_name: "Carlos Mendez", color: "#ea580c" },
  nearestVisit: null,
};

describe("truckCardHtml", () => {
  it("shows only existing status info when the tech has no visit today", () => {
    const html = truckCardHtml(base);
    expect(html).toContain("Carlos Mendez");
    expect(html).toContain("28 mph");
    expect(html).not.toContain("Next visit today");
    expect(html).not.toContain("No tech mapped");
  });

  it("reports a missing vehicle–tech mapping", () => {
    const html = truckCardHtml({ ...base, profile: null, geotabDriverName: null, name: "Van 5" });
    expect(html).toContain("No tech mapped to this truck");
    expect(unmappedVehicleNames([{ ...base, profile: null, name: "Van 5" }, base])).toEqual(["Van 5"]);
  });

  it("treats an invite mapping as assigned and skips the unmapped warning", () => {
    const invited = {
      ...base,
      profile: { id: "invite:sam.ortiz@gmail.com", full_name: "Sam Ortiz", color: "#0891b2", invited: true, email: "sam.ortiz@gmail.com" },
      geotabDriverName: null,
      name: "Van 5",
    };
    const html = truckCardHtml(invited);
    expect(html).toContain("Sam Ortiz (invited)");
    expect(html).not.toContain("No tech mapped");
    expect(unmappedVehicleNames([invited, { ...base, profile: null, name: "Kenny White Van" }])).toEqual(["Kenny White Van"]);
  });

  it("shows on-site copy instead of an ETA when the truck is already at the job", () => {
    const html = truckCardHtml({
      ...base,
      status: "stopped",
      speedMph: 0,
      nearestVisit: {
        jobId: "j4", title: "High bays", customerName: "Golf Road Auto Body", address: "905 E Golf Rd",
        startsAt: "2026-11-13T13:00:00.000Z", distanceMeters: 80, distanceLabel: "On site",
        straightLineMeters: 80, straightLineLabel: "On site", drivingDistanceMeters: 80, drivingDistanceLabel: "On site",
        driveSource: "straight-line", etaMinutes: 0, etaAt: null, etaSummary: null, late: false,
        kind: "onsite", onSiteSince: "2026-11-13T14:48:00.000Z", onSiteSinceLabel: "On site since 8:48 AM", route: [],
      },
    });
    expect(html).toContain("On site since 8:48 AM");
    expect(html).toContain("Golf Road Auto Body");
    expect(html).not.toContain("Arrives");
  });

  it("shows drive time, straight-line distance, and a late ETA in red", () => {
    const html = truckCardHtml({
      ...base,
      nearestVisit: {
        jobId: "j12", title: "Warranty", customerName: "Elk Grove Precision Machining", address: "2250 Lunt Ave",
        startsAt: "2026-11-13T15:00:00.000Z", distanceMeters: 5544, distanceLabel: "3.4 mi",
        straightLineMeters: 4200, straightLineLabel: "2.6 mi", drivingDistanceMeters: 5544, drivingDistanceLabel: "3.4 mi",
        driveSource: "osrm", etaMinutes: 14, etaAt: "2026-11-13T15:38:00.000Z",
        etaSummary: "Arrives ~9:38 AM, 8 min late", late: true, kind: "enroute",
        onSiteSince: null, onSiteSinceLabel: null, route: [[42.03, -87.97], [42.00, -88.07]],
      },
    });
    expect(html).toContain("Next visit today");
    expect(html).toContain("3.4 mi · 14 min");
    expect(html).toContain("2.6 mi straight-line");
    expect(html).toContain("Arrives ~9:38 AM, 8 min late");
    expect(html).toContain("#b42318");
  });
});
