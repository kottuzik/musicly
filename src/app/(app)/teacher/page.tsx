import type { Metadata } from "next";
import Link from "next/link";
import { UpcomingLessons } from "@/components/lessons/UpcomingLessons";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/session";
import { TEACHER_ROLES } from "@/lib/auth/roles";
import { loadTeacherDashboard } from "@/lib/lessons/queries";
import { createClient } from "@/lib/supabase/server";
import { NoticeAlert } from "../NoticeAlert";
import styles from "../Home.module.css";

export const metadata: Metadata = { title: "הלוח שלי" };

export default async function TeacherHomePage({ searchParams }: PageProps<"/teacher">) {
  const profile = await requireRole(TEACHER_ROLES);
  const { notice } = await searchParams;

  if (profile.status === "inactive") {
    return (
      <div className={styles.page}>
        <NoticeAlert notice={notice} />
        <div className={styles.heading}>
          <h1>הלוח שלי</h1>
          <p className="text-body-lg text-secondary">שלום, {profile.full_name}</p>
        </div>
        <Alert tone="warning">החשבון שלך אינו פעיל. ניתן לצפות בהיסטוריית השיעורים בלבד.</Alert>
        <Card className={styles.welcome}>
          <h2 className="text-h3">היסטוריית השיעורים שלך</h2>
          <p className="text-body-lg text-secondary">היסטוריית השיעורים שלך תוצג כאן.</p>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { upcoming, pendingRequests } = await loadTeacherDashboard(supabase);

  return (
    <div className={styles.page}>
      <LiveRefresh tables={["lessons", "exception_booking_requests"]} />
      <NoticeAlert notice={notice} />
      <div className={styles.heading}>
        <h1>הלוח שלי</h1>
        <p className="text-body-lg text-secondary">שלום, {profile.full_name}</p>
      </div>
      {pendingRequests > 0 && (
        <Alert tone="info">
          {pendingRequests === 1 ? "בקשת שיבוץ אחת ממתינה" : `${pendingRequests} בקשות שיבוץ ממתינות`} לתשובתך.{" "}
          <Link href="/teacher/requests">מעבר לבקשות</Link>
        </Alert>
      )}
      <Card>
        <div className={styles.cardHeader}>
          <h2 className="text-h3">השיעורים הקרובים</h2>
          <Link href="/teacher/calendar">ללוח המלא</Link>
        </div>
        <UpcomingLessons lessons={upcoming} showTeacher={false} showDate empty="אין שיעורים בשבוע הקרוב." />
      </Card>
    </div>
  );
}
