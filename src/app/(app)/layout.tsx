import { AppShell } from "@/components/app-shell";
import { MockRoleSwitcher } from "@/components/mock-role-switcher";
import { isStaff, requireMember } from "@/lib/auth";
import { getRepo } from "@/lib/data/repo";
import { MOCK_MODE } from "@/lib/env";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireMember();
  const switcher = MOCK_MODE ? <MockRoleSwitcher profiles={(await import("@/lib/data/mock-repo")).mockProfiles()} current={user.id} /> : undefined;
  // open tickets badge (staff only; techs never see the Service requests inbox)
  const open = isStaff(user.role) ? await (await getRepo()).countOpenServiceRequests().catch(() => 0) : 0;
  return <AppShell user={user} mock={MOCK_MODE} roleSwitcher={switcher} badges={{ "/service-requests": open }}>{children}</AppShell>;
}
