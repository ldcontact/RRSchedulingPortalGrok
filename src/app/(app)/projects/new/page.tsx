import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  await requireRole("admin", "manager");
  const { customer } = await searchParams;
  const customers = await (await getRepo()).listCustomers();
  return (
    <>
      <PageHeader back={{ href: "/projects", label: "Projects" }} title="New project" sub="Scope, value and rebate. Add the proposed timeline and visits next." />
      <div className="max-w-3xl"><ProjectForm customers={customers} customerId={typeof customer === "string" ? customer : undefined} /></div>
    </>
  );
}
