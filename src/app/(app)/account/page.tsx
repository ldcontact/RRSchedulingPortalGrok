import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Avatar, PageHeader, RolePill } from "@/components/ui";
import { isStaff, requireMember } from "@/lib/auth";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const u = await requireMember();
  return (
    <>
      <PageHeader title={u.role === "tech" ? "Profile" : "Account"} />
      <div className="card mb-4 flex flex-col items-center gap-2 p-6 text-center">
        <Avatar name={u.name} color={u.color} size="lg" />
        <div className="text-lg font-semibold">{u.name}</div>
        <div className="text-sm text-muted">{u.email}</div>
        <RolePill role={u.role} />
      </div>
      <div className="card divide-y divide-line">
        {isStaff(u.role) && <Link href="/team" className="flex items-center gap-3 px-5 py-3.5 font-semibold hover:bg-[#fafbf9]"><Icon name="hardhat" />Team<Icon name="right" className="ml-auto size-4 text-muted" /></Link>}
        <Link href="/account/password" className="flex items-center gap-3 px-5 py-3.5 font-semibold hover:bg-[#fafbf9]"><Icon name="lock" />Set or change password<Icon name="right" className="ml-auto size-4 text-muted" /></Link>
        <form action="/auth/signout" method="post"><button className="flex w-full items-center gap-3 px-5 py-3.5 text-left font-semibold hover:bg-[#fafbf9]"><Icon name="logout" />Sign out</button></form>
      </div>
    </>
  );
}
