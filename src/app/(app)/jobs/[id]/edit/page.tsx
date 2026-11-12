import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { dayKey, timeKey } from "@/lib/time";
import { JobForm } from "../../job-form";

export const metadata: Metadata = { title: "Edit visit" };

export default async function EditJobPage({ params }: PageProps<"/jobs/[id]/edit">) {
  await requireRole("admin", "manager");
  const { id } = await params;
  const repo = await getRepo();
  const [j, people] = await Promise.all([repo.getJob(id), repo.listAssignable()]);
  if (!j) notFound();
  const selected = { id: j.project_id, name: j.project_name, customer_name: j.customer_name, status: "in_progress" as const };
  return (
    <>
      <PageHeader back={{ href: `/jobs/${id}`, label: j.title }} title="Reschedule / reassign" sub={`${j.customer_name} · ${j.project_name}`} />
      <div className="max-w-3xl">
        <JobForm selected={selected} people={people} cancelHref={`/jobs/${id}`}
          d={{ id, project_id: j.project_id, title: j.title, date: dayKey(j.starts_at), start: timeKey(j.starts_at), end: timeKey(j.ends_at), assignees: j.assignees.map((a) => a.id), instructions: j.instructions ?? "" }} />
      </div>
    </>
  );
}
