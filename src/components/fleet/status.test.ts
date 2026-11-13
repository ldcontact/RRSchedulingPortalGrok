import { describe, expect, it } from "vitest";
import type { FleetVehicle } from "@/lib/geotab/types";
import { driverLabel, mappedCrewVehicles } from "./status";

const base: FleetVehicle = {
  id: "gt-t1",
  name: "Truck 1",
  label: null,
  status: "stopped",
  speedMph: 0,
  latitude: 42,
  longitude: -88,
  heading: 0,
  lastUpdate: "2026-11-13T15:24:00.000Z",
  isDeviceCommunicating: true,
  stoppedForLabel: "5 min",
  parkedSince: null,
  geotabDriverName: null,
  profile: null,
  nearestVisit: null,
};

describe("driverLabel", () => {
  it("shows Unassigned when nothing is mapped", () => {
    expect(driverLabel(base)).toBe("Unassigned");
  });

  it("appends (invited) for an invite mapping", () => {
    expect(driverLabel({
      ...base,
      profile: { id: "invite:sam.ortiz@gmail.com", full_name: "Sam Ortiz", color: "#0891b2", invited: true, email: "sam.ortiz@gmail.com" },
    })).toBe("Sam Ortiz (invited)");
  });

  it("uses the signed-in member's name without a tag", () => {
    expect(driverLabel({
      ...base,
      profile: { id: "u-tech1", full_name: "Carlos Mendez", color: "#ea580c" },
    })).toBe("Carlos Mendez");
  });
});

describe("mappedCrewVehicles", () => {
  it("lists profile and invite mappings, driving first, then by name", () => {
    const sam: FleetVehicle = {
      ...base,
      id: "gt-v5",
      name: "Van 5",
      status: "driving",
      profile: { id: "invite:sam.ortiz@gmail.com", full_name: "Sam Ortiz", color: "#0891b2", invited: true, email: "sam.ortiz@gmail.com" },
    };
    const carlos: FleetVehicle = {
      ...base,
      id: "gt-t1",
      status: "driving",
      profile: { id: "u-tech1", full_name: "Carlos Mendez", color: "#ea580c" },
    };
    const emily: FleetVehicle = {
      ...base,
      id: "gt-t2",
      status: "stopped",
      profile: { id: "u-tech4", full_name: "Emily Chen", color: "#16a34a" },
    };
    const unmapped: FleetVehicle = { ...base, id: "gt-k", name: "Kenny White Van", profile: null };
    expect(mappedCrewVehicles([emily, unmapped, sam, carlos]).map((v) => v.id)).toEqual(["gt-t1", "gt-v5", "gt-t2"]);
  });
});
