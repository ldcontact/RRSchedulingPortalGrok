import { APPROVED_SLUG } from "./catalog";
import type { SalesProposal, SalesProposalItem } from "./types";

export function proposalNet(items: Pick<SalesProposalItem, "amount">[]): number {
  return items.reduce((s, i) => s + i.amount, 0);
}

export type SignInput = {
  proposal: SalesProposal;
  dealStage: string;
  signerName: string;
  consent: boolean;
  method: "typed" | "drawn";
  now?: Date;
};

export type SignResult =
  | { ok: false; error: string }
  | { ok: true; signedAt: string; nextStage: string | null; audit: Record<string, unknown> };

export function signProposal(input: SignInput): SignResult {
  const name = input.signerName.trim();
  if (!name) return { ok: false, error: "Type your name to sign." };
  if (!input.consent) return { ok: false, error: "Agree that this is your electronic signature." };
  if (input.proposal.status === "signed") return { ok: false, error: "This proposal is already signed." };
  if (input.proposal.status === "void") return { ok: false, error: "This proposal is void." };
  const signedAt = (input.now ?? new Date()).toISOString();
  const nextStage = input.dealStage === APPROVED_SLUG || input.dealStage === "project_scheduled" || input.dealStage === "project_completed"
    ? null
    : APPROVED_SLUG;
  return {
    ok: true,
    signedAt,
    nextStage,
    audit: {
      signer_name: name,
      method: input.method,
      consent: true,
      signed_at: signedAt,
    },
  };
}
