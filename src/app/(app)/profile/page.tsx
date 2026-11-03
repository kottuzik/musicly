import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import stack from "@/components/ui/Stack.module.css";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireProfile } from "@/lib/auth/session";
import { loadChannel, loadReminderSettings } from "@/lib/notifications/queries";
import { createClient } from "@/lib/supabase/server";
import { DetailsForm, PasswordForm } from "./ProfileForms";
import { ChannelForm, ReminderForm } from "./PreferencesForms";

export const metadata: Metadata = { title: "פרופיל" };

const TABS = [
  { key: "details", href: "/profile", label: "פרטים אישיים" },
  { key: "preferences", href: "/profile?tab=preferences", label: "העדפות" },
  { key: "password", href: "/profile?tab=password", label: "שינוי סיסמה" },
];

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const profile = await requireProfile();
  const { tab } = await searchParams;
  const current = tab === "password" ? "password" : tab === "preferences" ? "preferences" : "details";

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("phone").eq("id", profile.id).maybeSingle();

  const isTeacher = profile.role === "teacher";
  const [channel, reminders] =
    current === "preferences"
      ? await Promise.all([loadChannel(supabase, profile.id), isTeacher ? loadReminderSettings(supabase) : null])
      : [null, null];

  return (
    <div className={stack.page}>
      <PageHeader title="פרופיל" />
      <Tabs label="הגדרות פרופיל" items={TABS} current={current} />
      {current === "preferences" ? (
        <>
          <Card>
            <h2 className={`text-h3 ${stack.sectionTitle}`}>התראות</h2>
            <ChannelForm channel={channel ?? "in_app"} email={profile.email} readOnly={profile.status !== "active"} />
          </Card>
          {isTeacher && profile.status === "active" && reminders && (
            <Card>
              <h2 className={`text-h3 ${stack.sectionTitle}`}>תזכורות לשיעורים</h2>
              <ReminderForm enabled={reminders.enabled} offsets={reminders.offsets} />
            </Card>
          )}
        </>
      ) : (
        <Card>
          {current === "details" ? (
            <DetailsForm
              details={{
                fullName: profile.full_name,
                email: profile.email,
                phone: data?.phone ?? "",
                roleLabel: ROLE_LABELS[profile.role],
                readOnly: profile.status !== "active",
              }}
            />
          ) : (
            <PasswordForm email={profile.email} />
          )}
        </Card>
      )}
    </div>
  );
}
