import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { MOCK_MODE } from "@/lib/env";
import { getSessionUser } from "@/lib/auth";

export async function GET(_req: Request, ctx: RouteContext<"/api/mock-update-file/[...path]">) {
  if (!MOCK_MODE) return new Response("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user?.role) return new Response("Unauthorized", { status: 401 });
  const parts = (await ctx.params).path;
  const root = join(process.cwd(), ".mock-uploads");
  const file = normalize(join(root, ...parts.map((p) => decodeURIComponent(p))));
  if (!file.startsWith(root)) return new Response("Bad path", { status: 400 });
  const name = parts[parts.length - 1] || "attachment";
  const mime = name.match(/\.png$/i) ? "image/png"
    : name.match(/\.jpe?g$/i) ? "image/jpeg"
    : name.match(/\.gif$/i) ? "image/gif"
    : name.match(/\.webp$/i) ? "image/webp"
    : name.match(/\.pdf$/i) ? "application/pdf"
    : "application/octet-stream";
  try {
    return new Response(new Uint8Array(await readFile(file)), {
      headers: { "content-type": mime, "cache-control": "private, max-age=3600" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
