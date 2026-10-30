import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { CustomerForm } from "../../customer-form";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  await requireRole("admin", "manager");
  const { id } = await params;
  const customer = await (await getRepo()).getCustomer(id);
  if (!customer) notFound();
  return (<><PageHeader title={`Edit ${customer.name}`} back={{ href: `/customers/${id}`, label: customer.name }} /><div className="max-w-3xl"><CustomerForm customer={customer} /></div></>);
}
