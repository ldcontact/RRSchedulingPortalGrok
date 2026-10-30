"use client";
import { mockSignIn } from "@/app/auth-actions";
import { ROLE_LABEL, type Profile } from "@/lib/types";

/** DEV MOCK MODE only: switch the demo user (and so the role) without signing out. */
export function MockRoleSwitcher({ profiles, current }: { profiles: Profile[]; current: string }) {
  return (
    <form action={mockSignIn} className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas py-1 pr-1 pl-2.5">
      <span className="hidden text-xs text-muted sm:inline">Viewing as</span>
      <select name="uid" defaultValue={current} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="max-w-[150px] bg-transparent text-[13px] font-semibold outline-none sm:max-w-[230px]" aria-label="Switch demo user">
        {profiles.filter((p) => p.role).map((p) => <option key={p.id} value={p.id}>{ROLE_LABEL[p.role!]} · {p.full_name}</option>)}
      </select>
    </form>
  );
}
