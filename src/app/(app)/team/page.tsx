import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { Avatar, Banner, PageHeader, RolePill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { ROLE_LABEL, ROLES, type TeamMember } from "@/lib/types";
import { inviteMember, removeMember, resendInvite, setMemberActive, updateMember } from "./actions";

export const metadata: Metadata = { title: "Team" };

const STATUS = { active: "bg-green-100 text-green-800", invited: "bg-accent-50 text-amber-700", inactive: "bg-slate-100 text-slate-600" };
const ROLE_HELP = { admin: "Everything, including team and roles", manager: "Customers, scheduling, approvals", tech: "Only their assigned jobs" };

function MemberFields({ m }: { m?: TeamMember }) {
  return (
    <>
      <label className="label">Full name<input className="input" name="full_name" defaultValue={m?.full_name} required /></label>
      <label className="label">Role<select className="input" name="role" defaultValue={m?.role ?? "tech"}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}: {ROLE_HELP[r]}</option>)}</select></label>
      <label className="label">Job title<input className="input" name="title" defaultValue={m?.title ?? ""} placeholder="e.g. Electrician" /></label>
      <label className="label">Phone<input className="input" name="phone" type="tel" defaultValue={m?.phone ?? ""} /></label>
      <label className="label">Calendar color<input className="input h-10 p-1" name="color" type="color" defaultValue={m?.color ?? "#0891b2"} /></label>
    </>
  );
}

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const me = await requireRole("admin", "manager");
  const admin = me.role === "admin";
  const { ok, error } = await searchParams;
  let team = await (await getRepo()).listTeam();
  if (!admin) team = team.filter((m) => m.status !== "invited"); // matches RLS: only admins see the invite list
  const active = team.filter((m) => m.status === "active").length;

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
            <MemberFields />
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3"><input type="checkbox" name="send_email" defaultChecked className="accent-brand" />Email them an invite link (to set a password). They can also just use Sign in with Google.</label>
            <div className="sm:col-span-2 lg:col-span-3"><SubmitButton pendingText="Inviting…"><Icon name="send" className="size-4" />Add to team</SubmitButton></div>
          </div>
        </form>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {team.map((m) => (
          <div key={m.email} className="card flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={m.full_name || m.email} color={m.color} size="lg" />
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{m.full_name || m.email}{m.email === me.email && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}</div><div className="truncate text-[12.5px] text-muted">{m.title ?? ""}</div></div>
              <RolePill role={m.role} />
            </div>
            <div className="grid gap-1 text-[13px]">
              <div className="flex items-center gap-2 truncate"><Icon name="mail" className="size-4 text-muted" />{m.email}</div>
              <div className="flex items-center gap-2"><Icon name="phone" className="size-4 text-muted" />{m.phone ?? "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <span className={`pill ${STATUS[m.status]}`}>{m.status === "invited" ? "Invited, not signed in yet" : m.status === "active" ? "Active" : "Deactivated"}</span>
              <span className="text-xs text-muted">Jobs: phase 2</span>
            </div>
            {admin && (
              <details className="rounded-lg border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold"><Icon name="edit" className="size-4" />Manage</summary>
                <div className="flex flex-col gap-3 border-t border-line p-3">
                  <form action={updateMember.bind(null, m.email)} className="grid gap-2.5"><MemberFields m={m} /><SubmitButton className="btn btn-sm btn-primary">Save</SubmitButton></form>
                  <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                    <form action={resendInvite.bind(null, m.email)}><SubmitButton className="btn btn-sm" pendingText="Sending…"><Icon name="send" className="size-4" />{m.status === "invited" ? "Resend invite" : "Send password link"}</SubmitButton></form>
                    {m.profile_id && m.email !== me.email && <form action={setMemberActive.bind(null, m.profile_id, m.status !== "active")}><SubmitButton className="btn btn-sm">{m.status === "active" ? "Deactivate" : "Reactivate"}</SubmitButton></form>}
                    {m.email !== me.email && <form action={removeMember.bind(null, m.email)}><SubmitButton className="btn btn-sm btn-danger" pendingText="Removing…"><Icon name="trash" className="size-4" />Remove</SubmitButton></form>}
                  </div>
                </div>
              </details>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
