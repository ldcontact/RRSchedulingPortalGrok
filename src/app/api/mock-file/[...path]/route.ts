import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { MOCK_MODE } from "@/lib/env";
import { getSessionUser } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { mimeForFile } from "@/lib/project-file";

export async function GET(req: Request, ctx: RouteContext<"/api/mock-file/[...path]">) {
  if (!MOCK_MODE) return new Response("Not found", { status: 404 });
  const user = await getSessionUser();
  if (!user?.role) return new Response("Unauthorized", { status: 401 });
  const parts = (await ctx.params).path;
  const storagePath = parts.map((p) => decodeURIComponent(p)).join("/");
  const projectId = parts[0] === "seed" ? "p1" : parts[0];
  const repo = await getRepo();
  const visible = projectId ? await repo.listProjectFiles({ projectId }) : [];
  const row = visible.find((f) => f.storage_path === storagePath);
  if (!row) return new Response("Not found", { status: 404 });
  const filename = row.filename;
  const mime = row.mime || mimeForFile({ name: filename });
  const isSeed = parts[0] === "seed";
  const download = new URL(req.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "content-type": isSeed && isImageName(filename, mime) ? "image/svg+xml" : (mime || "application/octet-stream"),
    "cache-control": "private, max-age=3600",
  };
  if (download) headers["content-disposition"] = `attachment; filename="${filename.replace(/"/g, "")}"`;

  if (isSeed) return new Response(Buffer.from(seedBytes(filename, mime)), { headers });
  const root = join(process.cwd(), ".mock-uploads");
  const file = normalize(join(root, ...parts.map((p) => decodeURIComponent(p))));
  if (!file.startsWith(root)) return new Response("Bad path", { status: 400 });
  try {
    return new Response(new Uint8Array(await readFile(file)), { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function isImageName(filename: string, mime: string) {
  return mime.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(filename);
}

function seedBytes(filename: string, mime: string): Uint8Array {
  const label = filename.replace(/[<>&"]/g, "");
  if (isImageName(filename, mime)) {
    const bars = Array.from({ length: 8 }, (_, i) => `<rect x="${120 + i * 72}" y="280" width="44" height="160" rx="4"/>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#1e293b"/><rect x="80" y="70" width="640" height="40" fill="#334155"/><g fill="#f59e0b">${bars}</g><text x="40" y="50" font-family="sans-serif" font-size="22" fill="#fff">${label}</text></svg>`;
    return new TextEncoder().encode(svg);
  }
  if (mime === "text/csv" || filename.endsWith(".csv")) {
    return new TextEncoder().encode("fixture,qty,watts\n2x4 LED panel,42,40\nOccupancy sensor,4,\n");
  }
  if (mime === "application/pdf" || filename.endsWith(".pdf")) {
    return new TextEncoder().encode("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  }
  return new TextEncoder().encode(`Sample spreadsheet: ${label}\n`);
}
