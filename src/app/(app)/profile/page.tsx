import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import stack from "@/components/ui/Stack.module.css";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DetailsForm, PasswordForm } from "./ProfileForms";

export const metadata: Metadata = { title: "פרופיל" };

// Notification preferences tab is added in Milestone 8.
const TABS = [
  { key: "details", href: "/profile", label: "פרטים אישיים" },
  { key: "password", href: "/profile?tab=password", label: "שינוי סיסמה" },
];

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const profile = await requireProfile();
  const { tab } = await searchParams;
  const current = tab === "password" ? "password" : "details";

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("phone").eq("id", profile.id).maybeSingle();

  return (
    <div className={stack.page}>
      <PageHeader title="פרופיל" />
      <Tabs label="הגדרות פרופיל" items={TABS} current={current} />
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
    </div>
  );
}
