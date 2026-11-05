import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { AppShell } from "@/components/nav/AppShell";
import { assistantConfigured } from "@/lib/assistant/provider";
import { isAdminRole } from "@/lib/auth/roles";
import { getTeachingId, requireProfile } from "@/lib/auth/session";
import { unreadNotificationCount } from "@/lib/notifications/queries";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The unread count does not depend on the profile, so both are fetched together.
  const [profile, unread] = await Promise.all([requireProfile(), createClient().then(unreadNotificationCount)]);
  return (
    <AppShell profile={profile} unread={unread} teaches={isAdminRole(profile.role) && Boolean(await getTeachingId())}>
      {children}
      {isAdminRole(profile.role) && assistantConfigured() && <AssistantWidget />}
    </AppShell>
  );
}
