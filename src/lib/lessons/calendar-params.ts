import { schoolToday } from "@/lib/students/age";
import type { CalendarLesson } from "./queries";
import { isCalendarView, schoolTime, type CalendarView } from "./time";

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: string | string[] | undefined) => (UUID.test(one(v)) ? one(v) : "");

// Calendar state lives in the URL so it survives reloads and live refreshes.
export function parseCalendarParams(params: Params) {
  const view = one(params.view);
  const date = one(params.date);
  return {
    view: (isCalendarView(view) ? view : "week") as CalendarView,
    viewFromUrl: isCalendarView(view),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : schoolToday(),
    teacherId: uuid(params.teacher),
    studentId: uuid(params.student),
    lessonTypeId: uuid(params.type),
    includeCancelled: one(params.cancelled) === "1",
  };
}

// Hours shown in the time grid: the school's opening hours (08:00–20:00 until they are set),
// widened to fit any lesson outside them.
export function visibleHours(hours: { open_time: string; close_time: string }[], lessons: CalendarLesson[]) {
  const opening = hours.length ? hours : [{ open_time: "08:00", close_time: "20:00" }];
  const starts = [...opening.map((h) => h.open_time.slice(0, 5)), ...lessons.map((l) => schoolTime(l.start_at))];
  const ends = [...opening.map((h) => h.close_time.slice(0, 5)), ...lessons.map((l) => schoolTime(l.end_at))];
  const min = starts.reduce((a, b) => (a < b ? a : b));
  const max = ends.reduce((a, b) => (a > b ? a : b));
  const floorHour = (t: string) => `${t.slice(0, 2)}:00`;
  const ceilHour = (t: string) => {
    const h = Number(t.slice(0, 2)) + (t.slice(3) === "00" ? 0 : 1);
    // A lesson ending at midnight shows as 00:00; keep the grid within the day.
    return h === 0 || h >= 24 ? "24:00" : `${String(h).padStart(2, "0")}:00`;
  };
  return { slotMinTime: floorHour(min), slotMaxTime: ceilHour(max) };
}
