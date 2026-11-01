import type { Metadata } from "next";
import { CalendarFilters } from "@/components/calendar/CalendarFilters";
import { LessonCalendar } from "@/components/calendar/LessonCalendar";
import { BookLessonDialog } from "@/components/lessons/BookLessonDialog";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { PageHeader } from "@/components/ui/PageHeader";
import stack from "@/components/ui/Stack.module.css";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { parseCalendarParams, visibleHours } from "@/lib/lessons/calendar-params";
import { loadBookingOptions, loadCalendarLessons } from "@/lib/lessons/queries";
import { viewRange } from "@/lib/lessons/time";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "לוח שנה" };

export default async function AdminCalendarPage({ searchParams }: PageProps<"/admin/calendar">) {
  await requireRole(ADMIN_ROLES);
  const params = parseCalendarParams(await searchParams);
  const { from, to } = viewRange(params.view, params.date);

  const supabase = await createClient();
  const [lessons, options] = await Promise.all([
    loadCalendarLessons(supabase, from, to, params),
    loadBookingOptions(supabase),
  ]);
  const hours = visibleHours(options.hours, lessons);

  return (
    <div className={stack.page}>
      <LiveRefresh tables={["lessons", "exception_booking_requests"]} />
      <PageHeader
        title="לוח שנה"
        subtitle="כל השיעורים של בית הספר. לחיצה על שיעור פותחת את פרטיו."
        actions={<BookLessonDialog options={options} />}
      />
      <CalendarFilters
        params={params}
        teachers={options.teachers.map((t) => ({ value: t.id, label: t.name }))}
        students={options.students.map((s) => ({ value: s.id, label: s.name }))}
        lessonTypes={options.lessonTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
      />
      <LessonCalendar
        lessons={lessons}
        view={params.view}
        date={params.date}
        viewFromUrl={params.viewFromUrl}
        showTeacher
        {...hours}
      />
    </div>
  );
}
