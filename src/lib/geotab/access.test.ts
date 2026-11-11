import { describe, expect, it } from "vitest";
import { fleetScope, hasFleetAccess } from "./access";

describe("hasFleetAccess", () => {
  it("grants admins access even when the flag is off", () => {
    expect(hasFleetAccess({ role: "admin", fleet_access: false })).toBe(true);
    expect(hasFleetAccess({ role: "admin", fleet_access: true })).toBe(true);
  });
  it("requires the flag for managers and techs", () => {
    expect(hasFleetAccess({ role: "manager", fleet_access: false })).toBe(false);
    expect(hasFleetAccess({ role: "manager", fleet_access: true })).toBe(true);
    expect(hasFleetAccess({ role: "tech", fleet_access: false })).toBe(false);
    expect(hasFleetAccess({ role: "tech", fleet_access: true })).toBe(true);
  });
  it("denies signed-in users with no role, even if a stale flag is set", () => {
    expect(hasFleetAccess({ role: null, fleet_access: true })).toBe(false);
    expect(hasFleetAccess(null)).toBe(false);
  });
});

describe("fleetScope", () => {
  it("is all for admins and for managers with access", () => {
    expect(fleetScope({ role: "admin", fleet_access: false })).toBe("all");
    expect(fleetScope({ role: "manager", fleet_access: true })).toBe("all");
  });
  it("is own for techs with access and none otherwise", () => {
    expect(fleetScope({ role: "tech", fleet_access: true })).toBe("own");
    expect(fleetScope({ role: "manager", fleet_access: false })).toBe("none");
    expect(fleetScope({ role: "tech", fleet_access: false })).toBe("none");
  });
});


import { fleetLocationsAuth } from "./access";

describe("fleetLocationsAuth", () => {
  const mappings = [{ profile_id: "u-tech1" }, { profile_id: "u-tech4" }, { profile_id: null }];
  it("is 401 when there is no signed-in member", () => {
    expect(fleetLocationsAuth(null, mappings)).toEqual({ status: 401 });
    expect(fleetLocationsAuth({ role: null, fleet_access: true }, mappings)).toEqual({ status: 401 });
  });
  it("is 403 for managers and techs without the flag", () => {
    expect(fleetLocationsAuth({ id: "u-manager", role: "manager", fleet_access: false }, mappings)).toEqual({ status: 403, reason: "denied" });
    expect(fleetLocationsAuth({ id: "u-tech1", role: "tech", fleet_access: false }, mappings)).toEqual({ status: 403, reason: "denied" });
  });
  it("is 403 for a tech with access but no mapped truck", () => {
    expect(fleetLocationsAuth({ id: "u-tech3", role: "tech", fleet_access: true }, [{ profile_id: "u-tech1" }])).toEqual({ status: 403, reason: "no_truck" });
  });
  it("allows admins, managers with the flag, and techs with a mapped truck", () => {
    expect(fleetLocationsAuth({ id: "u-admin", role: "admin", fleet_access: false }, mappings)).toEqual({ status: 200, scope: "all" });
    expect(fleetLocationsAuth({ id: "u-manager", role: "manager", fleet_access: true }, mappings)).toEqual({ status: 200, scope: "all" });
    expect(fleetLocationsAuth({ id: "u-tech1", role: "tech", fleet_access: true }, mappings)).toEqual({ status: 200, scope: "own" });
  });
});
