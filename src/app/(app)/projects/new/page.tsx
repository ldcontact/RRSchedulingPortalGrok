import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { formatAddress } from "@/lib/project-row";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  await requireRole("admin", "manager");
  const { customer } = await searchParams;
  const customerId = typeof customer === "string" && customer ? customer : undefined;
  const c = customerId ? await (await getRepo()).getCustomer(customerId) : null;
  const initialCustomer = c ? { id: c.id, name: c.name, address: formatAddress(c) } : null;
  return (
    <>
      <PageHeader back={{ href: "/projects", label: "Projects" }} title="New project" sub="Scope, value and rebate. Add the proposed timeline and visits next." />
      <div className="max-w-3xl"><ProjectForm initialCustomer={initialCustomer} customerId={customerId} /></div>
    </>
  );
}
