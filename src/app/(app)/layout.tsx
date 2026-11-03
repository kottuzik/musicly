import { AppShell } from "@/components/nav/AppShell";
import { requireProfile } from "@/lib/auth/session";
import { unreadNotificationCount } from "@/lib/notifications/queries";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The unread count does not depend on the profile, so both are fetched together.
  const [profile, unread] = await Promise.all([requireProfile(), createClient().then(unreadNotificationCount)]);
  return (
    <AppShell profile={profile} unread={unread}>
      {children}
    </AppShell>
  );
}
