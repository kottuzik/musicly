import { AppShell } from "@/components/nav/AppShell";
import { requireProfile } from "@/lib/auth/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  return <AppShell profile={profile}>{children}</AppShell>;
}
