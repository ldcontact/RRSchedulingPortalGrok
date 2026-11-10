"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Avatar, RolePill } from "@/components/ui";
import { AvatarEditor } from "@/components/avatar-editor";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_LABEL, ROLES, type TeamMember } from "@/lib/types";
import {
  adminSetPassword,
  deleteMember,
  manageMemberAvatar,
  removeMember,
  resendInvite,
  sendPasswordResetNoted,
  setMemberActive,
  updateMember,
} from "@/app/(app)/team/actions";

const STORAGE_KEY = "rr-team-view";
const STATUS = { active: "bg-green-100 text-green-800", invited: "bg-accent-50 text-amber-700", inactive: "bg-red-50 text-red-800" } as const;
const STATUS_LABEL = { active: "Active", invited: "Invited", inactive: "Suspended" } as const;
const ROLE_HELP = { admin: "Everything, including team and roles", manager: "Customers, scheduling, approvals", tech: "Only their assigned jobs" } as const;
const ROLE_ORDER = { admin: 0, manager: 1, tech: 2 } as const;
const STATUS_ORDER = { active: 0, invited: 1, inactive: 2 } as const;

type ViewMode = "cards" | "list";
type SortKey = "name" | "role" | "status";

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

function ManagePanel({ m, meEmail }: { m: TeamMember; meEmail: string }) {
  return (
    <details className="rounded-lg border border-line bg-canvas/60 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold"><Icon name="edit" className="size-4" />Manage</summary>
      <div className="flex flex-col gap-3 border-t border-line p-3">
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Profile photo</div>
          <AvatarEditor
            name={m.full_name || m.email}
            color={m.color}
            src={m.avatar_url}
            source={m.avatar_source}
            hasGoogle={!!m.google_avatar_url}
            action={manageMemberAvatar}
            hidden={{ email: m.email, ...(m.profile_id ? { profile_id: m.profile_id } : {}) }}
            compact
          />
        </div>
        <form action={updateMember.bind(null, m.email)} className="grid gap-2.5"><MemberFields m={m} /><SubmitButton className="btn btn-sm btn-primary">Save</SubmitButton></form>
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          {m.profile_id && (
            <form action={adminSetPassword} className="grid gap-2 rounded-lg border border-line bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Set password</div>
              <input type="hidden" name="profile_id" value={m.profile_id} />
              <label className="label">New password (min 8 characters)
                <input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
              </label>
              <div className="flex flex-wrap gap-2">
                <SubmitButton className="btn btn-sm btn-primary" pendingText="Saving…"><Icon name="lock" className="size-4" />Set password</SubmitButton>
                <SubmitButton formAction={sendPasswordResetNoted.bind(null, m.email)} className="btn btn-sm" pendingText="…">Email reset link (needs SMTP)</SubmitButton>
              </div>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            <form action={resendInvite.bind(null, m.email)}><SubmitButton className="btn btn-sm" pendingText="Sending…"><Icon name="send" className="size-4" />{m.status === "invited" ? "Resend invite" : "Send password link"}</SubmitButton></form>
            {m.profile_id && m.email !== meEmail && (
              <form action={setMemberActive.bind(null, m.profile_id, m.status !== "active")}>
                <SubmitButton className="btn btn-sm">{m.status === "active" ? "Suspend" : "Restore"}</SubmitButton>
              </form>
            )}
            {m.status === "invited" && m.email !== meEmail && (
              <form action={removeMember.bind(null, m.email)}><SubmitButton className="btn btn-sm btn-danger" pendingText="Removing…"><Icon name="trash" className="size-4" />Remove invite</SubmitButton></form>
            )}
          </div>
          {m.profile_id && m.email !== meEmail && (
            <form action={deleteMember} className="grid gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-800">Delete user</div>
              <p className="text-[12px] text-red-900/80">Soft-deletes access and anonymizes their profile. Job/photo history stays. Type <b>{m.full_name}</b> to confirm.</p>
              <input type="hidden" name="profile_id" value={m.profile_id} />
              <input className="input" name="confirm_name" placeholder="Type full name" required autoComplete="off" />
              <SubmitButton className="btn btn-sm btn-danger" pendingText="Deleting…"><Icon name="trash" className="size-4" />Delete permanently</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </details>
  );
}

function sortMembers(team: TeamMember[], key: SortKey, dir: "asc" | "desc") {
  const mul = dir === "asc" ? 1 : -1;
  return [...team].sort((a, b) => {
    let cmp = 0;
    if (key === "name") cmp = (a.full_name || a.email).localeCompare(b.full_name || b.email, undefined, { sensitivity: "base" });
    else if (key === "role") cmp = (ROLE_ORDER[a.role ?? "tech"] - ROLE_ORDER[b.role ?? "tech"]) || (a.full_name || a.email).localeCompare(b.full_name || b.email);
    else cmp = (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (a.full_name || a.email).localeCompare(b.full_name || b.email);
    return cmp * mul;
  });
}

function readStoredView(): ViewMode {
  if (typeof window === "undefined") return "cards";
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "list" || saved === "cards") return saved;
  } catch { /* ignore */ }
  return "cards";
}

export function TeamDirectory({ team, meEmail, admin }: { team: TeamMember[]; meEmail: string; admin: boolean }) {
  const [view, setView] = useState<ViewMode>(readStoredView);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, view); } catch { /* ignore */ }
  }, [view]);

  const sorted = useMemo(() => sortMembers(team, sortKey, sortDir), [team, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function sortLabel(k: SortKey, label: string) {
    return (
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 font-semibold hover:text-ink">
        {label}
        {sortKey === k && <span className="text-[10px] text-muted">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted">{sorted.length} people</div>
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Team view">
          <button
            type="button"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold ${view === "cards" ? "bg-brand-50 text-brand" : "text-muted hover:text-ink"}`}
          >
            <Icon name="grid" className="size-4" />Cards
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold ${view === "list" ? "bg-brand-50 text-brand" : "text-muted hover:text-ink"}`}
          >
            <Icon name="list" className="size-4" />List
          </button>
        </div>
      </div>

      {view === "cards" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((m) => (
            <div key={m.email} className="card flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={m.full_name || m.email} color={m.color} size="lg" src={m.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.full_name || m.email}{m.email === meEmail && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}</div>
                  <div className="truncate text-[12.5px] text-muted">{m.title ?? ""}</div>
                </div>
                <RolePill role={m.role} />
              </div>
              <div className="grid gap-1 text-[13px]">
                <div className="flex items-center gap-2 truncate"><Icon name="mail" className="size-4 text-muted" />{m.email}</div>
                <div className="flex items-center gap-2"><Icon name="phone" className="size-4 text-muted" />{m.phone ?? "—"}</div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`pill ${STATUS[m.status]}`}>{m.status === "invited" ? "Invited, not signed in yet" : STATUS_LABEL[m.status]}</span>
                <span className="text-xs text-muted">Jobs: phase 2</span>
              </div>
              {admin && <ManagePanel m={m} meEmail={meEmail} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="border-b border-line bg-canvas/80 text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">{sortLabel("name", "Name")}</th>
                  <th className="hidden px-3 py-2.5 font-semibold sm:table-cell">Email</th>
                  <th className="px-3 py-2.5 font-semibold">{sortLabel("role", "Role")}</th>
                  <th className="px-3 py-2.5 font-semibold">{sortLabel("status", "Status")}</th>
                  <th className="hidden px-3 py-2.5 font-semibold md:table-cell">Phone</th>
                  <th className="hidden px-3 py-2.5 font-semibold lg:table-cell">Last sign-in</th>
                  {admin && <th className="px-3 py-2.5 font-semibold"> </th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr key={m.email} className="border-b border-line last:border-0 hover:bg-canvas/40">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={m.full_name || m.email} color={m.color} size="sm" src={m.avatar_url} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{m.full_name || m.email}{m.email === meEmail && <span className="ml-1 text-xs font-normal text-muted">(you)</span>}</div>
                          <div className="truncate text-[12px] text-muted sm:hidden">{m.email}</div>
                          {m.title && <div className="truncate text-[12px] text-muted">{m.title}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="hidden max-w-[220px] truncate px-3 py-2.5 text-muted sm:table-cell">{m.email}</td>
                    <td className="px-3 py-2.5"><RolePill role={m.role} /></td>
                    <td className="px-3 py-2.5"><span className={`pill ${STATUS[m.status]}`}>{STATUS_LABEL[m.status]}</span></td>
                    <td className="hidden px-3 py-2.5 text-muted md:table-cell">{m.phone ?? "—"}</td>
                    <td className="hidden px-3 py-2.5 text-muted lg:table-cell" title="Available once admin auth key is configured">—</td>
                    {admin && (
                      <td className="px-3 py-2.5 align-top">
                        <div className="min-w-[220px]"><ManagePanel m={m} meEmail={meEmail} /></div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
