"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import type { AvatarSource } from "@/lib/types";

export async function manageOwnAvatar(fd: FormData): Promise<{ error?: string; ok?: string }> {
  await requireMember();
  const repo = await getRepo();
  try {
    if (fd.get("clear") === "1") {
      await repo.updateOwnAvatar({ clear: true });
      revalidatePath("/account");
      return { ok: "Photo removed." };
    }
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) return { error: "Not an image." };
      if (file.size > 5 * 1024 * 1024) return { error: "Image must be under 5 MB." };
      await repo.updateOwnAvatar({ file });
      revalidatePath("/account");
      return { ok: "Photo uploaded." };
    }
    const source = String(fd.get("avatar_source") ?? "").trim() as AvatarSource;
    if (source === "google" || source === "none" || source === "upload") {
      await repo.updateOwnAvatar({ avatar_source: source });
      revalidatePath("/account");
      return { ok: source === "google" ? "Using Google photo." : "Avatar updated." };
    }
    return { error: "Nothing to update." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}


export async function setOwnTeamSmsPrefAction(fd: FormData) {
  const me = await requireMember();
  const flag = String(fd.get("flag") ?? "").trim();
  const on = String(fd.get("value") ?? "") === "on";
  if (!["sms_notify_assignment", "sms_notify_same_day", "sms_notify_morning"].includes(flag)) return;
  await (await getRepo()).setTeamSmsPrefs(me.email, { [flag]: on });
  revalidatePath("/account");
  revalidatePath("/team");
}
