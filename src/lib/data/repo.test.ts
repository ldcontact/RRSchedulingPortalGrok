import { describe, expect, it } from "vitest";
import { mergeTeam } from "./repo";
import type { Profile } from "@/lib/types";

const inviteBase = {
  email: "mario@squarepropertyservices.com",
  role: "manager" as const,
  full_name: "Mariusz Bartnik",
  title: "Sales Representative",
  phone: null,
  color: "#b45309",
  avatar_source: "none" as const,
  avatar_path: null,
  invited_at: "2026-11-13T15:06:46Z",
  accepted_at: null,
};

describe("mergeTeam invite permission flags", () => {
  it("copies fleet_access and can_delete from an invite with no profile", () => {
    const team = mergeTeam([], [{ ...inviteBase, fleet_access: true, can_delete: true }]);
    expect(team).toHaveLength(1);
    expect(team[0].status).toBe("invited");
    expect(team[0].profile_id).toBeNull();
    expect(team[0].role).toBe("manager");
    expect(team[0].fleet_access).toBe(true);
    expect(team[0].can_delete).toBe(true);
  });

  it("defaults invite flags to false when they are missing", () => {
    const team = mergeTeam([], [inviteBase]);
    expect(team[0].fleet_access).toBe(false);
    expect(team[0].can_delete).toBe(false);
  });

  it("prefers live profile flags once the member has signed in", () => {
    const profile = {
      id: "u-mariusz",
      email: inviteBase.email,
      full_name: inviteBase.full_name,
      phone: null,
      title: inviteBase.title,
      color: inviteBase.color,
      role: "manager" as const,
      active: true,
      avatar_source: "none" as const,
      avatar_path: null,
      google_avatar_url: null,
      fleet_access: false,
      can_delete: true,
      sms_notify_assignment: false,
      sms_notify_same_day: false,
      sms_notify_morning: false,
      sms_stopped_at: null,
    } satisfies Profile;
    const team = mergeTeam([profile], [{ ...inviteBase, accepted_at: "2026-11-13T16:00:00Z", fleet_access: true, can_delete: false }]);
    expect(team).toHaveLength(1);
    expect(team[0].status).toBe("active");
    expect(team[0].profile_id).toBe("u-mariusz");
    expect(team[0].fleet_access).toBe(false);
    expect(team[0].can_delete).toBe(true);
  });
});
