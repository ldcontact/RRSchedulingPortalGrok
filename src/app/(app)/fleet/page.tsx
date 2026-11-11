import type { Metadata } from "next";
import { requireFleetAccess } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { FleetPageClient } from "@/components/fleet/fleet-page-client";

export const metadata: Metadata = { title: "Fleet" };

export default async function FleetPage() {
  const user = await requireFleetAccess();
  const repo = await getRepo();
  const [team, mappings] = await Promise.all([repo.listTeam(), repo.listFleetVehicles()]);
  const assignable = team.filter((m) => m.profile_id && m.status === "active");
  return <FleetPageClient admin={user.role === "admin"} team={assignable} mappings={mappings} />;
}
