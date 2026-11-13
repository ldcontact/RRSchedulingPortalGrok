import { describe, expect, it } from "vitest";
import {
  canDeleteServiceRequestNote,
  canEditServiceRequestIssue,
  canEditServiceRequestNote,
  issueEditedHistoryBody,
  parseTicketIssue,
  parseTicketNoteBody,
  serviceRequestActorAvatarUrl,
} from "./service-request-notes";

describe("service request note permissions", () => {
  it("lets people edit their own notes, and lets admins edit any", () => {
    expect(canEditServiceRequestNote({ userId: "u-luke", role: "admin", authorId: "u-luke" })).toBe(true);
    expect(canEditServiceRequestNote({ userId: "u-maria", role: "manager", authorId: "u-maria" })).toBe(true);
    expect(canEditServiceRequestNote({ userId: "u-luke", role: "admin", authorId: "u-maria" })).toBe(true);
    expect(canEditServiceRequestNote({ userId: "u-maria", role: "manager", authorId: "u-luke" })).toBe(false);
    expect(canEditServiceRequestNote({ userId: "u-sales", role: "sales", authorId: "u-luke" })).toBe(false);
    expect(canEditServiceRequestNote({ userId: "u-tech1", role: "tech", authorId: "u-luke" })).toBe(false);
    expect(canEditServiceRequestNote({ userId: "u-luke", role: "admin", authorId: null })).toBe(false);
  });

  it("follows the delete rule for other people's notes; authors can still delete their own", () => {
    const base = { userId: "u-x", authorId: "u-maria" as const };
    expect(canDeleteServiceRequestNote({ ...base, userId: "u-maria", role: "manager", canDeleteFlag: false })).toBe(true);
    expect(canDeleteServiceRequestNote({ ...base, userId: "u-tech1", role: "tech", canDeleteFlag: false, authorId: "u-tech1" })).toBe(true);
    expect(canDeleteServiceRequestNote({ ...base, userId: "u-tech1", role: "tech", canDeleteFlag: false })).toBe(false);
    expect(canDeleteServiceRequestNote({ ...base, userId: "u-sales", role: "sales", canDeleteFlag: false })).toBe(false);
    expect(canDeleteServiceRequestNote({ ...base, userId: "u-luke", role: "admin", canDeleteFlag: false })).toBe(true);
    expect(canDeleteServiceRequestNote({ ...base, userId: "u-other", role: "manager", canDeleteFlag: false })).toBe(false);
    expect(canDeleteServiceRequestNote({ ...base, userId: "u-other", role: "manager", canDeleteFlag: true })).toBe(true);
    expect(canDeleteServiceRequestNote({ ...base, userId: "u-luke", role: "admin", canDeleteFlag: false, authorId: null })).toBe(false);
  });
});

describe("service request issue permissions", () => {
  it("lets admins, managers, and the ticket creator edit the issue", () => {
    expect(canEditServiceRequestIssue({ userId: "u-luke", role: "admin", createdBy: "u-maria" })).toBe(true);
    expect(canEditServiceRequestIssue({ userId: "u-maria", role: "manager", createdBy: "u-luke" })).toBe(true);
    expect(canEditServiceRequestIssue({ userId: "u-maya", role: "sales", createdBy: "u-maya" })).toBe(true);
    expect(canEditServiceRequestIssue({ userId: "u-maya", role: "sales", createdBy: "u-luke" })).toBe(false);
    expect(canEditServiceRequestIssue({ userId: "u-tech1", role: "tech", createdBy: "u-luke" })).toBe(false);
  });
});

describe("service request note and issue validation", () => {
  it("rejects blank notes and trims/caps the body", () => {
    expect(parseTicketNoteBody("   ")).toEqual({ ok: false, error: "Write a note first." });
    expect(parseTicketNoteBody("  Called Tony.  ")).toEqual({ ok: true, body: "Called Tony." });
    expect(parseTicketNoteBody("x".repeat(5001)).ok).toBe(true);
    expect((parseTicketNoteBody("x".repeat(5001)) as { body: string }).body).toHaveLength(5000);
  });

  it("requires a summary and trims/caps issue fields", () => {
    expect(parseTicketIssue("  ", "details")).toEqual({
      ok: false, error: "Add a short summary, e.g. “Hallway lamp out”.",
    });
    expect(parseTicketIssue("  Fix lights basement  ", "  3x 2x4x4 being ballasts  ")).toEqual({
      ok: true, summary: "Fix lights basement", description: "3x 2x4x4 being ballasts",
    });
    expect((parseTicketIssue("s".repeat(250), "d".repeat(6000)) as { summary: string; description: string }).summary).toHaveLength(200);
    expect((parseTicketIssue("s".repeat(250), "d".repeat(6000)) as { summary: string; description: string }).description).toHaveLength(5000);
  });

  it("names the new title in history when the summary changes", () => {
    expect(issueEditedHistoryBody("Old", "Fix lights basement")).toBe('Issue edited: “Fix lights basement”.');
    expect(issueEditedHistoryBody("Same", "Same")).toBe("Issue edited.");
  });
});

describe("service request actor avatar mapping", () => {
  it("uses the Google photo when that is the chosen source", () => {
    expect(serviceRequestActorAvatarUrl({
      avatar_source: "google",
      avatar_path: null,
      google_avatar_url: "/api/mock-photo/seed/avatar/Luke%20Dlugosz.svg",
    })).toBe("/api/mock-photo/seed/avatar/Luke%20Dlugosz.svg");
  });

  it("uses the signed upload URL for an uploaded photo, and initials when none is available", () => {
    expect(serviceRequestActorAvatarUrl({
      avatar_source: "upload",
      avatar_path: "seed/avatar/Maria%20Santos.svg",
      google_avatar_url: null,
    }, "/api/mock-photo/seed/avatar/Maria%20Santos.svg")).toBe("/api/mock-photo/seed/avatar/Maria%20Santos.svg");
    expect(serviceRequestActorAvatarUrl({
      avatar_source: "upload",
      avatar_path: "abc.jpg",
      google_avatar_url: "https://example.com/unused.jpg",
    })).toBeNull();
    expect(serviceRequestActorAvatarUrl({ avatar_source: "none", avatar_path: null, google_avatar_url: "https://example.com/x.jpg" })).toBeNull();
    expect(serviceRequestActorAvatarUrl(null)).toBeNull();
  });
});
