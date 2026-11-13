import { describe, expect, it } from "vitest";
import {
  fleetAssignable,
  fleetAssigneeOptionLabel,
  fleetAssigneeOptionValue,
  fleetPeopleFromTeam,
  parseFleetAssignee,
  selectedFleetAssigneeValue,
} from "./assign";
import type { TeamMember } from "@/lib/types";

const member = (partial: Partial<TeamMember> & Pick<TeamMember, "email" | "full_name" | "status" | "profile_id">): TeamMember => ({
  role: "sales",
  title: null,
  phone: null,
  color: "#0e7490",
  invited_at: null,
  avatar_source: "none",
  avatar_path: null,
  google_avatar_url: null,
  fleet_access: false,
  can_delete: false,
  sms_notify_assignment: false,
  sms_notify_same_day: false,
  sms_notify_morning: false,
  sms_stopped_at: null,
  ...partial,
});

const ronan = member({
  email: "ronan@squarepropertyservices.com",
  full_name: "Ronan O'Connor",
  status: "invited",
  profile_id: null,
  role: "sales",
  invited_at: "2026-11-13T15:06:46Z",
});
const mariusz = member({
  email: "mario@squarepropertyservices.com",
  full_name: "Mariusz Bartnik",
  status: "invited",
  profile_id: null,
  role: "manager",
  invited_at: "2026-11-13T15:06:46Z",
});
const carlos = member({
  email: "carlos.mendez@yahoo.com",
  full_name: "Carlos Mendez",
  status: "active",
  profile_id: "u-tech1",
  role: "tech",
});
const suspended = member({
  email: "jake.sullivan@gmail.com",
  full_name: "Jake Sullivan",
  status: "inactive",
  profile_id: "u-tech2",
  role: "tech",
});

describe("fleetAssignable", () => {
  it("includes invited members and active profiles, but not suspended people", () => {
    const list = fleetAssignable([ronan, mariusz, carlos, suspended]);
    expect(list.map((m) => m.full_name)).toEqual(["Ronan O'Connor", "Mariusz Bartnik", "Carlos Mendez"]);
  });
});

describe("fleet assignee form values", () => {
  it("marks invited people and stores them against the invite email", () => {
    expect(fleetAssigneeOptionLabel(ronan)).toBe("Ronan O'Connor (invited)");
    expect(fleetAssigneeOptionLabel(carlos)).toBe("Carlos Mendez");
    expect(fleetAssigneeOptionValue(ronan)).toBe("invite:ronan@squarepropertyservices.com");
    expect(fleetAssigneeOptionValue(carlos)).toBe("u-tech1");
    expect(parseFleetAssignee("invite:mario@squarepropertyservices.com")).toEqual({
      profile_id: null,
      invite_email: "mario@squarepropertyservices.com",
    });
    expect(parseFleetAssignee("u-tech1")).toEqual({ profile_id: "u-tech1", invite_email: null });
    expect(parseFleetAssignee("")).toEqual({ profile_id: null, invite_email: null });
  });

  it("selects a stored invite assignment in the picker", () => {
    expect(selectedFleetAssigneeValue({ profile_id: null, invite_email: "mario@squarepropertyservices.com" })).toBe(
      "invite:mario@squarepropertyservices.com",
    );
    expect(selectedFleetAssigneeValue({ profile_id: "u-tech1", invite_email: null })).toBe("u-tech1");
  });
});

describe("fleetPeopleFromTeam", () => {
  it("includes invited people and active profiles for vehicle mapping", () => {
    const people = fleetPeopleFromTeam([ronan, mariusz, carlos, suspended]);
    expect(people).toEqual([
      expect.objectContaining({ id: "invite:ronan@squarepropertyservices.com", full_name: "Ronan O'Connor", invited: true, email: "ronan@squarepropertyservices.com" }),
      expect.objectContaining({ id: "invite:mario@squarepropertyservices.com", full_name: "Mariusz Bartnik", invited: true, email: "mario@squarepropertyservices.com" }),
      expect.objectContaining({ id: "u-tech1", full_name: "Carlos Mendez", invited: false }),
      expect.objectContaining({ id: "u-tech2", full_name: "Jake Sullivan", invited: false }),
    ]);
  });
});
