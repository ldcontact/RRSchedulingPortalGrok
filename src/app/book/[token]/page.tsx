import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/ui";
import { openSlots } from "@/lib/sales/booking";
import { getSalesRepo } from "@/lib/sales/repo";
import { BookForm } from "./book-form";

export const metadata: Metadata = { title: "Book an assessment" };

function upcomingDays(n = 10) {
  const days: string[] = [];
  const d = new Date();
  // Walk calendar days in America/Chicago by using noon UTC-6-ish dates.
  for (let i = 1; days.length < n && i < 21; i++) {
    const next = new Date(d);
    next.setDate(d.getDate() + i);
    const wd = next.getDay();
    if (wd === 0 || wd === 6) continue;
    days.push(next.toISOString().slice(0, 10));
  }
  return days;
}

export default async function BookPage({ params }: PageProps<"/book/[token]">) {
  const { token } = await params;
  const repo = await getSalesRepo();
  const deal = await repo.getDealByBookingToken(token);
  if (!deal) notFound();
  const days = upcomingDays();
  const occupied = await repo.listOccupiedWindows(`${days[0]}T00:00:00`, `${days.at(-1)}T23:59:59`);
  const slots = openSlots({ days, starts: [8, 10, 13], durationHours: 2, occupied });
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark className="h-10 w-auto" />
        <div>
          <div className="font-bold">Retrofit Rebates</div>
          <div className="text-sm text-muted">Book your home assessment</div>
        </div>
      </div>
      <div className="card p-6">
        <h1 className="text-xl font-semibold">{deal.title}</h1>
        <p className="mt-1 text-sm text-muted">Hi {deal.contact_name ?? "there"}. Pick a weekday window. These times already hide visits on the schedule.</p>
        <BookForm token={token} slots={slots} />
      </div>
    </main>
  );
}
