import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/env";
import { addDays, todayKey, zonedToUtc } from "@/lib/time";
import { runTeamSmsCron, type MorningVisitForMember } from "@/lib/team-sms/flush";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const alt = req.headers.get("x-cron-secret")?.trim() ?? "";
  if (secret && (bearer === secret || alt === secret)) return true;
  // Local mock previews only. Production always requires CRON_SECRET.
  if (MOCK_MODE && !secret) return true;
  return false;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (MOCK_MODE) {
    const { mockTeamSmsStore, mockTodayVisitLines } = await import("@/lib/data/mock-repo");
    const result = await runTeamSmsCron(mockTeamSmsStore(), mockTodayVisitLines());
    return NextResponse.json({ ok: true, mock: true, ...result });
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { supabaseTeamSmsStore } = await import("@/lib/team-sms/supabase-adapter");
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role is not configured." }, { status: 500 });

  const start = zonedToUtc(todayKey(), 0);
  const end = zonedToUtc(addDays(todayKey(), 1), 0);
  const { data, error } = await admin
    .from("jobs")
    .select("id, starts_at, status, job_assignments(profile_id), projects!inner(customers(address, city))")
    .gte("starts_at", start)
    .lt("starts_at", end)
    .neq("status", "cancelled");
  if (error) return NextResponse.json({ error: "Could not load today's visits." }, { status: 500 });

  type Row = {
    starts_at: string;
    job_assignments: { profile_id: string }[] | { profile_id: string } | null;
    projects: { customers: { address: string | null; city: string | null } | { address: string | null; city: string | null }[] | null } | { customers: { address: string | null; city: string | null } | null }[] | null;
  };
  const visits: MorningVisitForMember[] = [];
  for (const row of ((data ?? []) as unknown as Row[])) {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    const customer = project?.customers;
    const c = Array.isArray(customer) ? customer[0] : customer;
    const assignees = Array.isArray(row.job_assignments) ? row.job_assignments : row.job_assignments ? [row.job_assignments] : [];
    for (const a of assignees) {
      visits.push({ profileId: a.profile_id, startsAt: row.starts_at, address: c?.address, city: c?.city });
    }
  }

  const result = await runTeamSmsCron(supabaseTeamSmsStore(admin), visits);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  return GET(req);
}
