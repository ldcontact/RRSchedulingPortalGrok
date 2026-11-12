import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { Banner, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { TeamDirectory } from "@/components/team-directory";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { ROLE_LABEL, ROLES } from "@/lib/types";
import { inviteMember, sendSelfTestEmail } from "./actions";
import { emailConfigured } from "@/lib/email";

export const metadata: Metadata = { title: "Team" };

const ROLE_HELP = { admin: "Everything, including team and roles", manager: "Customers, scheduling, approvals", sales: "Pipeline, leads, and their own deals", tech: "Only their assigned visits" };

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const me = await requireRole("admin", "manager");
  const admin = me.role === "admin";
  const { ok, error } = await searchParams;
  let team = await (await getRepo()).listTeam();
  if (!admin) team = team.filter((m) => m.status !== "invited"); // matches RLS: only admins see the invite list
  const active = team.filter((m) => m.status === "active").length;
  const emailReady = emailConfigured();

  return (
    <>
      <PageHeader title="Team" sub={`${active} active · ${team.filter((m) => m.role === "tech" && m.status === "active").length} field techs${admin ? ` · ${team.filter((m) => m.status === "invited").length} invited` : ""}`} />
      {typeof ok === "string" && <div className="mb-4"><Banner tone="ok"><Icon name="check" />{ok}</Banner></div>}
      {typeof error === "string" && <div className="mb-4"><Banner tone="error"><Icon name="shield" />{error}</Banner></div>}
      {!admin && <div className="mb-4"><Banner><Icon name="shield" />Only admins can invite people or change roles.</Banner></div>}

      {admin && (
        <form id="invite" action={inviteMember} className="card mb-5 scroll-mt-20">
          <div className="card-hd"><h3 className="font-semibold">Invite a team member</h3><span className="text-xs text-muted">Any email works: Gmail, Outlook, company…</span></div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <label className="label sm:col-span-2 lg:col-span-1">Email (Google account or any email)<input className="input" name="email" type="email" required placeholder="name@gmail.com" /></label>
            <label className="label">Full name<input className="input" name="full_name" required /></label>
            <label className="label">Role<select className="input" name="role" defaultValue="tech">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}: {ROLE_HELP[r]}</option>)}</select></label>
            <label className="label">Job title<input className="input" name="title" placeholder="e.g. Electrician" /></label>
            <label className="label">Phone<input className="input" name="phone" type="tel" /></label>
            <label className="label">Calendar color<input className="input h-10 p-1" name="color" type="color" defaultValue="#0891b2" /></label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3"><input type="checkbox" name="send_email" defaultChecked className="accent-brand" />Email them an invite link (to set a password). They can also just use Sign in with Google.</label>
            <div className="sm:col-span-2 lg:col-span-3 text-xs text-muted">After they appear on the list, open Manage to add a profile photo (or use their Google photo once they sign in).</div>
            <div className="sm:col-span-2 lg:col-span-3"><SubmitButton pendingText="Inviting…"><Icon name="send" className="size-4" />Add to team</SubmitButton></div>
          </div>
        </form>
      )}

      {admin && (
        <form action={sendSelfTestEmail} className="card mb-5">
          <div className="card-hd"><h3 className="font-semibold">Test outbound email</h3><span className="text-xs text-muted">Sends only to you</span></div>
          <div className="grid gap-3 p-5">
            <p className="text-sm text-muted">Confirm that the portal can send from the admin@retrofitrebates.com mailbox. The test goes to <span className="font-medium text-ink">{me.email}</span> only. Customer emails are not sent automatically yet.</p>
            {emailReady ? (
              <div><SubmitButton pendingText="Sending…"><Icon name="send" className="size-4" />Send a test email to me</SubmitButton></div>
            ) : (
              <Banner tone="warn"><Icon name="shield" />Outbound email is not configured yet. Set GOOGLE_MAILER_SA_JSON and EMAIL_SENDER, or SMTP_USER and SMTP_PASSWORD, then try again.</Banner>
            )}
          </div>
        </form>
      )}

      <TeamDirectory team={team} meEmail={me.email} admin={admin} />
    </>
  );
}
