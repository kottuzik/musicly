import type { Metadata } from "next";
import { ExportLink } from "@/components/export/ExportLink";
import { CalendarFilters } from "@/components/calendar/CalendarFilters";
import { LessonCalendar } from "@/components/calendar/LessonCalendar";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import { TEACHER_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { parseCalendarParams, visibleHours } from "@/lib/lessons/calendar-params";
import { loadCalendarLessons } from "@/lib/lessons/queries";
import { viewRange } from "@/lib/lessons/time";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "הלוח שלי" };

export default async function TeacherCalendarPage({ searchParams }: PageProps<"/teacher/calendar">) {
  const profile = await requireRole(TEACHER_ROLES);
  if (profile.status === "inactive") {
    return <Alert tone="warning">החשבון שלך אינו פעיל. ניתן לצפות בהיסטוריית השיעורים בלבד.</Alert>;
  }
  // Teachers see only their own lessons: the database ignores other filters' teacher.
  const params = { ...parseCalendarParams(await searchParams), teacherId: "", studentId: "", lessonTypeId: "" };
  const { from, to } = viewRange(params.view, params.date);

  const supabase = await createClient();
  const [lessons, { data: hours }] = await Promise.all([
    loadCalendarLessons(supabase, from, to, params),
    supabase.from("operating_hours").select("open_time, close_time"),
  ]);

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["lessons", "lesson_change_requests"]} />
      <PageHeader
        title="הלוח שלי"
        subtitle="השיעורים שלך. לחיצה על שיעור פותחת את פרטיו."
        actions={
          <ExportLink
            kind="schedule"
            label="ייצוא מערכת שעות"
            params={{ from, to, cancelled: params.includeCancelled ? "1" : "0" }}
          />
        }
      />
      <CalendarFilters params={params} />
      <LessonCalendar
        lessons={lessons}
        view={params.view}
        date={params.date}
        viewFromUrl={params.viewFromUrl}
        showTeacher={false}
        {...visibleHours(hours ?? [], lessons)}
      />
    </div>
  );
}
