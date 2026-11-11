import { describe, expect, it, vi } from "vitest";
import type { Repo } from "@/lib/data/repo";
import { buildMcpHandler } from "./server";

const rpc = (body: object) =>
  new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  });
async function json(res: Response) {
  const text = await res.text();
  const data = text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data:"))!.slice(5);
  return JSON.parse(data);
}

describe("MCP handler (Streamable HTTP)", () => {
  const user = { id: "00000000-0000-4000-8000-000000000001", email: "luke@example.com", name: "Luke", role: "admin" as const, color: "#000", active: true, fleet_access: false, can_delete: false };
  const handler = buildMcpHandler(async () => ({ user, repo: { counts: vi.fn() } as unknown as Repo, portal: "https://portal.test" }));

  it("lists exactly the 13 read-only Phase 1 tools", async () => {
    const res = await handler(rpc({ method: "tools/list", params: {} }));
    const { result } = await json(res);
    const names = result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual(["get_customer", "get_job", "get_overview", "get_project", "get_schedule", "get_session", "list_messages", "list_notes", "list_photos", "list_team", "search_customers", "search_jobs", "search_projects"]);
    for (const t of result.tools) expect(t.annotations.readOnlyHint).toBe(true);
    expect(result.tools.find((t: { name: string }) => t.name === "search_jobs").inputSchema.properties).toHaveProperty("from");
  });

  it("calls a tool as the verified user", async () => {
    const res = await handler(rpc({ method: "tools/call", params: { name: "get_session", arguments: {} } }));
    const { result } = await json(res);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ email: "luke@example.com", role: "admin" });
  });
});
