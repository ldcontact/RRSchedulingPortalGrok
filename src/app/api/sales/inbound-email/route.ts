import { NextResponse } from "next/server";
import { parseInboundEmail } from "@/lib/sales/inbound-email";
import { getSalesRepo } from "@/lib/sales/repo";
import { checkWebhookSecret, webhookSecretConfigured } from "@/lib/sales/webhook";

/** Ingest a forwarded or parsed inbound email. Protected by the webhook secret when configured. */
export async function POST(req: Request) {
  if (webhookSecretConfigured()) {
    const provided = req.headers.get("x-rr-webhook-secret");
    if (!checkWebhookSecret(provided)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const ct = req.headers.get("content-type") ?? "";
  let text = "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    text = String(body.raw ?? body.body ?? "");
  } else {
    text = await req.text();
  }
  if (!text.trim()) return NextResponse.json({ error: "Empty message." }, { status: 400 });
  const parsed = parseInboundEmail(text);
  const item = await (await getSalesRepo()).ingestLead({
    source: "email",
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    address: parsed.address,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    message: parsed.message,
    raw: { subject: parsed.subject },
  });
  return NextResponse.json({ id: item.id, name: parsed.name });
}
