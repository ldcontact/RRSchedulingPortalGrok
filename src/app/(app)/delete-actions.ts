"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDeleteAccess, requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { customerDeleteBlockers } from "@/lib/delete-access";

function ok(path: string, message: string): never {
  redirect(`${path}?ok=${encodeURIComponent(message)}`);
}

export async function deleteProjectAction(id: string) {
  await requireDeleteAccess();
  if (!id) redirect("/projects");
  await (await getRepo()).deleteProject(id);
  revalidatePath("/projects");
  revalidatePath("/schedule");
  revalidatePath("/service-requests");
  revalidatePath("/");
  ok("/projects", "Project deleted.");
}

export async function deleteVisitAction(id: string) {
  await requireDeleteAccess();
  if (!id) redirect("/schedule");
  await (await getRepo()).deleteJob(id);
  revalidatePath("/schedule");
  revalidatePath("/projects");
  revalidatePath("/service-requests");
  revalidatePath("/");
  ok("/schedule", "Visit deleted.");
}

export async function deleteCustomerAction(id: string) {
  await requireDeleteAccess();
  if (!id) redirect("/customers");
  const repo = await getRepo();
  const deps = await repo.countCustomerDependents(id);
  const blocked = customerDeleteBlockers(deps);
  if (blocked) redirect(`/customers/${id}?delete=1&error=${encodeURIComponent(blocked)}`);
  await repo.deleteCustomer(id);
  revalidatePath("/customers");
  revalidatePath("/");
  ok("/customers", "Customer deleted.");
}

export async function deleteServiceRequestAction(id: string) {
  await requireDeleteAccess();
  if (!id) redirect("/service-requests");
  await (await getRepo()).deleteServiceRequest(id);
  revalidatePath("/service-requests");
  revalidatePath("/schedule");
  revalidatePath("/projects");
  revalidatePath("/");
  ok("/service-requests", "Service request deleted.");
}

export async function setDeleteAccess(profileId: string, access: boolean) {
  await requireRole("admin");
  if (!profileId) return;
  await (await getRepo()).setDeleteAccess(profileId, access);
  revalidatePath("/team");
}
