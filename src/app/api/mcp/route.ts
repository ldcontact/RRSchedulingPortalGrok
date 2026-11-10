/**
 * RR Scheduler MCP server (Phase 1, read-only), Streamable HTTP at /api/mcp.
 * Auth: `Authorization: Bearer <Supabase access token>`; clients discover the
 * Supabase OAuth 2.1 server via /.well-known/oauth-protected-resource/api/mcp and
 * sign in through /oauth/consent. Every tool runs as that user with RLS (no service role).
 */
import { withMcpAuth } from "mcp-handler";
import { getRepoForToken } from "@/lib/data/repo";
import { RESOURCE_METADATA_PATH, userFromAuth, verifyBearer } from "@/lib/mcp/auth";
import { buildMcpHandler } from "@/lib/mcp/server";
import { DEFAULT_PORTAL_URL } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const PORTAL = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_PORTAL_URL).replace(/\/$/, "");

const handler = buildMcpHandler(async (info) => {
  const user = userFromAuth(info);
  return info && user ? { user, repo: await getRepoForToken(info.token), portal: PORTAL } : null;
});

const authed = withMcpAuth(handler, verifyBearer, { required: true, resourceMetadataPath: RESOURCE_METADATA_PATH });

export { authed as GET, authed as POST, authed as DELETE };
