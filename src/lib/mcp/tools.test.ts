import { describe, expect, it, vi } from "vitest";
import type { Repo } from "@/lib/data/repo";
import type { JobView, Photo, PhotoRequirement, Project, Role, SessionUser, TeamMember } from "@/lib/types";
import { callTool, type ToolContext, type ToolName } from "./tools";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = U(1), MANAGER = U(2), TECH = U(3), OTHER_TECH = U(4), PROJECT = U(10), CUSTOMER = U(20), JOB = U(30), JOB2 = U(31);
const PORTAL = "https://portal.test";

const user = (id: string, role: Role | null): SessionUser => ({ id, email: `${role ?? "nobody"}@example.com`, name: `${role ?? "Nobody"} User`, role, color: "#000", active: true });

const job = (over: Partial<JobView> = {}): JobView => ({
  id: JOB, project_id: PROJECT, title: "Install LEDs", starts_at: "2026-11-10T14:00:00.000Z", ends_at: "2026-11-10T16:00:00.000Z", status: "scheduled",
  instructions: "Use the back door", started_at: null, completed_at: null, completed_by: null, approved_at: null, approved_by: null, review_note: null,
  project_name: "Lakeview LEDs", project_type: "lighting", customer_id: CUSTOMER, customer_name: "Lakeview Dental", address: "1 Main St Chicago, IL 60601",
  assignees: [{ id: TECH, full_name: "Carlos Tech", color: "#111" }], ...over,
});
const project: Project = {
  id: PROJECT, customer_id: CUSTOMER, name: "Lakeview LEDs", type: "lighting", status: "scheduled", scope: "Swap 40 troffers", value: 12000, est_rebate: 6000,
  timeline_sent_at: null, timeline_sent_via: null, timeline_approved_at: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z",
};
const req: PhotoRequirement = { id: U(40), project_id: PROJECT, label: "Panel", note: null, sort_order: 0, created_at: "2026-10-01T00:00:00Z" };
const photo = (over: Partial<Photo>): Photo => ({
  id: U(50), project_id: PROJECT, job_id: JOB, kind: "completion", storage_path: "p/x.jpg", caption: null, requirement_id: req.id,
  uploaded_by: TECH, uploader_name: "Carlos Tech", uploader_color: "#111", created_at: "2026-11-10T15:00:00Z", url: "https://signed.example/x", ...over,
});
const team: TeamMember[] = [
  { email: "a@x.com", full_name: "Admin", role: "admin", title: null, phone: null, color: "#000", profile_id: ADMIN, status: "active", invited_at: null, avatar_source: "none", avatar_path: null, google_avatar_url: null },
  { email: "new@x.com", full_name: "Invitee", role: "tech", title: null, phone: null, color: "#000", profile_id: null, status: "invited", invited_at: "2026-11-01T00:00:00Z", avatar_source: "none", avatar_path: null, google_avatar_url: null },
];

function fakeRepo(over: Partial<Repo> = {}) {
  const r = {
    pageCustomers: vi.fn(async () => ({ items: [{ id: CUSTOMER, name: "Lakeview Dental", phone: "555", email: "o@x.com", address: "1 Main St", city: "Chicago", state: "IL", zip: "60601", tags: ["ComEd"], primary_contact: "Priya" }], total: 51, page: 1, size: 50 })),
    getCustomer: vi.fn(async () => null),
    listContacts: vi.fn(async () => [{ id: U(60), customer_id: CUSTOMER, name: "Janet", title: "Office Manager", phone: "555-1", email: "j@x.com", is_primary: true }]),
    listProjects: vi.fn(async () => []),
    listMessages: vi.fn(async () => []),
    listTeam: vi.fn(async () => team),
    counts: vi.fn(async () => ({ customers: 1, team: 1, invited: 1, activeProjects: 1, jobsToday: 1, awaitingReview: 0, proposed: 0 })),
    getProject: vi.fn(async () => project),
    listMilestones: vi.fn(async () => []),
    listJobs: vi.fn(async () => [job()]),
    getJob: vi.fn(async () => job()),
    listAssignable: vi.fn(async () => []),
    listPhotos: vi.fn(async (f: { kind?: string }) => (f.kind === "before" ? [photo({ id: U(51), kind: "before", requirement_id: null, job_id: null })] : [photo({})])),
    listPhotoRequirements: vi.fn(async () => [req, { ...req, id: U(41), label: "Fixtures" }]),
    listNotes: vi.fn(async () => []),
    ...over,
  };
  return r as typeof r & Repo;
}

