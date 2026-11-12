import { NextResponse } from "next/server";
import { getSalesRepo } from "@/lib/sales/repo";
import { checkWebhookSecret, webhookSecretConfigured } from "@/lib/sales/webhook";

/** xAgent (or another trusted caller) posts a lead here. Header: x-rr-webhook-secret. */
export async function POST(req: Request) {
  if (!webhookSecretConfigured()) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }
  const provided = req.headers.get("x-rr-webhook-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!checkWebhookSecret(provided)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? body.full_name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  const item = await (await getSalesRepo()).ingestLead({
    source: "xagent",
    name,
    phone: body.phone ?? null,
    email: body.email ?? null,
    address: body.address ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    zip: body.zip ?? null,
    pipeline_slug: body.pipeline ?? "single_family_whe",
    message: body.message ?? body.transcript ?? null,
    raw: { channel: body.channel ?? "phone" },
  });
  return NextResponse.json({ id: item.id, status: item.status });
}
