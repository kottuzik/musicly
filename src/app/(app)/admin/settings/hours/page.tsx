import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "../SettingsTabs";
import { OperatingHoursForm } from "./OperatingHoursForm";

export const metadata: Metadata = { title: "שעות פעילות" };

export default async function OperatingHoursPage() {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { data: hours } = await supabase.from("operating_hours").select("day_of_week, open_time, close_time").order("day_of_week");

  return (
    <div className={stack.page}>
      <PageHeader title="הגדרות" />
      <SettingsTabs current="hours" />
      <PageHeader
        level={2}
        title="שעות פעילות"
        subtitle="סמנו את הימים שבהם בית הספר פתוח וקבעו לכל יום שעת פתיחה וסגירה. מורים יכולים להגדיר זמינות רק בתוך השעות האלה."
      />
      {!hours?.length && <Alert tone="info">עדיין לא הוגדרו שעות פעילות — כל הימים סגורים.</Alert>}
      <Card>
        <OperatingHoursForm hours={hours ?? []} />
      </Card>
    </div>
  );
}
