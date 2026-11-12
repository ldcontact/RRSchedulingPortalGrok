import Link from "next/link";
import { PendingLink } from "@/components/pending-link";
import { Icon } from "@/components/icons";
import { Banner } from "@/components/ui";
import { AvatarStack, JobStatusPill, JobKindBadge } from "@/components/status";
import { isStaff, requireMember } from "@/lib/auth";
import { fleetScope } from "@/lib/geotab/access";
import { CrewCard } from "@/components/fleet/crew-card";
import { getRepo } from "@/lib/data/repo";
import { addDays, dayKey, fmtDateTime, fmtDay, fmtRange, todayKey, zonedToUtc } from "@/lib/time";
import { ComingUpList } from "@/components/coming-up-list";
import { TechJobCard } from "@/components/tech-job-card";
import type { JobView } from "@/lib/types";

function JobRow({ j, showCrew = true }: { j: JobView; showCrew?: boolean }) {
  return (
    <Link href={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafbf9]">
      <div className="w-[72px] shrink-0 text-[12px] font-semibold text-muted">{fmtRange(j.starts_at, j.ends_at)}</div>
      <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-1.5"><span className="min-w-0 truncate font-semibold">{j.title}</span><JobKindBadge kind={j.kind} size="sm" /></div><div className="truncate text-[12.5px] text-muted">{j.customer_name}</div></div>
      {showCrew && <AvatarStack people={j.assignees} max={3} />}
      <JobStatusPill status={j.status} />
    </Link>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await requireMember();
  const { denied } = await searchParams;
  const h = Number(new Date().toLocaleString("en-US", { timeZone: process.env.NEXT_PUBLIC_TZ || "America/Chicago", hour: "numeric", hourCycle: "h23" }));
  const greet = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const T = todayKey();
  const dateLine = fmtDay(T, { weekday: "long", month: "long", day: "numeric" });
  const deniedBanner = denied ? <div className="mb-4"><Banner tone="warn"><Icon name="shield" />That page isn&apos;t available for your role.</Banner></div> : null;
  const repo = await getRepo();

  if (!isStaff(user.role)) {
    // No upper date bound: Coming up lists every future assigned visit (jobs.starts_at index).
    // Look back 7 days so in-progress / recently submitted still appear in Today / Recently submitted.
    const jobs = (await repo.listJobs({ from: zonedToUtc(addDays(T, -7), 0), assignee: user.id })).filter((j) => j.status !== "cancelled");
    const sentBack = jobs.filter((j) => j.status === "in_progress" && j.review_note);
    const today = jobs.filter((j) => dayKey(j.starts_at) === T || (j.status === "in_progress" && dayKey(j.starts_at) < T));
    const upcoming = jobs
      .filter((j) => dayKey(j.starts_at) > T && j.status === "scheduled")
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const submitted = jobs.filter((j) => (j.status === "completed" || j.status === "approved") && dayKey(j.starts_at) < T);
    return (
      <>
        {deniedBanner}
        <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-900 to-brand p-5 text-white">
          <div className="text-[19px] font-semibold">Good {greet}, {user.name.split(" ")[0]}</div>
          <div className="text-sm text-[#b5d7d1]">{dateLine} · {today.length} job{today.length === 1 ? "" : "s"} today</div>
        </div>
        {sentBack.map((j) => (
          <Link key={j.id} href={`/jobs/${j.id}`} className="mb-3 block"><Banner tone="warn"><Icon name="undo" /><div><b>Sent back: {j.title}</b><div>{j.review_note}</div></div></Banner></Link>
        ))}
        <h2 className="mb-2 text-sm font-bold text-muted">Today</h2>
        <div className="mb-5 flex flex-col gap-3" data-testid="my-jobs-today">
          {!today.length && <div className="card p-6 text-center text-sm text-muted">No jobs today.</div>}
          {today.map((j) => <TechJobCard key={j.id} j={j} />)}
        </div>
        <h2 className="mb-2 text-sm font-bold text-muted">Coming up</h2>
        <div className="mb-5" data-testid="my-jobs-upcoming">
          <ComingUpList jobs={upcoming} />
        </div>
        {submitted.length > 0 && (<>
          <h2 className="mb-2 text-sm font-bold text-muted">Recently submitted</h2>
          <div className="card divide-y divide-line">{submitted.map((j) => <JobRow key={j.id} j={j} showCrew={false} />)}</div>
        </>)}
      </>
    );
  }

  const [c, review, today, openSr] = await Promise.all([
    repo.counts(), repo.listJobs({ status: ["completed"] }), repo.listJobs({ from: zonedToUtc(T, 0), to: zonedToUtc(addDays(T, 1), 0) }),
    repo.countOpenServiceRequests().catch(() => 0),
  ]);
  const stat = (n: number | string, label: string, icon: string, href: string, tone: string, className = "", testId?: string) => (
    <Link href={href} className={`card p-4 hover:border-[#bcc6bb] ${className}`} {...(testId ? { "data-testid": testId } : {})}>
      <div className={`mb-2 grid size-8 place-items-center rounded-lg ${tone}`}><Icon name={icon} /></div>
      <div className="text-[26px] font-bold tracking-tight">{n}</div><div className="text-[12.5px] font-medium text-muted">{label}</div>
    </Link>
  );
  const todays = today.filter((j) => j.status !== "cancelled");
  return (
    <>
      {deniedBanner}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="text-[22px] font-semibold tracking-tight">Good {greet}, {user.name.split(" ")[0]}</h1><div className="text-muted">{dateLine}</div></div>
        <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:flex-nowrap">
          <PendingLink href="/jobs/new" className="btn btn-primary w-full lg:w-auto"><Icon name="plus" />New visit</PendingLink>
          <PendingLink href="/projects/new" className="btn w-full lg:w-auto"><Icon name="plus" />New project</PendingLink>
          <PendingLink href="/customers/new" className="btn w-full lg:w-auto"><Icon name="plus" />Customer</PendingLink>
          <PendingLink href="/service-requests?new=1" className="btn w-full lg:w-auto" data-testid="home-new-service-request"><Icon name="wrench" />Service request</PendingLink>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="dashboard-counts">
        {stat(c.jobsToday, "Visits today", "calendar", `/schedule?view=day&date=${T}`, "bg-sky-100 text-sky-700")}
        {stat(c.awaitingReview, "Awaiting review", "flag", "#review", "bg-violet-100 text-violet-700")}
        {stat(c.activeProjects, "Active projects", "briefcase", "/projects", "bg-brand-50 text-brand")}
        {stat(c.proposed, "Proposals out", "send", "/projects?status=proposed", "bg-accent-50 text-amber-700")}
        {stat(openSr, "Open service requests", "wrench", "/service-requests", "bg-orange-50 text-orange-800", "col-span-2 lg:col-span-1", "home-open-service-requests")}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="card min-w-0" id="review" data-testid="awaiting-review">
          <div className="card-hd"><h3 className="min-w-0 truncate font-semibold">Awaiting your review</h3><span className="pill shrink-0 bg-violet-100 text-violet-800">{review.length}</span></div>
          <div className="divide-y divide-line">
            {!review.length && <div className="p-6 text-center text-sm text-muted">All caught up.</div>}
            {review.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafbf9]">
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">{j.title}</div><div className="truncate text-[12.5px] text-muted">{j.customer_name} · submitted {j.completed_at ? fmtDateTime(j.completed_at) : ""}</div></div>
                <AvatarStack people={j.assignees} max={3} /><span className="btn btn-sm shrink-0">Review</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card min-w-0">
          <div className="card-hd"><h3 className="min-w-0 truncate font-semibold">Today&apos;s visits</h3><Link href={`/schedule?view=day&date=${T}`} className="shrink-0 text-xs font-semibold whitespace-nowrap text-brand">Dispatch board</Link></div>
          <div className="divide-y divide-line">
            {!todays.length && <div className="p-6 text-center text-sm text-muted">No visits today.</div>}
            {todays.map((j) => <JobRow key={j.id} j={j} />)}
          </div>
        </div>
      </div>
      {fleetScope(user) === "all" && <div className="mt-4"><CrewCard /></div>}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(c.customers, "Customers", "users", "/customers", "bg-brand-50 text-brand")}
        {stat(c.team, "Active team members", "hardhat", "/team", "bg-violet-100 text-violet-700")}
        {user.role === "admin" && stat(c.invited, "Invites pending", "send", "/team", "bg-accent-50 text-amber-700")}
      </div>
    </>
  );
}
