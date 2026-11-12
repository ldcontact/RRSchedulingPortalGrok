import { ticketNo } from "@/lib/types";

export function requestLabel(id: string, number: number | null, summary: string | null) {
  return `${number != null ? ticketNo(number) : id}${summary ? ` · ${summary}` : ""}`;
}
