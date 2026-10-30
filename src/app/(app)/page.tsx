import Link from "next/link";
import { Icon } from "@/components/icons";
import { Banner } from "@/components/ui";
import { AvatarStack, JobStatusPill } from "@/components/status";
import { isStaff, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { addDays, dayKey, fmtDateTime, fmtDay, fmtRange, todayKey, zonedToUtc } from "@/lib/time";
import type { JobView } from "@/lib/types";

function JobRow({ j, showCrew = true }: { j: JobView; showCrew?: boolean }) {
  return (
    <Link href={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafbf9]">
      <div className="w-[72px] text-[12px] font-semibold text-muted">{fmtRange(j.starts_at, j.ends_at)}</div>
      <div className="min-w-0 flex-1"><div className="truncate font-semibold">{j.title}</div><div className="truncate text-[12.5px] text-muted">{j.customer_name}</div></div>
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
    const jobs = (await repo.listJobs({ from: zonedToUtc(addDays(T, -7), 0), to: zonedToUtc(addDays(T, 15), 0), assignee: user.id })).filter((j) => j.status !== "cancelled");
    const sentBack = jobs.filter((j) => j.status === "in_progress" && j.review_note);
    const today = jobs.filter((j) => dayKey(j.starts_at) === T || (j.status === "in_progress" && dayKey(j.starts_at) < T));
    const upcoming = jobs.filter((j) => dayKey(j.starts_at) > T && j.status === "scheduled");
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
          {today.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="card block p-4 active:bg-[#fafbf9]">
              <div className="flex items-start justify-between gap-2"><div className="text-[13px] font-semibold text-muted">{fmtRange(j.starts_at, j.ends_at)}</div><JobStatusPill status={j.status} /></div>
              <div className="mt-1 text-[16px] font-semibold">{j.title}</div>
              <div className="text-sm text-muted">{j.customer_name}</div>
              {j.address && <div className="mt-1 flex items-center gap-1.5 text-[13px] text-muted"><Icon name="pin" className="size-3.5" />{j.address}</div>}
              <div className="mt-3 flex items-center justify-between"><AvatarStack people={j.assignees} /><span className="flex items-center gap-1 text-sm font-semibold text-brand">{j.status === "scheduled" ? "Open & start" : j.status === "in_progress" ? "Continue" : "View"}<Icon name="right" className="size-4" /></span></div>
            </Link>
          ))}
        </div>
        <h2 className="mb-2 text-sm font-bold text-muted">Coming up</h2>
        <div className="card mb-5 divide-y divide-line">
          {!upcoming.length && <div className="p-4 text-center text-sm text-muted">Nothing else scheduled in the next two weeks.</div>}
          {upcoming.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3">
              <div className="w-20 text-[12px]"><div className="font-semibold">{fmtDay(dayKey(j.starts_at))}</div><div className="text-muted">{fmtRange(j.starts_at, j.ends_at)}</div></div>
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{j.title}</div><div className="truncate text-[12.5px] text-muted">{j.customer_name}</div></div>
              <Icon name="right" className="size-4 text-muted" />
            </Link>
          ))}
        </div>
        {submitted.length > 0 && (<>
          <h2 className="mb-2 text-sm font-bold text-muted">Recently submitted</h2>
          <div className="card divide-y divide-line">{submitted.map((j) => <JobRow key={j.id} j={j} showCrew={false} />)}</div>
        </>)}
      </>
    );
  }

  const [c, review, today] = await Promise.all([
    repo.counts(), repo.listJobs({ status: ["completed"] }), repo.listJobs({ from: zonedToUtc(T, 0), to: zonedToUtc(addDays(T, 1), 0) }),
  ]);
  const stat = (n: number | string, label: string, icon: string, href: string, tone: string) => (
    <Link href={href} className="card p-4 hover:border-[#bcc6bb]">
      <div className={`mb-2 grid size-8 place-items-center rounded-lg ${tone}`}><Icon name={icon} /></div>
      <div className="text-[26px] font-bold tracking-tight">{n}</div><div className="text-[12.5px] font-medium text-muted">{label}</div>
    </Link>
  );
  const todays = today.filter((j) => j.status !== "cancelled");
  return (
    <>
      {deniedBanner}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-[22px] font-semibold tracking-tight">Good {greet}, {user.name.split(" ")[0]}</h1><div className="text-muted">{dateLine}</div></div>
        <div className="flex flex-wrap gap-2"><Link href="/jobs/new" className="btn btn-primary"><Icon name="plus" />New visit</Link><Link href="/projects/new" className="btn"><Icon name="plus" />New project</Link><Link href="/customers/new" className="btn"><Icon name="plus" />Customer</Link></div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dashboard-counts">
        {stat(c.jobsToday, "Visits today", "calendar", `/schedule?view=day&date=${T}`, "bg-sky-100 text-sky-700")}
        {stat(c.awaitingReview, "Awaiting review", "flag", "#review", "bg-violet-100 text-violet-700")}
        {stat(c.activeProjects, "Active projects", "briefcase", "/projects", "bg-brand-50 text-brand")}
        {stat(c.proposed, "Proposals out", "send", "/projects?status=proposed", "bg-accent-50 text-amber-700")}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="card" id="review" data-testid="awaiting-review">
          <div className="card-hd"><h3 className="font-semibold">Awaiting your review</h3><span className="pill bg-violet-100 text-violet-800">{review.length}</span></div>
          <div className="divide-y divide-line">
            {!review.length && <div className="p-6 text-center text-sm text-muted">All caught up.</div>}
            {review.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafbf9]">
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">{j.title}</div><div className="truncate text-[12.5px] text-muted">{j.customer_name} · submitted {j.completed_at ? fmtDateTime(j.completed_at) : ""}</div></div>
                <AvatarStack people={j.assignees} max={3} /><span className="btn btn-sm">Review</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><h3 className="font-semibold">Today&apos;s visits</h3><Link href={`/schedule?view=day&date=${T}`} className="text-xs font-semibold text-brand">Dispatch board</Link></div>
          <div className="divide-y divide-line">
            {!todays.length && <div className="p-6 text-center text-sm text-muted">No visits today.</div>}
            {todays.map((j) => <JobRow key={j.id} j={j} />)}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat(c.customers, "Customers", "users", "/customers", "bg-brand-50 text-brand")}
        {stat(c.team, "Active team members", "hardhat", "/team", "bg-violet-100 text-violet-700")}
        {user.role === "admin" && stat(c.invited, "Invites pending", "send", "/team", "bg-accent-50 text-amber-700")}
      </div>
    </>
  );
}
