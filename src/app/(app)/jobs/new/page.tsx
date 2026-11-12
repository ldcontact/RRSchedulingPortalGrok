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
  const projectId = str("project");
  const customerId = str("customer") || undefined;
  const { people, selected } = await formOptions({ projectId });
  const start = /^\d{2}:\d{2}$/.test(str("start")) ? str("start") : "08:00";
  const endH = Math.min(23, Number(start.slice(0, 2)) + 4);
  return (
    <>
      <PageHeader back={selected ? { href: `/projects/${selected.id}`, label: selected.name } : { href: "/schedule", label: "Schedule" }}
        title="Schedule a visit" sub={selected ? `${selected.customer_name} · ${selected.name}` : "Pick the project, time and crew."} />
      <div className="max-w-3xl">
        <JobForm selected={selected} customerId={customerId} people={people} cancelHref={selected ? `/projects/${selected.id}` : "/schedule"}
          d={{ project_id: selected?.id ?? "", title: "", date: validDay(str("date")) ? str("date") : todayKey(), start, end: `${String(endH).padStart(2, "0")}:${start.slice(3)}`,
            assignees: str("tech") ? [str("tech")] : [], instructions: "" }} />
      </div>
    </>
  );
}
