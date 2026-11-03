import { AlertTriangle, Bell, CalendarCheck, CalendarDays, CalendarRange, ClipboardCheck, GraduationCap, Music } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { UnreportedCard } from "@/components/attendance/UnreportedCard";
import { BookLessonDialog } from "@/components/lessons/BookLessonDialog";
import { UpcomingLessons } from "@/components/lessons/UpcomingLessons";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Card } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { ATTENTION_REASON_LABELS, AUDIT_ACTION_LABELS, auditDetail } from "@/lib/lessons/labels";
import { loadAdminDashboard, loadBookingOptions } from "@/lib/lessons/queries";
import { unreadNotificationCount } from "@/lib/notifications/queries";
import { formatLessonDate, schoolDate, schoolTime } from "@/lib/lessons/time";
import { createClient } from "@/lib/supabase/server";
import { NoticeAlert } from "../NoticeAlert";
import styles from "../Home.module.css";

export const metadata: Metadata = { title: "סקירה כללית" };

export default async function AdminHomePage({ searchParams }: PageProps<"/admin">) {
  const profile = await requireRole(ADMIN_ROLES);
  const { notice } = await searchParams;
  const supabase = await createClient();
  const [stats, options, unread] = await Promise.all([
    loadAdminDashboard(supabase),
    loadBookingOptions(supabase),
    unreadNotificationCount(supabase),
  ]);

  const cards = [
    { label: "תלמידים פעילים", value: stats.students, icon: GraduationCap, href: "/admin/students" },
    { label: "מורים פעילים", value: stats.teachers, icon: Music, href: "/admin/teachers" },
    { label: "שיעורי היום", value: stats.todayCount, icon: CalendarDays, href: "/admin/calendar?view=day" },
    { label: "שיעורי השבוע", value: stats.weekCount, icon: CalendarRange, href: "/admin/calendar?view=week" },
    { label: "התקיימו החודש", value: stats.heldThisMonth, icon: CalendarCheck, href: "/admin/activity?kind=attendance" },
    { label: "בקשות ממתינות", value: stats.pendingRequests, icon: ClipboardCheck, href: "/admin/requests" },
    { label: "דורשים טיפול", value: stats.attention.length, icon: AlertTriangle, href: "/admin/calendar?attention=1" },
    { label: "התראות שלא נקראו", value: unread, icon: Bell, href: "/notifications" },
  ];

  return (
    <div className={styles.page}>
      <LiveRefresh
        tables={["lessons", "availability_requests", "exception_booking_requests", "lesson_change_requests", "audit_events", "attendance", "students", "teachers", "notifications"]}
      />
      <NoticeAlert notice={notice} />
      <div className={styles.headingRow}>
        <div className={styles.heading}>
          <h1>סקירה כללית</h1>
          <p className="text-body-lg text-secondary">שלום, {profile.full_name}</p>
        </div>
        <BookLessonDialog options={options} />
      </div>
      <ul className={styles.stats} aria-label="נתוני בית הספר">
        {cards.map(({ label, value, icon: Icon, href }) => (
          <li key={label}>
            <Link href={href} className={styles.stat}>
              <span className={styles.statValue}>{value}</span>
              <span className={styles.statLabel}>{label}</span>
              <Icon className={styles.statIcon} size={22} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Card>
        <div className={styles.cardHeader}>
          <h2 className="text-h3">השיעורים הקרובים היום</h2>
          <Link href="/admin/calendar?view=day">ללוח השנה</Link>
        </div>
        <UpcomingLessons lessons={stats.upcoming} showTeacher empty="אין עוד שיעורים היום." />
      </Card>
      <Card>
        <div className={styles.cardHeader}>
          <h2 className="text-h3">דורשים טיפול ({stats.attention.length})</h2>
          <Link href="/admin/calendar?attention=1">לכל הרשימה בלוח השנה</Link>
        </div>
        {stats.attention.length === 0 ? (
          <p className="text-secondary">אין שיעורים שדורשים טיפול.</p>
        ) : (
          <ul className={styles.feed}>
            {stats.attention.slice(0, 5).map((l) => (
              <li key={l.id}>
                <Link href={`/admin/calendar?view=week&date=${schoolDate(l.start_at)}&attention=1`}>
                  {l.student_name} — {l.lesson_type_name}
                </Link>
                <span className="text-small text-secondary">
                  {formatLessonDate(l.start_at)} <bdi dir="ltr">{schoolTime(l.start_at)}</bdi> · {l.teacher_name} ·{" "}
                  {l.attention_reason ? ATTENTION_REASON_LABELS[l.attention_reason] : "דורש טיפול"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <UnreportedCard lessons={stats.unreported.lessons} total={stats.unreported.total} showTeacher />
      <Card>
        <div className={styles.cardHeader}>
          <h2 className="text-h3">שינויים וביטולים אחרונים</h2>
          <Link href="/admin/activity">לכל הפעילות</Link>
        </div>
        {stats.recent.length === 0 ? (
          <p className="text-secondary">עוד לא בוצעו שינויים או ביטולים.</p>
        ) : (
          <ul className={styles.feed}>
            {stats.recent.map((e) => (
              <li key={e.id}>
                <span>
                  {AUDIT_ACTION_LABELS[e.action] ?? e.action}
                  {auditDetail(e.action, e.old_values, e.new_values) && ` (${auditDetail(e.action, e.old_values, e.new_values)})`}
                  {e.student_name && ` — ${e.student_name}`}
                </span>
                <span className="text-small text-secondary">
                  {e.teacher_name && `${e.teacher_name} · `}
                  {e.lesson_start_at && `שיעור ב־${formatLessonDate(e.lesson_start_at)} · `}
                  {e.actor_name ? `${e.actor_name}, ` : ""}
                  {formatLessonDate(e.created_at)} <bdi dir="ltr">{schoolTime(e.created_at)}</bdi>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
