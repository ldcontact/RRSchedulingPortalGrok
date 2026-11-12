import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { initials } from "@/components/ui";
import type { Step } from "@/lib/project-progress";

export function formatStreetAddress(c: { address: string | null; city: string | null; state: string | null; zip: string | null }): string {
  return [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ");
}

export function mapsSearchUrl(addr: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}

export function mapsDirUrl(addr: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export function smsHref(phone: string) {
  return `sms:${phone.replace(/[^\d+]/g, "")}`;
}

const AVATAR_COLORS = ["#0f766e", "#0369a1", "#7c3aed", "#be185d", "#c2410c", "#0f766e", "#155e75"];

export function colorForName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function ProfileHeader({
  back, eyebrow, name, title, sub, actions, afterTitle, color,
}: {
  back?: { href: string; label: string };
  eyebrow?: string;
  /** When set, a large initials avatar is shown beside the title. */
  name?: string;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  afterTitle?: ReactNode;
  color?: string;
}) {
  return (
    <div className="mb-5 min-w-0">
      {back && (
        <Link href={back.href} className="mb-2.5 inline-flex max-w-full items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <Icon name="left" className="size-4 shrink-0" />
          <span className="truncate">{back.label}</span>
        </Link>
      )}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {name && (
            <span
              className="grid size-14 shrink-0 place-items-center rounded-full text-lg font-bold text-white sm:size-16 sm:text-xl"
              style={{ background: color ?? colorForName(name) }}
              aria-hidden
            >
              {initials(name)}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-[22px] font-semibold tracking-tight break-words sm:text-[26px]">{title}</h1>
              {afterTitle}
            </div>
            {sub && <div className="mt-1 text-sm text-muted break-words">{sub}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">{actions}</div>}
      </div>
    </div>
  );
}

export function StatsStrip({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="stat-strip mb-5">
      {items.map((it, i) => {
        const lastCol2 = i % 2 === 1;
        const lastCol4 = i === items.length - 1 || i === 3;
        return (
          <div
            key={it.label}
            className={`stat-cell ${i < 2 ? "border-b md:border-b-0" : ""} ${!lastCol2 ? "border-r md:border-r" : ""} ${lastCol2 && !lastCol4 ? "md:border-r" : ""} ${lastCol4 ? "md:border-r-0" : ""}`}
          >
            <div className="stat-value tabular-nums">{it.value}</div>
            <div className="stat-label">{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ProfileTabs({ base, current, tabs }: { base: string; current: string; tabs: { id: string; label: string; count?: number }[] }) {
  const href = (id: string) => (id === tabs[0]?.id ? base : `${base}?tab=${encodeURIComponent(id)}`);
  return (
    <div className="mb-5 border-b border-line">
      <nav className="profile-tabs" aria-label="Sections">
        {tabs.map((t) => {
          const active = t.id === current;
          return (
            <Link
              key={t.id}
              href={href(t.id)}
              scroll={false}
              role="tab"
              aria-selected={active}
              className={`profile-tab ${active ? "profile-tab-active" : ""}`}
            >
              {t.label}
              {t.count != null && <span className={`ml-1.5 text-xs ${active ? "text-ink" : "text-muted"}`}>{t.count}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Stepper({ steps }: { steps: Step[] | { label: string; state: "done" | "current" | "upcoming" }[] }) {
  return (
    <ol className="stepper mb-5 rounded-xl border border-line bg-white px-3 py-3 sm:px-4">
      {steps.map((s, i) => (
        <li key={s.label} className={`stepper-step stepper-${s.state}`}>
          <span className="stepper-dot">{s.state === "done" ? "✓" : i + 1}</span>
          <span className="stepper-label whitespace-nowrap">{s.label}</span>
          {i < steps.length - 1 && <span className="stepper-line" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function CommunicateMenu({ email, phone }: { email?: string | null; phone?: string | null }) {
  const has = Boolean(email || phone);
  return (
    <details className="profile-menu relative">
      <summary className="btn btn-communicate" aria-haspopup="menu">
        Communicate
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden><path d="M5.25 7.5 10 12.25 14.75 7.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div className="profile-menu-panel absolute right-0" role="menu">
        {email
          ? <a href={`mailto:${email}`} className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-canvas" role="menuitem"><Icon name="mail" className="size-4 text-muted" />Email</a>
          : <div className="px-3 py-2 text-sm text-muted">No email on file</div>}
        {phone
          ? <a href={telHref(phone)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-canvas" role="menuitem"><Icon name="phone" className="size-4 text-muted" />Call</a>
          : <div className="px-3 py-2 text-sm text-muted">No phone on file</div>}
        {phone
          ? <a href={smsHref(phone)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-canvas" role="menuitem"><Icon name="text" className="size-4 text-muted" />Text</a>
          : null}
        {!has && <div className="px-3 py-2 text-sm text-muted">Add a phone or email to reach this customer.</div>}
      </div>
    </details>
  );
}

export function ActionMenu({ label = "More actions", children }: { label?: string; children: ReactNode }) {
  return (
    <details className="profile-menu relative">
      <summary className="btn px-2.5" aria-label={label} aria-haspopup="menu">
        <span className="px-0.5 text-lg leading-none" aria-hidden>⋯</span>
      </summary>
      <div className="profile-menu-panel absolute right-0" role="menu">
        {children}
      </div>
    </details>
  );
}

export function menuLink(href: string, children: ReactNode, opts?: { danger?: boolean; testid?: string }) {
  return (
    <Link href={href} className={`flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-canvas ${opts?.danger ? "text-red-700" : ""}`} role="menuitem" data-testid={opts?.testid} scroll={opts?.testid === "delete-button" ? false : undefined}>
      {children}
    </Link>
  );
}

export function ScopeTable({ items, empty }: { items: { qty: number | null; work_item: string }[]; empty?: ReactNode }) {
  if (items.length === 0) return <div className="p-5 text-sm text-muted">{empty ?? "No scope written yet."}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-0 text-left text-sm">
        <thead className="border-b border-line bg-canvas/60 text-[11.5px] font-semibold tracking-wide text-muted uppercase">
          <tr>
            <th className="w-10 px-4 py-2.5 font-semibold">#</th>
            <th className="w-16 px-3 py-2.5 font-semibold">Qty</th>
            <th className="px-4 py-2.5 font-semibold">Work item</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((it, i) => (
            <tr key={`${i}-${it.work_item}`}>
              <td className="px-4 py-2.5 tabular-nums text-muted">{i + 1}</td>
              <td className="px-3 py-2.5 tabular-nums">{it.qty ?? "—"}</td>
              <td className="px-4 py-2.5 break-words">{it.work_item}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RailCard({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card min-w-0 ${className}`}>
      <div className="card-hd">
        <h3 className="min-w-0 truncate font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
