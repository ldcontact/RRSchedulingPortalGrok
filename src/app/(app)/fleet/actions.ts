"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { parseFleetAssignee } from "@/lib/geotab/assign";

export async function setFleetMapping(fd: FormData) {
  await requireRole("admin");
  const geotab_device_id = String(fd.get("geotab_device_id") ?? "").trim();
  if (!geotab_device_id) return;
  const labelRaw = String(fd.get("label") ?? "").trim();
  const assigneeRaw = String(fd.get("assignee") ?? fd.get("profile_id") ?? "");
  const assignee = parseFleetAssignee(assigneeRaw);
  await (await getRepo()).setFleetVehicleMapping(geotab_device_id, {
    label: labelRaw || null,
    profile_id: assignee.profile_id,
    invite_email: assignee.invite_email,
  });
  revalidatePath("/fleet");
  revalidatePath("/team");
}

export async function setFleetAccess(email: string, access: boolean) {
  await requireRole("admin");
  if (!email) return;
  await (await getRepo()).setFleetAccess(email, access);
  revalidatePath("/team");
  revalidatePath("/fleet");
  revalidatePath("/");
  revalidatePath("/schedule");
}
