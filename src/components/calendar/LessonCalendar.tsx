"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import heLocale from "@fullcalendar/react/locales/he";
import themePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { AlertTriangle, ChevronLeft, ChevronRight, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ATTENDANCE_LABELS, LESSON_STATUS_LABELS, LOCATION_LABELS } from "@/lib/lessons/labels";
import type { BookingOptions, CalendarLesson } from "@/lib/lessons/queries";
import {
  CALENDAR_VIEWS,
  SCHOOL_TIME_ZONE,
  VIEW_LABELS,
  shiftDate,
  viewTitle,
  type CalendarView,
} from "@/lib/lessons/time";
import { schoolToday } from "@/lib/students/age";
import { BookLessonSlotDialog, type BookingSlotChoice } from "@/components/lessons/BookLessonDialog";
import { LessonDetailsDialog } from "./LessonDetailsDialog";
import styles from "./Calendar.module.css";

const FC_VIEWS: Record<CalendarView, string> = { day: "timeGridDay", week: "timeGridWeek", month: "dayGridMonth" };

// Light tint of the lesson type color as the block background, dark text for contrast.
function tint(hex: string) {
  return `color-mix(in srgb, ${hex} 22%, white)`;
}

type Props = {
  lessons: CalendarLesson[];
  view: CalendarView;
  date: string;
  // Admins see the teacher's name on each lesson; a teacher's calendar shows only their own.
  showTeacher: boolean;
  // The view was chosen in the URL; otherwise narrow screens switch to the day view.
  viewFromUrl: boolean;
  slotMinTime: string;
  slotMaxTime: string;
  // Admins see "needs attention" flags and can change lessons; options feed the change dialog.
  isAdmin?: boolean;
  options?: BookingOptions;
};

export function LessonCalendar({ lessons, view, date, showTeacher, viewFromUrl, slotMinTime, slotMaxTime, isAdmin = false, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [newSlot, setNewSlot] = useState<BookingSlotChoice | null>(null);
  const canBook = isAdmin && Boolean(options);

  // dateStr is in the school's time zone: a date, or a date and time ("2026-11-05T12:30:00+02:00").
  // A click in the past opens nothing, because lessons are booked only ahead.
  const chooseSlot = (dateStr: string, instant: Date, allDay: boolean) => {
    const slotDate = dateStr.slice(0, 10);
    if (allDay ? slotDate < schoolToday() : instant.getTime() <= Date.now()) return;
    setNewSlot({ date: slotDate, start: allDay ? "" : dateStr.slice(11, 16) });
  };

  const href = (next: { view?: CalendarView; date?: string }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next.view ?? view);
    params.set("date", next.date ?? date);
    return `${pathname}?${params}`;
  };

  // No layout of the week grid fits a phone: start there with a single day.
  useEffect(() => {
    if (!viewFromUrl && view !== "day" && window.matchMedia("(max-width: 640px)").matches) {
      router.replace(href({ view: "day" }));
    }
    // Runs once per page load; href depends on values that are already in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = schoolToday();

  return (
    <div className={styles.calendar}>
      <div className={styles.toolbar}>
        <div className={styles.nav}>
          <Link className={styles.navButton} href={href({ date: shiftDate(view, date, -1) })} aria-label="הקודם">
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
          <Link className={styles.navButton} href={href({ date: shiftDate(view, date, 1) })} aria-label="הבא">
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <Link className={styles.todayButton} href={href({ date: today })} aria-disabled={date === today || undefined}>
            היום
          </Link>
        </div>
        <h2 className={`text-h3 ${styles.title}`} aria-live="polite">
          {viewTitle(view, date)}
        </h2>
        <nav aria-label="תצוגת לוח" className={styles.views}>
          {CALENDAR_VIEWS.map((v) => (
            <Link key={v} href={href({ view: v })} className={styles.viewButton} aria-current={v === view ? "page" : undefined}>
              {VIEW_LABELS[v]}
            </Link>
          ))}
        </nav>
      </div>

      <div className={canBook ? `${styles.grid} ${styles.gridBookable}` : styles.grid}>
        <FullCalendar
          key={`${view}:${date}`}
          plugins={[themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
          dateClick={canBook ? (info) => chooseSlot(info.dateStr, info.date, info.allDay) : undefined}
          initialView={FC_VIEWS[view]}
          initialDate={date}
          headerToolbar={false}
          direction="rtl"
          locale={heLocale}
          timeZone={SCHOOL_TIME_ZONE}
          firstDay={0}
          allDaySlot={false}
          nowIndicator
          height="auto"
          slotMinHeight={36}
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          dayMaxEvents={3}
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          events={lessons.map((l) => ({
            id: l.id,
            start: l.start_at,
            end: l.end_at,
            title: `${l.lesson_type_name} — ${l.student_name}`,
            color: tint(l.color),
            contrastColor: "#1f2937",
            className: [
              styles.event,
              l.status === "closed_day" && styles.closed,
              l.status === "cancelled" && styles.cancelled,
              isAdmin && l.requires_attention && l.status === "scheduled" && styles.attention,
            ]
              .filter(Boolean)
              .join(" "),
            lesson: l,
          }))}
          eventContent={(info) => {
            const l = info.event.extendedProps.lesson as CalendarLesson;
            const status = l.status === "scheduled" ? null : LESSON_STATUS_LABELS[l.status].label;
            const attendance = l.status === "scheduled" && l.attendance_status ? ATTENDANCE_LABELS[l.attendance_status].label : null;
            const attention = isAdmin && l.requires_attention && l.status === "scheduled";
            return (
              <button
                type="button"
                className={styles.eventButton}
                style={{ borderInlineStartColor: l.color }}
                title={`${l.lesson_type_name} — ${l.student_name}${showTeacher ? ` (${l.teacher_name})` : ""}`}
                onClick={() => setOpenLesson(l.id)}
              >
                <span className={styles.eventTime}>{info.timeText}</span>
                <span className={styles.eventTitle}>
                  {l.lesson_type_name} — {l.student_name}
                </span>
                {showTeacher && <span className={styles.eventMeta}>{l.teacher_name}</span>}
                {l.location === "zoom" && (
                  <span className={styles.eventMeta}>
                    <Video size={12} aria-hidden="true" /> {LOCATION_LABELS.zoom}
                  </span>
                )}
                {status && <span className={styles.eventMeta}>{status}</span>}
                {attendance && <span className={styles.eventMeta}>{attendance}</span>}
                {attention && (
                  <span className={styles.eventAttention}>
                    <AlertTriangle size={12} aria-hidden="true" /> דורש טיפול
                  </span>
                )}
              </button>
            );
          }}
        />
      </div>

      <LessonDetailsDialog lessonId={openLesson} onClose={() => setOpenLesson(null)} isAdmin={isAdmin} options={options} />
      {canBook && options && <BookLessonSlotDialog options={options} slot={newSlot} onClose={() => setNewSlot(null)} />}
    </div>
  );
}
