"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { Avatar, Logo, MockBadge } from "./ui";
import { ROLE_LABEL, type Role, type SessionUser } from "@/lib/types";

type NavItem = { href: string; label: string; icon: string; soon?: boolean };
const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/", label: "Home", icon: "home" },
    { href: "/schedule", label: "Schedule", icon: "calendar" },
    { href: "/customers", label: "Customers", icon: "users" },
    { href: "/projects", label: "Projects", icon: "briefcase" },
    { href: "/team", label: "Team", icon: "hardhat" },
  ],
  manager: [],
  tech: [
    { href: "/", label: "My Jobs", icon: "wrench" },
    { href: "/schedule", label: "Schedule", icon: "calendar" },
    { href: "/account", label: "Profile", icon: "user" },
  ],
};
NAV.manager = NAV.admin;

export function AppShell({ user, mock, roleSwitcher, children }: { user: SessionUser & { role: Role }; mock: boolean; roleSwitcher?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const tech = user.role === "tech";
  const items = NAV[user.role];
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const bottom: NavItem[] = tech ? items : [...items.filter((i) => i.href !== "/team"), { href: "/account", label: "More", icon: "user" }];
  const bottomActive = (href: string) => active(href) || (href === "/account" && path.startsWith("/team"));

  return (
    <div className={`min-h-screen ${tech ? "" : "md:grid md:grid-cols-[244px_1fr] md:bg-[linear-gradient(to_right,var(--color-brand-900)_244px,transparent_244px)]"}`}>
      {!tech && (
        <aside className="sticky top-0 hidden h-screen flex-col gap-1 bg-brand-900 px-3 py-[18px] text-[#bcd6d1] md:flex">
          <div className="px-2 pb-[18px]"><Logo dark /></div>
          <nav className="flex flex-col gap-0.5">
            {items.map((i) => i.soon ? (
              <span key={i.href} className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 font-medium text-[#6f948d]" title="Coming in phase 2">
                <Icon name={i.icon} />{i.label}<span className="ml-auto rounded-full bg-white/10 px-2 text-[10.5px] font-semibold">Phase 2</span>
              </span>
            ) : (
              <Link key={i.href} href={i.href} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium hover:bg-white/5 hover:text-white ${active(i.href) ? "bg-white/12 text-white" : ""}`}>
                <Icon name={i.icon} />{i.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-3">
            <Link href="/account" className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-white/5">
              <Avatar name={user.name} color={user.color} src={user.avatar_url} />
              <div className="min-w-0"><div className="truncate font-semibold text-white">{user.name}</div><div className="truncate text-[11.5px] text-[#8fb5ae]">{user.email}</div></div>
            </Link>
            <form action="/auth/signout" method="post"><button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[#8fb5ae] hover:bg-white/5 hover:text-white"><Icon name="logout" />Sign out</button></form>
          </div>
        </aside>
      )}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-3 backdrop-blur md:h-[60px] md:px-6">
          <div className={tech ? "" : "md:hidden"}><Logo compact /></div>
          <div className="min-w-0 flex-1 truncate font-semibold">{tech ? "RR Scheduler" : ""}</div>
          {mock && <span className="hidden sm:inline"><MockBadge /></span>}
          {roleSwitcher}
          <span className="hidden text-xs text-muted lg:inline">{ROLE_LABEL[user.role]}</span>
        </header>
        <main className={`w-full px-3 pt-4 pb-28 md:px-6 md:pt-6 ${tech ? "mx-auto max-w-[680px]" : "max-w-[1320px] md:pb-10"}`}>{children}</main>
      </div>
      <nav className={`fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-line bg-white px-1.5 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,.05)] ${tech ? "mx-auto max-w-[680px] rounded-t-2xl border-x" : "md:hidden"}`}>
        {bottom.map((i) => i.soon ? (
          <span key={i.href} className="flex min-w-[60px] flex-col items-center gap-0.5 px-2 py-1.5 text-[11px] font-semibold text-slate-300" title="Coming in phase 2"><Icon name={i.icon} className="size-[22px]" />{i.label}</span>
        ) : (
          <Link key={i.href} href={i.href} className={`flex min-w-[60px] flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${bottomActive(i.href) ? "bg-brand-50 text-brand" : "text-muted"}`}>
            <Icon name={i.icon} className="size-[22px]" />{i.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
