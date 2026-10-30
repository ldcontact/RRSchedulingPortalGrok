import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { todayKey, validDay } from "@/lib/time";
import { JobForm } from "../job-form";
import { formOptions } from "../load-form";

export const metadata: Metadata = { title: "Schedule visit" };

export default async function NewJobPage({ searchParams }: PageProps<"/jobs/new">) {
  await requireRole("admin", "manager");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const { projects, people } = await formOptions();
  const project = projects.find((p) => p.id === str("project"));
  const start = /^\d{2}:\d{2}$/.test(str("start")) ? str("start") : "08:00";
  const endH = Math.min(23, Number(start.slice(0, 2)) + 4);
  return (
    <>
      <PageHeader back={project ? { href: `/projects/${project.id}`, label: project.name } : { href: "/schedule", label: "Schedule" }}
        title="Schedule a visit" sub={project ? `${project.customer_name} · ${project.name}` : "Pick the project, time and crew."} />
      <div className="max-w-3xl">
        <JobForm projects={projects} people={people} cancelHref={project ? `/projects/${project.id}` : "/schedule"}
          d={{ project_id: project?.id ?? "", title: "", date: validDay(str("date")) ? str("date") : todayKey(), start, end: `${String(endH).padStart(2, "0")}:${start.slice(3)}`,
            assignees: str("tech") ? [str("tech")] : [], instructions: "" }} />
      </div>
    </>
  );
}
