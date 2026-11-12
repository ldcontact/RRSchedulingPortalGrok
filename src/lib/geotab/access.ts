/** Who can use Fleet: an admin, or any member an admin has granted fleet_access. */
export type FleetActor = { id?: string; role: "admin" | "manager" | "sales" | "tech" | null; fleet_access?: boolean | null };

export function hasFleetAccess(user: FleetActor | null | undefined): boolean {
  if (!user?.role) return false;
  return user.role === "admin" || !!user.fleet_access;
}

/** Admins and managers with access see the whole fleet; techs with access see only their mapped truck. */
export function fleetScope(user: FleetActor | null | undefined): "all" | "own" | "none" {
  if (!hasFleetAccess(user)) return "none";
  if (user!.role === "admin" || user!.role === "manager") return "all";
  return "own";
}

export type FleetMappingRef = { profile_id: string | null };
export type FleetLocationsAuth =
  | { status: 401 }
  | { status: 403; reason: "denied" | "no_truck" }
  | { status: 200; scope: "all" | "own" };

/**
 * Server-side gate for GET /api/fleet/locations.
 * A tech with access but no mapped truck is 403 — they cannot poll the whole fleet.
 */
export function fleetLocationsAuth(user: FleetActor | null | undefined, mappings: FleetMappingRef[]): FleetLocationsAuth {
  if (!user?.role) return { status: 401 };
  const scope = fleetScope(user);
  if (scope === "none") return { status: 403, reason: "denied" };
  if (scope === "own" && !mappings.some((m) => m.profile_id === user.id)) {
    return { status: 403, reason: "no_truck" };
  }
  return { status: 200, scope };
}
