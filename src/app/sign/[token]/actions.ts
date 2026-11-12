"use server";

import { revalidatePath } from "next/cache";
import { getSalesRepo } from "@/lib/sales/repo";

export async function signProposalAction(token: string, fd: FormData) {
  const signerName = String(fd.get("signer_name") ?? "");
  const consent = fd.get("consent") === "yes";
  const method = fd.get("method") === "drawn" ? "drawn" as const : "typed" as const;
  try {
    await (await getSalesRepo()).signProposalByToken(token, { signerName, consent, method });
    revalidatePath(`/sign/${token}`);
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not sign." };
  }
}
