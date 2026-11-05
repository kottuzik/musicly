import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import stack from "@/components/ui/Stack.module.css";
import { TeachingCard } from "@/components/teaching/TeachingCard";
import { ROLE_LABELS, isAdminRole } from "@/lib/auth/roles";
import { getTeachingId, requireProfile } from "@/lib/auth/session";
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

  const isAdmin = isAdminRole(profile.role);
  const teaches = isAdmin && Boolean(await getTeachingId());
  const isTeacher = profile.role === "teacher" || teaches;
  const [{ data: lessonTypes }, { data: teachingRow }] =
    isAdmin && current === "details"
      ? await Promise.all([
          supabase.from("lesson_types").select("id, name, color").order("name"),
          supabase.from("teachers").select("id, teacher_skills(lesson_type_id)").eq("profile_id", profile.id).maybeSingle(),
        ])
      : [{ data: null }, { data: null }];
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
      {isAdmin && current === "details" && (
        <TeachingCard
          profileId={profile.id}
          teaching={teaches}
          teacherId={teachingRow?.id ?? null}
          lessonTypes={lessonTypes ?? []}
          selected={(teachingRow?.teacher_skills ?? []).map((s) => s.lesson_type_id)}
        />
      )}
    </div>
  );
}
