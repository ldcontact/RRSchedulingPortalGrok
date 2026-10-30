import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth-layout";
import { Icon } from "@/components/icons";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Not invited yet" };

export default async function NotInvitedPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role) redirect("/");
  return (
    <AuthLayout>
      <div className="grid size-12 place-items-center rounded-xl bg-accent-50 text-amber-700"><Icon name="shield" className="size-6" /></div>
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">{user.active ? "You're not on the team list yet" : "Your access is paused"}</h1>
        <p className="mt-2 text-muted">You&apos;re signed in as <b className="text-ink">{user.email}</b>, but {user.active ? "this email hasn't been added to RR Scheduler yet" : "an admin has deactivated this account"}.</p>
        <p className="mt-2 text-muted">Ask a Retrofit Rebates admin to add this exact email on the Team page. Once they do, refresh this page.</p>
      </div>
      <div className="flex gap-2">
        <a href="/not-invited" className="btn">Refresh</a>
        <form action="/auth/signout" method="post"><button className="btn btn-primary"><Icon name="logout" />Use a different account</button></form>
      </div>
    </AuthLayout>
  );
}
