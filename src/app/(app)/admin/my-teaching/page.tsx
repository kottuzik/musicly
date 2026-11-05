import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AvailabilityPanel } from "@/components/availability/AvailabilityPanel";
import { ExceptionRequestsTable } from "@/components/lessons/ExceptionRequestsTable";
import { UpcomingLessons } from "@/components/lessons/UpcomingLessons";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import table from "@/components/ui/Table.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getTeachingId, requireRole } from "@/lib/auth/session";
import { loadTeacherAvailability } from "@/lib/availability/queries";
import { loadCalendarLessons, loadExceptionRequests } from "@/lib/lessons/queries";
import { schoolToday } from "@/lib/students/age";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time/weekdays";
import styles from "../../Home.module.css";

export const metadata: Metadata = { title: "ההוראה שלי" };

// An admin who also teaches: only their own lessons, availability and requests to answer.
export default async function MyTeachingPage() {
  await requireRole(ADMIN_ROLES);
  const teacherId = await getTeachingId();
  if (!teacherId) redirect("/profile");

  const supabase = await createClient();
  const today = schoolToday();
  const [lessons, requests, availability] = await Promise.all([
    loadCalendarLessons(supabase, today, addDays(today, 7), { teacherId }),
    loadExceptionRequests(supabase, true),
    loadTeacherAvailability(supabase, teacherId),
  ]);
  const now = new Date().toISOString();
  const upcoming = lessons.filter((l) => l.status === "scheduled" && l.end_at > now);
  const pending = requests.filter((r) => r.teacher_id === teacherId);

  return (
    <div className={stack.page}>
      <LiveRefresh
        tables={["lessons", "exception_booking_requests", "teacher_availability", "availability_requests", "teacher_absences", "operating_hours"]}
      />
      <PageHeader title="ההוראה שלי" subtitle="השיעורים, הזמינות והבקשות שלך כמורה." />
      <Card>
        <div className={styles.cardHeader}>
          <h2 className="text-h3">השיעורים הקרובים שלי</h2>
          <Link href={`/admin/calendar?teacher=${teacherId}`}>ללוח המלא</Link>
        </div>
        <UpcomingLessons lessons={upcoming} showTeacher={false} showDate empty="אין לך שיעורים בשבוע הקרוב." />
      </Card>
      <Card>
        <h2 className={`text-h3 ${stack.sectionTitle}`}>ממתינות לתשובתי ({pending.length})</h2>
        <div className={table.wrapper} tabIndex={0}>
          <ExceptionRequestsTable rows={pending} mode="teacher" empty="אין בקשות שממתינות לתשובתך." />
        </div>
      </Card>
      <Card>
        <div className={styles.cardHeader}>
          <h2 className="text-h3">התלמידים שלי</h2>
          <Link href={`/admin/students?teacher=${teacherId}`}>לרשימת התלמידים שלי</Link>
        </div>
        <p className="text-secondary">
          תזכורות לשיעורים מגדירים ב<Link href="/profile?tab=preferences">פרופיל, בלשונית „העדפות”</Link>.
        </p>
      </Card>
      <AvailabilityPanel mode="admin" teacherId={teacherId} data={availability} />
    </div>
  );
}
