import type { Metadata } from "next";
import { AvailabilityPanel } from "@/components/availability/AvailabilityPanel";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import { loadTeacherAvailability } from "@/lib/availability/queries";
import { requireActiveTeacher } from "@/lib/students/teacher";

export const metadata: Metadata = { title: "הזמינות שלי" };

const LIVE_TABLES = ["teacher_availability", "availability_requests", "teacher_absences", "operating_hours", "school_closures"];

export default async function MyAvailabilityPage() {
  const { supabase, teacherId } = await requireActiveTeacher();
  if (!teacherId) {
    return (
      <div className={stack.page}>
        <PageHeader title="הזמינות שלי" />
        <Alert tone="error">לא נמצאו פרטי המורה שלך. פנו למנהל.</Alert>
      </div>
    );
  }
  const data = await loadTeacherAvailability(supabase, teacherId);

  return (
    <div className={stack.page}>
      <LiveRefresh tables={LIVE_TABLES} />
      <PageHeader
        title="הזמינות שלי"
        subtitle="הוספת זמינות נכנסת לתוקף מיד. הסרת זמינות והיעדרות נכנסות לתוקף רק אחרי אישור מנהל."
      />
      <AvailabilityPanel mode="teacher" teacherId={teacherId} data={data} />
    </div>
  );
}
