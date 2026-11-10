import { createMcpHandler } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { callTool, TOOLS, type ToolContext, type ToolName } from "./tools";

/** The MCP request handler with all Phase 1 tools; `context` turns the verified bearer into user + repo. */
export function buildMcpHandler(context: (auth: AuthInfo | undefined) => Promise<ToolContext | null>) {
  return createMcpHandler(
    (server) => {
      for (const name of Object.keys(TOOLS) as ToolName[]) {
        const t = TOOLS[name];
        const input = t.input as z.ZodObject; // one generic registration loop for all tools
        server.registerTool(
          name,
          { title: t.title, description: t.description, inputSchema: input, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
          async (args, ctx) => {
            const c = await context(ctx.http?.authInfo);
            if (!c) return { content: [{ type: "text" as const, text: "Not signed in." }], isError: true };
            return callTool(name, c, args);
          },
        );
      }
    },
    {
      serverInfo: { name: "rr-scheduler", version: "0.1.0" },
      instructions:
        "RR Scheduler (Retrofit Rebates field-service portal), read-only. Call get_session first to learn the user's role. " +
        "Times are America/Chicago. Visit lists need a date window or a project. Every record includes a portal link.",
    },
  );
}
