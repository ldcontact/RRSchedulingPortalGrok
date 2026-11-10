import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { ROLE_LABEL, type Role } from "@/lib/types";

export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

export function Avatar({ name, color, size = "md", src }: { name: string; color: string; size?: "sm" | "md" | "lg"; src?: string | null }) {
  const s = size === "lg" ? "size-12 text-base" : size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs or Google avatars; plain img avoids next/image host config issues
      <img src={src} alt={name} title={name} className={`inline-block shrink-0 rounded-full object-cover ${s}`} />
    );
  }
  return <span className={`inline-grid shrink-0 place-items-center rounded-full font-bold text-white ${s}`} style={{ background: color }} title={name}>{initials(name)}</span>;
}

/** Retrofit Rebates company mark (local asset, not hotlinked). */
export function BrandMark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/logo.png" alt="Retrofit Rebates" className={`object-contain ${className}`} />
  );
}

export function Logo({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  // Company mark sits where the old orange bolt was — white tile keeps it readable on the dark sidebar / auth panel.
  const tile = compact
    ? "h-9 w-11 p-1"
    : "h-10 w-[3.25rem] p-1.5";
  return (
    <div className="flex items-center gap-2.5">
      <div className={`grid shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white shadow-[0_2px_8px_rgba(0,0,0,.18)] ring-1 ring-black/5 ${tile}`}>
        <BrandMark className="h-full w-full max-h-full max-w-full" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className={`text-[15.5px] font-bold ${dark ? "text-white" : "text-ink"}`}>RR Scheduler</div>
          <div className={`text-[11.5px] ${dark ? "text-[#8fb5ae]" : "text-muted"}`}>Retrofit Rebates, Inc.</div>
        </div>
      )}
    </div>
  );
}

const ROLE_STYLE: Record<Role, string> = { admin: "bg-brand-50 text-brand", manager: "bg-violet-100 text-violet-700", tech: "bg-orange-100 text-orange-700" };
export function RolePill({ role }: { role: Role | null }) {
  if (!role) return <span className="pill bg-slate-100 text-slate-600">No role</span>;
  return <span className={`pill ${ROLE_STYLE[role]}`}>{ROLE_LABEL[role]}</span>;
}

export function PageHeader({ title, sub, back, actions }: { title: ReactNode; sub?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <div className="mb-5">
      {back && <Link href={back.href} className="mb-2.5 inline-flex items-center gap-1 font-medium text-muted hover:text-ink"><Icon name="left" />{back.label}</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>{sub && <div className="mt-0.5 text-muted">{sub}</div>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Banner({ tone = "info", children }: { tone?: "info" | "warn" | "ok" | "error"; children: ReactNode }) {
  const t = { info: "bg-brand-50 text-[#134e4a]", warn: "bg-accent-50 text-[#78350f]", ok: "bg-green-100 text-green-900", error: "bg-red-50 text-red-800" }[tone];
  return <div className={`flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-[13.5px] ${t}`}>{children}</div>;
}

export function MockBadge() {
  return <span className="rounded-md bg-accent-50 px-2 py-0.5 text-[11px] font-bold tracking-wide text-amber-700" title="NEXT_PUBLIC_RR_MOCK_MODE=1: local sample data, no real auth">DEV MOCK MODE</span>;
}
