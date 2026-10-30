import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  await requireRole("admin", "manager");
  return (<><PageHeader title="Add customer" back={{ href: "/customers", label: "Customers" }} /><div className="max-w-3xl"><CustomerForm /></div></>);
}
