import { CalendarDays, CalendarRange, ClipboardCheck, GraduationCap, Music } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookLessonDialog } from "@/components/lessons/BookLessonDialog";
import { UpcomingLessons } from "@/components/lessons/UpcomingLessons";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Card } from "@/components/ui/Card";
import { requireRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { loadAdminDashboard, loadBookingOptions } from "@/lib/lessons/queries";
import { createClient } from "@/lib/supabase/server";
import { NoticeAlert } from "../NoticeAlert";
import styles from "../Home.module.css";

export const metadata: Metadata = { title: "סקירה כללית" };

export default async function AdminHomePage({ searchParams }: PageProps<"/admin">) {
  const profile = await requireRole(ADMIN_ROLES);
  const { notice } = await searchParams;
  const supabase = await createClient();
  const [stats, options] = await Promise.all([loadAdminDashboard(supabase), loadBookingOptions(supabase)]);

  const cards = [
    { label: "תלמידים פעילים", value: stats.students, icon: GraduationCap, href: "/admin/students" },
    { label: "מורים פעילים", value: stats.teachers, icon: Music, href: "/admin/teachers" },
    { label: "שיעורי היום", value: stats.todayCount, icon: CalendarDays, href: "/admin/calendar?view=day" },
    { label: "שיעורי השבוע", value: stats.weekCount, icon: CalendarRange, href: "/admin/calendar?view=week" },
    { label: "בקשות ממתינות", value: stats.pendingRequests, icon: ClipboardCheck, href: "/admin/requests" },
  ];

  return (
    <div className={styles.page}>
      <LiveRefresh tables={["lessons", "availability_requests", "exception_booking_requests", "students", "teachers"]} />
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
    </div>
  );
}