async function run(name: ToolName, u: SessionUser, args: unknown = {}, repo = fakeRepo()) {
  const ctx: ToolContext = { user: u, repo, portal: PORTAL };
  const res = await callTool(name, ctx, args);
  const text = res.content[0].text;
  return { res, text, data: res.isError ? null : JSON.parse(text), repo };
}

describe("get_session", () => {
  it("returns the signed-in person and role", async () => {
    const { data } = await run("get_session", user(TECH, "tech"));
    expect(data).toMatchObject({ email: "tech@example.com", role: "tech", role_label: "Field Tech", on_team: true, time_zone: "America/Chicago", portal: PORTAL });
  });
  it("works for someone not on the team, but other tools refuse", async () => {
    expect((await run("get_session", user(U(9), null))).data.on_team).toBe(false);
    const { res, text } = await run("get_overview", user(U(9), null));
    expect(res.isError).toBe(true);
    expect(text).toMatch(/isn't on the RR Scheduler team/);
  });
});

describe("role gating", () => {
  const staffOnly: [ToolName, object][] = [
    ["search_customers", {}], ["get_customer", { customer_id: CUSTOMER }], ["search_projects", {}], ["list_team", {}], ["list_messages", { customer_id: CUSTOMER }],
  ];
  it.each(staffOnly)("%s is refused for techs without touching the repo", async (name, args) => {
    const repo = fakeRepo();
    const { res, text } = await run(name, user(TECH, "tech"), args, repo);
    expect(res.isError).toBe(true);
    expect(text).toMatch(/Admin and Manager accounts only/);
    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
  });
  it("list_team hides pending invites from managers but not admins", async () => {
    expect((await run("list_team", user(MANAGER, "manager"))).data.members.map((m: { status: string }) => m.status)).toEqual(["active"]);
    expect((await run("list_team", user(ADMIN, "admin"))).data.members).toHaveLength(2);
  });
  it("get_job: techs only see visits assigned to them", async () => {
    const repo = fakeRepo({ getJob: vi.fn(async () => job({ assignees: [{ id: OTHER_TECH, full_name: "Jake", color: "#222" }] })) });
    const { res, text } = await run("get_job", user(TECH, "tech"), { job_id: JOB }, repo);
    expect(res.isError).toBe(true);
    expect(text).toMatch(/isn't assigned to you/);
    expect(repo.listNotes).not.toHaveBeenCalled();
  });
  it("get_project for a tech: assigned only, no money and no message log", async () => {
    const repo = fakeRepo();
    const { data } = await run("get_project", user(TECH, "tech"), { project_id: PROJECT }, repo);
    expect(data.name).toBe("Lakeview LEDs");
    expect(data).not.toHaveProperty("value");
    expect(data).not.toHaveProperty("messages");
    expect(repo.listMessages).not.toHaveBeenCalled();
    const denied = await run("get_project", user(OTHER_TECH, "tech"), { project_id: PROJECT });
    expect(denied.res.isError).toBe(true);
  });
  it("get_project for staff includes value, rebate, messages and a portal link", async () => {
    const { data } = await run("get_project", user(MANAGER, "manager"), { project_id: PROJECT });
    expect(data).toMatchObject({ value: 12000, est_rebate: 6000, link: `${PORTAL}/projects/${PROJECT}`, messages: { total: 0 } });
    expect(data.before_photos.count).toBe(1);
    expect(data.before_photos.items[0]).not.toHaveProperty("url");
  });
});

describe("search_jobs bounds", () => {
  it.each([
    [{}, /date window .* or a project_id is required/],
    [{ from: "2026-11-01" }, /both from and to/],
    [{ from: "2026-01-01", to: "2026-12-31" }, /too long/],
    [{ from: "2026-11-10", to: "2026-11-01" }, /on or after/],
    [{ from: "2026-11-1", to: "2026-11-02" }, /Invalid input/],
  ])("rejects %j without querying", async (args, msg) => {
    const repo = fakeRepo();
    const { res, text } = await run("search_jobs", user(ADMIN, "admin"), args, repo);
    expect(res.isError).toBe(true);
    expect(text).toMatch(msg);
    expect(repo.listJobs).not.toHaveBeenCalled();
  });
  it("maps a Chicago day window to UTC and the portal's status names", async () => {
    const repo = fakeRepo();
    const { data } = await run("search_jobs", user(ADMIN, "admin"), { from: "2026-11-02", to: "2026-11-08", status: ["awaiting_review", "approved"] }, repo);
    expect(repo.listJobs).toHaveBeenCalledWith({ from: "2026-11-02T06:00:00.000Z", to: "2026-11-09T06:00:00.000Z", projectId: undefined, assignee: undefined, status: ["completed", "approved"] });
    expect(data.visits[0]).toMatchObject({ id: JOB, status: "scheduled", day: "2026-11-10", link: `${PORTAL}/jobs/${JOB}` });
  });
  it("accepts a project bound alone, and limits techs to their own visits", async () => {
    const repo = fakeRepo({ listJobs: vi.fn(async () => [job(), job({ id: JOB2, assignees: [{ id: OTHER_TECH, full_name: "Jake", color: "#222" }] })]) });
    const { data } = await run("search_jobs", user(TECH, "tech"), { project_id: PROJECT }, repo);
    expect(data.visits.map((v: { id: string }) => v.id)).toEqual([JOB]);
  });
});

describe("search and get tools", () => {
  it("search_customers: one page of 50 with sort mapping and links", async () => {
    const repo = fakeRepo();
    const { data } = await run("search_customers", user(MANAGER, "manager"), { query: "dental", sort: "name_desc", page: 1 }, repo);
    expect(repo.pageCustomers).toHaveBeenCalledWith({ q: "dental", page: 1, size: 50, sort: "name_desc" });
    expect(data).toMatchObject({ total: 51, pages: 2, page_size: 50, link: `${PORTAL}/customers?q=dental&sort=name_desc` });
    expect(data.customers[0]).toMatchObject({ name: "Lakeview Dental", address: "1 Main St Chicago, IL 60601", contact: "Priya", tags: ["ComEd"], link: `${PORTAL}/customers/${CUSTOMER}` });
  });
  it("get_customer: not found is a clear message", async () => {
    const { res, text } = await run("get_customer", user(ADMIN, "admin"), { customer_id: CUSTOMER });
    expect(res.isError).toBe(true);
    expect(text).toBe("Customer not found.");
  });
  it("rejects ids that are not UUIDs", async () => {
    const { res, text } = await run("get_job", user(ADMIN, "admin"), { job_id: "1) or (1=1" });
    expect(res.isError).toBe(true);
    expect(text).toMatch(/must be a UUID/);
  });
  it("get_job: assigned tech gets contact, crew, required-photo progress and photo metadata", async () => {
    const { data } = await run("get_job", user(TECH, "tech"), { job_id: JOB });
    expect(data).toMatchObject({
      id: JOB, customer: "Lakeview Dental", on_site_contact: { name: "Janet", phone: "555-1" }, crew: [{ id: TECH, name: "Carlos Tech" }],
      instructions: "Use the back door", scope: "Swap 40 troffers", required_photos: { done: 1, total: 2, missing: ["Fixtures"] }, link: `${PORTAL}/jobs/${JOB}`,
    });
    expect(data.completion_photos.items[0]).toMatchObject({ requirement: "Panel", uploaded_by: "Carlos Tech" });
  });
  it("list_photos returns signed URLs from existing photo rows only", async () => {
    const { data } = await run("list_photos", user(ADMIN, "admin"), { job_id: JOB });
    expect(data).toMatchObject({ total: 1, url_expires_in_seconds: 3600 });
    expect(data.photos[0]).toMatchObject({ kind: "completion", url: "https://signed.example/x", requirement: "Panel" });
  });
  it("hides unexpected errors behind a generic message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = fakeRepo({ counts: vi.fn(async () => { throw new Error("db exploded"); }) });
    const { res, text } = await run("get_overview", user(ADMIN, "admin"), {}, repo);
    expect(res.isError).toBe(true);
    expect(text).not.toMatch(/exploded/);
    spy.mockRestore();
  });
});
