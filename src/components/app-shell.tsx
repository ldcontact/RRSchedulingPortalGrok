"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { Avatar, Logo, MockBadge } from "./ui";
import { WorkspaceSearch } from "./workspace-search";
import { NotificationBell } from "./updates/notification-bell";
import type { TeamUpdateNotification } from "@/lib/updates/types";
import { hasFleetAccess } from "@/lib/geotab/access";
import { ROLE_LABEL, type Role, type SessionUser } from "@/lib/types";

type NavItem = { href: string; label: string; icon: string; soon?: boolean; short?: string };
const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: "/", label: "Home", icon: "home" },
    { href: "/sales", label: "Sales", icon: "funnel" },
    { href: "/schedule", label: "Schedule", icon: "calendar" },
    { href: "/customers", label: "Customers", icon: "users" },
    { href: "/projects", label: "Projects", icon: "briefcase" },
    { href: "/service-requests", label: "Service requests", short: "Service", icon: "wrench" },
    { href: "/tasks", label: "Tasks", icon: "task" },
    { href: "/team", label: "Team", icon: "hardhat" },
  ],
  manager: [],
  sales: [
    { href: "/", label: "Home", icon: "home" },
    { href: "/sales", label: "Sales", icon: "funnel" },
    { href: "/customers", label: "Customers", icon: "users" },
    { href: "/projects", label: "Projects", icon: "briefcase" },
    { href: "/schedule", label: "Schedule", icon: "calendar" },
    { href: "/account", label: "Profile", icon: "user" },
  ],
  tech: [
    { href: "/", label: "My Jobs", icon: "wrench" },
    { href: "/schedule", label: "Schedule", icon: "calendar" },
    { href: "/tasks", label: "Tasks", icon: "task" },
    { href: "/account", label: "Profile", icon: "user" },
  ],
};
NAV.manager = NAV.admin;

/** badges: small counts next to nav items, keyed by href (e.g. open service requests). */
export function AppShell({ user, mock, roleSwitcher, badges = {}, updateNotifications, children }: { user: SessionUser & { role: Role }; mock: boolean; roleSwitcher?: ReactNode; badges?: Record<string, number>; updateNotifications?: { unread: number; items: TeamUpdateNotification[] }; children: ReactNode }) {
  const path = usePathname();
  const tech = user.role === "tech";
  const fleet = hasFleetAccess(user);
  const fleetItem: NavItem = { href: "/fleet", label: "Fleet", icon: "truck" };
  let items = [...NAV[user.role]];
  if (fleet) {
    if (tech) {
      const acc = items.findIndex((i) => i.href === "/account");
      items = acc >= 0 ? [...items.slice(0, acc), fleetItem, ...items.slice(acc)] : [...items, fleetItem];
    } else {
      const team = items.findIndex((i) => i.href === "/team");
      items = team >= 0 ? [...items.slice(0, team), fleetItem, ...items.slice(team)] : [...items, fleetItem];
    }
  }
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  // Staff bottom nav stays at 6 items (Fleet is desktop-sidebar + "Where's my crew"). Techs with access get Fleet in their shorter nav.
  const bottom: NavItem[] = tech ? items : [...items.filter((i) => i.href !== "/team" && i.href !== "/fleet" && i.href !== "/tasks" && i.href !== "/account"), { href: "/account", label: "More", icon: "user" }];
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
                {!!badges[i.href] && <span className="ml-auto min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold text-[#3b2600]" data-testid={`nav-badge-${i.href.slice(1)}`}>{badges[i.href]}</span>}
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
      {/* overflow-x-clip: last-resort guard so one stray wide element can never widen the phone layout viewport (clip, not hidden, keeps the sticky header working). */}
      <div className="flex min-w-0 flex-col overflow-x-clip" data-overflow-guard>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-3 backdrop-blur md:h-[60px] md:px-6">
          <div className={tech ? "" : "md:hidden"}><Logo compact /></div>
          <div className="min-w-0 flex-1 truncate font-semibold">{tech ? "RR Scheduler" : ""}</div>
          {!tech && (
            <Link href="/tasks" className="relative grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink md:hidden" aria-label="Tasks" data-testid="header-tasks">
              <Icon name="task" />
              {!!badges["/tasks"] && <span className="absolute top-0.5 right-0 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold text-[#3b2600]">{badges["/tasks"]}</span>}
            </Link>
          )}
          <NotificationBell unread={updateNotifications?.unread ?? 0} items={updateNotifications?.items ?? []} />
          <WorkspaceSearch />
          {mock && <span className="hidden sm:inline"><MockBadge /></span>}
          {roleSwitcher}
          <span className="hidden text-xs text-muted lg:inline">{ROLE_LABEL[user.role]}</span>
        </header>
        <main className={`w-full px-3 pt-4 pb-28 md:px-6 md:pt-6 ${tech ? "mx-auto max-w-[680px]" : "max-w-[1320px] md:pb-10"}`}>{children}</main>
      </div>
      <nav className={`fixed inset-x-0 bottom-0 z-40 flex justify-center border-t border-line bg-white px-1 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,.05)] ${tech ? "mx-auto max-w-[680px] rounded-t-2xl border-x" : "md:hidden"}`}>
        {bottom.map((i) => i.soon ? (
          <span key={i.href} className="flex max-w-24 min-w-0 flex-1 flex-col items-center gap-0.5 px-px py-1.5 text-[10px] min-[380px]:text-[11px] font-semibold text-slate-300" title="Coming in phase 2"><Icon name={i.icon} className="size-[22px] shrink-0" /><span className="max-w-full truncate">{i.label}</span></span>
        ) : (
          <Link key={i.href} href={i.href} className={`relative flex max-w-24 min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-px py-1.5 text-[10px] font-semibold min-[380px]:text-[11px] ${bottomActive(i.href) ? "bg-brand-50 text-brand" : "text-muted"}`}>
            <Icon name={i.icon} className="size-[22px] shrink-0" /><span className="max-w-full truncate">{i.short ?? i.label}</span>
            {!!badges[i.href] && <span className="absolute top-0.5 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-bold text-[#3b2600]">{badges[i.href]}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
