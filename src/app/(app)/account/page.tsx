import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Avatar, PageHeader, RolePill } from "@/components/ui";
import { AvatarEditor } from "@/components/avatar-editor";
import { isStaff, requireMember } from "@/lib/auth";
import { manageOwnAvatar, setOwnTeamSmsPrefAction } from "./actions";
import { getRepo } from "@/lib/data/repo";
import { TeamSmsSwitches } from "@/components/team/team-sms-switches";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const u = await requireMember();
  const profile = await (await getRepo()).getProfile(u.id);
  const smsMember = profile ? {
    email: profile.email,
    phone: profile.phone,
    sms_notify_assignment: profile.sms_notify_assignment,
    sms_notify_same_day: profile.sms_notify_same_day,
    sms_notify_morning: profile.sms_notify_morning,
    sms_stopped_at: profile.sms_stopped_at,
  } : null;
  return (
    <>
      <PageHeader title={u.role === "tech" ? "Profile" : "Account"} />
      <div className="card mb-4 flex flex-col items-center gap-3 p-6 text-center">
        <Avatar name={u.name} color={u.color} size="lg" src={u.avatar_url} />
        <div className="text-lg font-semibold">{u.name}</div>
        <div className="text-sm text-muted">{u.email}</div>
        <RolePill role={u.role} />
      </div>
      <div className="card mb-4 p-5">
        <h3 className="mb-3 font-semibold">Profile photo</h3>
        <AvatarEditor
          name={u.name}
          color={u.color}
          src={u.avatar_url}
          source={u.avatar_source}
          hasGoogle={!!u.google_avatar_url}
          action={manageOwnAvatar}
        />
      </div>
      {smsMember && (
        <div className="card mb-4 p-5">
          <h3 className="mb-3 font-semibold">Texting</h3>
          <TeamSmsSwitches member={smsMember} action={setOwnTeamSmsPrefAction} self />
        </div>
      )}
      <div className="card divide-y divide-line">
        {isStaff(u.role) && <Link href="/team" className="flex items-center gap-3 px-5 py-3.5 font-semibold hover:bg-[#fafbf9]"><Icon name="hardhat" />Team<Icon name="right" className="ml-auto size-4 text-muted" /></Link>}
        <Link href="/account/password" className="flex items-center gap-3 px-5 py-3.5 font-semibold hover:bg-[#fafbf9]"><Icon name="lock" />Set or change password<Icon name="right" className="ml-auto size-4 text-muted" /></Link>
        <form action="/auth/signout" method="post"><button className="flex w-full items-center gap-3 px-5 py-3.5 text-left font-semibold hover:bg-[#fafbf9]"><Icon name="logout" />Sign out</button></form>
      </div>
    </>
  );
}
