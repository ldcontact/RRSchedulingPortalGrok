import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { Icon } from "@/components/icons";
import { Banner, RolePill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { getSessionUser } from "@/lib/auth";
import { MOCK_MODE } from "@/lib/env";
import { decideAuthorization } from "./actions";

export const metadata: Metadata = { title: "Connect an AI app" };

/**
 * OAuth 2.1 authorization path for the RR Scheduler MCP (/api/mcp). Supabase Auth
 * sends the browser here with ?authorization_id=…; the user signs in with the normal
 * portal login (Google or email/password) and approves read-only access.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const sp = await searchParams;
  const id = typeof sp.authorization_id === "string" ? sp.authorization_id : "";
  const err = typeof sp.error === "string" ? sp.error : null;
  if (!id || MOCK_MODE) {
    return (
      <AuthLayout>
        <h1 className="text-[26px] font-semibold tracking-tight">Connect an AI app</h1>
        <Banner tone="error"><Icon name="shield" />{MOCK_MODE ? "AI connections need real Supabase sign-in (not dev mock mode)." : err === "invalid" || !err ? "This link is missing its sign-in request. Start the connection again from your AI app." : err}</Banner>
      </AuthLayout>
    );
  }
  const here = `/oauth/consent?authorization_id=${encodeURIComponent(id)}`;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const { createClient } = await import("@/lib/supabase/server");
  const { data, error } = await (await createClient()).auth.oauth.getAuthorizationDetails(id);
  if (error || !data) {
    return (
      <AuthLayout>
        <h1 className="text-[26px] font-semibold tracking-tight">Connect an AI app</h1>
        <Banner tone="error"><Icon name="shield" />This sign-in request is invalid or expired. Start the connection again from your AI app.</Banner>
      </AuthLayout>
    );
  }
  if (!("authorization_id" in data)) redirect(data.redirect_url); // already approved earlier

  const client = data.client?.name || "An AI app";
  return (
    <AuthLayout>
      <div className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand"><Icon name="shield" className="size-6" /></div>
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">Connect {client}</h1>
        <p className="mt-2 text-muted"><b className="text-ink">{client}</b> wants to read RR Scheduler as you.</p>
      </div>
      <div className="card flex flex-col gap-2 p-4 text-sm">
        <div className="flex items-center justify-between gap-2"><span className="truncate">Signed in as <b>{user.email}</b></span>{user.role && <RolePill role={user.role} />}</div>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted">
          <li>Read-only: customers, projects, visits, schedule, team, notes, photos and message logs your role can already see.</li>
          <li>It cannot change anything, send email or texts, or manage the team.</li>
          <li>Sends you back to <span className="break-all">{data.redirect_uri}</span></li>
        </ul>
      </div>
      {err && <Banner tone="error"><Icon name="shield" />{err}</Banner>}
      {!user.role && <Banner tone="warn"><Icon name="shield" />This account isn&apos;t on the RR Scheduler team, so it can&apos;t connect. Ask an admin to add {user.email}.</Banner>}
      <div className="flex gap-2">
        {user.role && <form action={decideAuthorization.bind(null, id, true)} className="flex-1"><SubmitButton className="btn btn-primary w-full" pendingText="Connecting…"><Icon name="check" />Allow</SubmitButton></form>}
        <form action={decideAuthorization.bind(null, id, false)} className={user.role ? "" : "flex-1"}><SubmitButton className="btn w-full" pendingText="Declining…">Decline</SubmitButton></form>
      </div>
      <form action="/auth/signout" method="post"><input type="hidden" name="next" value={here} /><button className="text-xs font-semibold text-brand">Use a different account</button></form>
    </AuthLayout>
  );
}
