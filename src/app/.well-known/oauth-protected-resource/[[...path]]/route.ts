import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { authServerUrl, MCP_PATH } from "@/lib/mcp/auth";

/**
 * RFC 9728 protected resource metadata for /api/mcp (served at both
 * /.well-known/oauth-protected-resource and .../api/mcp). Points MCP clients
 * at Supabase Auth's OAuth 2.1 server for this project.
 */
export function GET(req: Request) {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [authServerUrl()],
    resourceUrl: `${getPublicOrigin(req)}${MCP_PATH}`,
    additionalMetadata: { resource_name: "RR Scheduler", bearer_methods_supported: ["header"] },
  });
  return Response.json(metadata, {
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*", "Cache-Control": "max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
