import { describe, expect, it } from "vitest";
import { sortMembers } from "./team-sort";
import type { TeamMember } from "./types";

const member = (full_name: string, extras: Partial<TeamMember> = {}): TeamMember => ({
  email: extras.email ?? `${full_name.replace(/\s+/g, ".").toLowerCase()}@example.com`,
  full_name,
  role: extras.role ?? "tech",
  title: extras.title ?? null,
  phone: extras.phone ?? null,
  color: extras.color ?? "#0891b2",
  profile_id: extras.profile_id ?? null,
  status: extras.status ?? "active",
  invited_at: extras.invited_at ?? null,
  avatar_source: extras.avatar_source ?? "none",
  avatar_path: extras.avatar_path ?? null,
  google_avatar_url: extras.google_avatar_url ?? null,
  avatar_url: extras.avatar_url ?? null,
  fleet_access: extras.fleet_access ?? false,
  can_delete: extras.can_delete ?? false,
  sms_notify_assignment: extras.sms_notify_assignment ?? false,
  sms_notify_same_day: extras.sms_notify_same_day ?? false,
  sms_notify_morning: extras.sms_notify_morning ?? false,
  sms_stopped_at: extras.sms_stopped_at ?? null,
});

describe("sortMembers", () => {
  it("sorts the team list A–Z by display name, case-insensitively, including invited people", () => {
    const team = [
      member("zoe hart", { role: "admin", status: "active" }),
      member("Sam Ortiz", { role: "tech", status: "invited" }),
      member("ann cole", { role: "manager", status: "active" }),
      member("BOB LEE", { role: "sales", status: "inactive" }),
    ];
    expect(sortMembers(team, "name", "asc").map((m) => m.full_name)).toEqual([
      "ann cole",
      "BOB LEE",
      "Sam Ortiz",
      "zoe hart",
    ]);
  });

  it("keeps invited people in the same A–Z list rather than a separate bucket when sorting by name", () => {
    const team = [
      member("Carlos Mendez", { status: "active" }),
      member("Kevin Bradford", { role: "manager", status: "invited" }),
      member("Andre Williams", { status: "active" }),
    ];
    expect(sortMembers(team, "name", "asc").map((m) => m.full_name)).toEqual([
      "Andre Williams",
      "Carlos Mendez",
      "Kevin Bradford",
    ]);
  });
});
