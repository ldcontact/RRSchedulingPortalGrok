import { NextResponse } from "next/server";
import { MOCK_MODE } from "@/lib/env";
import { handleTeamSmsInbound } from "@/lib/team-sms/inbound";

export const dynamic = "force-dynamic";

function twiml(message?: string) {
  const body = message ? `<Message>${message}</Message>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

async function readTwilioForm(req: Request): Promise<Record<string, string>> {
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/x-www-form-urlencoded") || ctype.includes("multipart/form-data")) {
    const fd = await req.formData();
    const out: Record<string, string> = {};
    fd.forEach((v, k) => { out[k] = String(v); });
    return out;
  }
  try {
    const json = await req.json() as Record<string, string>;
    return json ?? {};
  } catch {
    return {};
  }
}

/**
 * Twilio inbound webhook for staff team texts.
 * Point the team Messaging Service's inbound URL here. STOP turns that
 * member's texting off. Never looks up customer numbers.
 */
export async function POST(req: Request) {
  const form = await readTwilioForm(req);
  const from = form.From ?? form.from ?? "";
  const body = form.Body ?? form.body ?? "";

  if (MOCK_MODE) {
    const { mockTeamSmsStore } = await import("@/lib/data/mock-repo");
    const result = await handleTeamSmsInbound(mockTeamSmsStore(), { from, body });
    void result;
    return new NextResponse(twiml(), { status: 200, headers: { "Content-Type": "text/xml" } });
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { supabaseTeamSmsStore } = await import("@/lib/team-sms/supabase-adapter");
  const admin = createAdminClient();
  if (!admin) {
    return new NextResponse(twiml(), { status: 200, headers: { "Content-Type": "text/xml" } });
  }
  await handleTeamSmsInbound(supabaseTeamSmsStore(admin), { from, body });
  return new NextResponse(twiml(), { status: 200, headers: { "Content-Type": "text/xml" } });
}
