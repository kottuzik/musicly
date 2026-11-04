import type { Metadata } from "next";
import { ExceptionRequestsTable } from "@/components/lessons/ExceptionRequestsTable";
import { LessonChangeRequestsTable } from "@/components/lessons/LessonChangeRequestsTable";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import { TEACHER_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { loadExceptionRequests, loadLessonChangeRequests } from "@/lib/lessons/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "בקשות" };

// Lessons an admin wants to book outside the teacher's availability, for the teacher to answer.
export default async function TeacherRequestsPage() {
  const profile = await requireRole(TEACHER_ROLES);
  if (profile.status === "inactive") {
    return <Alert tone="warning">החשבון שלך אינו פעיל. ניתן לצפות בהיסטוריית השיעורים בלבד.</Alert>;
  }

  const supabase = await createClient();
  await supabase.rpc("expire_lesson_change_requests");
  const [rows, changeRequests] = await Promise.all([loadExceptionRequests(supabase), loadLessonChangeRequests(supabase)]);
  const pending = rows.filter((r) => r.status === "pending");
  const handled = rows.filter((r) => r.status !== "pending");

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["exception_booking_requests", "lesson_change_requests"]} />
      <PageHeader
        title="בקשות"
        subtitle="בקשות שהמנהל שולח לאישורך (שיעור, שינוי או שחזור מחוץ לזמינות שלך), והבקשות שלך לשינוי או ביטול שיעור."
      />
      <section className={stack.page} aria-labelledby="pending-title">
        <h2 id="pending-title" className="text-h3">
          ממתינות לתשובתך ({pending.length})
        </h2>
        <div className={table.wrapper} tabIndex={0}>
          <ExceptionRequestsTable rows={pending} mode="teacher" empty="אין בקשות שממתינות לתשובתך." />
        </div>
      </section>
      <section className={stack.page} aria-labelledby="mine-title">
        <h2 id="mine-title" className="text-h3">
          הבקשות שלי לשינוי או ביטול שיעור
        </h2>
        <div className={table.wrapper} tabIndex={0}>
          <LessonChangeRequestsTable
            rows={changeRequests}
            mode="teacher"
            empty="עוד לא שלחת בקשות. בקשה נשלחת מתוך פרטי השיעור בלוח, עד היום שלפני השיעור."
          />
        </div>
      </section>
      <section className={stack.page} aria-labelledby="handled-title">
        <h2 id="handled-title" className="text-h3">
          היסטוריה
        </h2>
        <div className={table.wrapper} tabIndex={0}>
          <ExceptionRequestsTable rows={handled} mode="teacher" empty="אין עדיין בקשות שהסתיימו." />
        </div>
      </section>
    </div>
  );
}
