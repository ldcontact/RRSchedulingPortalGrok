import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { ProjectForm } from "../../project-form";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  await requireRole("admin", "manager");
  const { id } = await params;
  const repo = await getRepo();
  const [p, customers] = await Promise.all([repo.getProject(id), repo.listCustomers()]);
  if (!p) notFound();
  return (
    <>
      <PageHeader back={{ href: `/projects/${id}`, label: p.name }} title="Edit project" />
      <div className="max-w-3xl"><ProjectForm project={p} customers={customers} /></div>
    </>
  );
}
