"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";

export async function setFleetMapping(fd: FormData) {
  await requireRole("admin");
  const geotab_device_id = String(fd.get("geotab_device_id") ?? "").trim();
  if (!geotab_device_id) return;
  const labelRaw = String(fd.get("label") ?? "").trim();
  const profileRaw = String(fd.get("profile_id") ?? "").trim();
  await (await getRepo()).setFleetVehicleMapping(geotab_device_id, {
    label: labelRaw || null,
    profile_id: profileRaw || null,
  });
  revalidatePath("/fleet");
  revalidatePath("/team");
}

export async function setFleetAccess(profileId: string, access: boolean) {
  await requireRole("admin");
  if (!profileId) return;
  await (await getRepo()).setFleetAccess(profileId, access);
  revalidatePath("/team");
  revalidatePath("/fleet");
  revalidatePath("/");
  revalidatePath("/schedule");
}
