import { AppShell } from "@/components/app-shell";
import { MockRoleSwitcher } from "@/components/mock-role-switcher";
import { requireMember } from "@/lib/auth";
import { MOCK_MODE } from "@/lib/env";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireMember();
  const switcher = MOCK_MODE ? <MockRoleSwitcher profiles={(await import("@/lib/data/mock-repo")).mockProfiles()} current={user.id} /> : undefined;
  return <AppShell user={user} mock={MOCK_MODE} roleSwitcher={switcher}>{children}</AppShell>;
}
