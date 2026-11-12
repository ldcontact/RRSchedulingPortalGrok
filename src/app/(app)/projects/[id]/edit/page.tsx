import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { formatAddress } from "@/lib/project-row";
import { ProjectForm } from "../../project-form";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  await requireRole("admin", "manager");
  const { id } = await params;
  const repo = await getRepo();
  const p = await repo.getProject(id);
  if (!p) notFound();
  const c = await repo.getCustomer(p.customer_id);
  const initialCustomer = c ? { id: c.id, name: c.name, address: formatAddress(c) } : null;
  return (
    <>
      <PageHeader back={{ href: `/projects/${id}`, label: p.name }} title="Edit project" />
      <div className="min-w-0 max-w-3xl"><ProjectForm project={p} initialCustomer={initialCustomer} /></div>
    </>
  );
}
