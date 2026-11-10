import "server-only";
import { OAuthError, OAuthErrorCode, type AuthInfo } from "@modelcontextprotocol/server";
import { getSessionUserForToken } from "@/lib/auth";
import { SUPABASE_URL } from "@/lib/env";
import type { SessionUser } from "@/lib/types";

/** Supabase Auth is the OAuth 2.1 authorization server (it issues the user's normal access JWT). */
export const authServerUrl = () => `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1`;
export const MCP_PATH = "/api/mcp";
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

/** Unverified read of a JWT claim (only after Supabase has verified the token). */
function claims(token: string): { exp?: number; client_id?: string } {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * Bearer token -> signed-in portal user. The token must be a Supabase access token for
 * this project (from the OAuth flow, or a website session for local testing). It is
 * verified by Supabase Auth itself (getUser), never by decoding alone, and never logged.
 */
export async function verifyBearer(_req: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined; // -> 401 with a WWW-Authenticate challenge pointing at our metadata
  const user = await getSessionUserForToken(token);
  if (!user) throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid or expired token");
  const c = claims(token);
  return {
    token,
    clientId: c.client_id ?? "rr-scheduler",
    scopes: [],
    expiresAt: c.exp,
    extra: { user },
  };
}

export const userFromAuth = (info: AuthInfo | undefined) => (info?.extra?.user as SessionUser | undefined) ?? null;
