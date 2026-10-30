import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { MOCK_MODE } from "@/lib/env";
import { getSessionUser } from "@/lib/auth";

/** DEV MOCK MODE only: serves uploaded photos from .mock-uploads/ and draws placeholders for seeded sample photos. */
export async function GET(_req: Request, ctx: RouteContext<"/api/mock-photo/[...path]">) {
  if (!MOCK_MODE) return new Response("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user?.role) return new Response("Unauthorized", { status: 401 });
  const parts = (await ctx.params).path;
  if (parts[0] === "seed") {
    const kind = parts[1];
    const label = decodeURIComponent(parts.slice(2).join("/")).replace(/\.svg$/, "").replace(/[<>&"]/g, "");
    const [a, b] = kind === "completion" ? ["#0f766e", "#134e4a"] : ["#78716c", "#3f3f46"];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><title>${label}</title><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="10"><rect x="120" y="120" width="220" height="110" rx="8"/><rect x="460" y="120" width="220" height="110" rx="8"/><rect x="120" y="330" width="220" height="110" rx="8"/><rect x="460" y="330" width="220" height="110" rx="8"/></g><text x="40" y="60" font-family="sans-serif" font-size="26" fill="#fff" fill-opacity=".8">${kind === "completion" ? "AFTER" : "BEFORE"} · sample</text></svg>`;
    return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=3600" } });
  }
  const root = join(process.cwd(), ".mock-uploads");
  const file = normalize(join(root, ...parts));
  if (!file.startsWith(root)) return new Response("Bad path", { status: 400 });
  try {
    return new Response(new Uint8Array(await readFile(file)), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
