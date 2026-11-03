import type { Metadata } from "next";
import Link from "next/link";
import { HistoryLessons } from "@/components/attendance/HistoryLessons";
import { UnreportedCard } from "@/components/attendance/UnreportedCard";
import { UpcomingLessons } from "@/components/lessons/UpcomingLessons";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/session";
import { TEACHER_ROLES } from "@/lib/auth/roles";
import { loadHistoryLessons, loadTeacherDashboard } from "@/lib/lessons/queries";
import { isMonth } from "@/lib/lessons/time";
import { schoolToday } from "@/lib/students/age";
import { unreadNotificationCount } from "@/lib/notifications/queries";
import { createClient } from "@/lib/supabase/server";
import { NoticeAlert } from "../NoticeAlert";
import styles from "../Home.module.css";

export const metadata: Metadata = { title: "הלוח שלי" };

export default async function TeacherHomePage({ searchParams }: PageProps<"/teacher">) {
  const profile = await requireRole(TEACHER_ROLES);
  const { notice, month: monthParam } = await searchParams;

  if (profile.status === "inactive") {
    const month = typeof monthParam === "string" && isMonth(monthParam) ? monthParam : schoolToday().slice(0, 7);
    return (
      <div className={styles.page}>
        <NoticeAlert notice={notice} />
        <div className={styles.heading}>
          <h1>הלוח שלי</h1>
          <p className="text-body-lg text-secondary">שלום, {profile.full_name}</p>
        </div>
        <Alert tone="warning">החשבון שלך אינו פעיל. ניתן לצפות בהיסטוריית השיעורים בלבד.</Alert>
        <HistoryLessons
          lessons={await loadHistoryLessons(await createClient(), month, {})}
          month={month}
          hrefForMonth={(m) => `/teacher?month=${m}`}
          showStudent
          showTeacher={false}
          canReport={false}
          asOf={new Date().toISOString()}
          empty="אין שיעורים בחודש הזה."
        />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ upcoming, pendingRequests, unreported }, unread] = await Promise.all([
    loadTeacherDashboard(supabase),
    unreadNotificationCount(supabase),
  ]);

  return (
    <div className={styles.page}>
      <LiveRefresh tables={["lessons", "exception_booking_requests", "attendance", "notifications"]} />
      <NoticeAlert notice={notice} />
      <div className={styles.heading}>
        <h1>הלוח שלי</h1>
        <p className="text-body-lg text-secondary">שלום, {profile.full_name}</p>
      </div>
      {unread > 0 && (
        <Alert tone="info">
          {unread === 1 ? "יש לך התראה אחת שלא נקראה" : `יש לך ${unread} התראות שלא נקראו`}.{" "}
          <Link href="/notifications">מעבר להתראות</Link>
        </Alert>
      )}
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
      <UnreportedCard lessons={unreported.lessons} total={unreported.total} showTeacher={false} />
    </div>
  );
}
