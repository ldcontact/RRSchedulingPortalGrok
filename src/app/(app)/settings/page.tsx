import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { MOCK_MODE } from "@/lib/env";

export default async function SettingsPage() {
  await requireRole("admin", "manager");
  if (!MOCK_MODE) redirect("/account");
  redirect("/settings/integrations");
}
