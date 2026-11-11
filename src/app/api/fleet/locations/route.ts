import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { fleetLocationsAuth } from "@/lib/geotab/access";
import { buildFleetLocations } from "@/lib/geotab/locations";
import { addDays, todayKey, zonedToUtc } from "@/lib/time";
import type { FleetPerson } from "@/lib/geotab/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const repo = await getRepo();
  const mappings = await repo.listFleetVehicles().catch(() => []);
  const authz = fleetLocationsAuth(user, mappings);
  if (authz.status !== 200) {
    const error = authz.status === 401
      ? "Sign in required"
      : authz.reason === "no_truck"
        ? "No truck is mapped to your profile"
        : "Fleet access required";
    return NextResponse.json({ error }, { status: authz.status });
  }

  const T = todayKey();
  const [jobs, team] = await Promise.all([
    repo.listJobs({ from: zonedToUtc(T, 0), to: zonedToUtc(addDays(T, 1), 0) }).catch(() => []),
    repo.listTeam().catch(() => []),
  ]);
  const people: FleetPerson[] = team
    .filter((m) => m.profile_id)
    .map((m) => ({ id: m.profile_id!, full_name: m.full_name, color: m.color, avatar_url: m.avatar_url ?? null }));

  const body = await buildFleetLocations({
    mappings,
    people,
    jobs,
    scope: authz.scope,
    viewerId: user.id,
  });
  return NextResponse.json(body);
}
