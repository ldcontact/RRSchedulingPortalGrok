import type { Metadata } from "next";
import { Suspense } from "react";
import { requireFleetAccess } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { FleetPageClient } from "@/components/fleet/fleet-page-client";
import { fleetAssignable } from "@/lib/geotab/assign";

export const metadata: Metadata = { title: "Fleet" };

export default async function FleetPage() {
  const user = await requireFleetAccess();
  const repo = await getRepo();
  const [team, mappings] = await Promise.all([repo.listTeam(), repo.listFleetVehicles()]);
  const assignable = fleetAssignable(team);
  return <Suspense fallback={<div data-testid="fleet-page" className="text-sm text-muted">Loading fleet…</div>}><FleetPageClient admin={user.role === "admin"} team={assignable} mappings={mappings} /></Suspense>;
}
