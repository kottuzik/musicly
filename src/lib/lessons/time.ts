// Lessons are stored as UTC instants and shown in the school's time zone (Asia/Jerusalem).
// Calendar dates are "YYYY-MM-DD" strings; weeks start on Sunday.

import { addDays, dayOfWeek } from "@/lib/time/weekdays";

export const SCHOOL_TIME_ZONE = "Asia/Jerusalem";

export type CalendarView = "day" | "week" | "month";

export const CALENDAR_VIEWS: CalendarView[] = ["day", "week", "month"];

export const VIEW_LABELS: Record<CalendarView, string> = { day: "יום", week: "שבוע", month: "חודש" };

// Offset of the school's zone from UTC at a given instant, in minutes (e.g. 180 in summer).
function zoneOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

// Local school date + wall-clock time → UTC instant (handles daylight saving time).
export function localToUtc(date: string, time: string): Date {
  const naive = new Date(`${date}T${time.slice(0, 5)}:00Z`);
  const first = new Date(naive.getTime() - zoneOffsetMinutes(naive) * 60000);
  return new Date(naive.getTime() - zoneOffsetMinutes(first) * 60000);
}

// Local date of an instant at the school.
export function schoolDate(instant: Date | string): string {
  return new Date(instant).toLocaleDateString("en-CA", { timeZone: SCHOOL_TIME_ZONE });
}

// "16:00" at the school.
export function schoolTime(instant: Date | string): string {
  return new Date(instant).toLocaleTimeString("en-GB", {
    timeZone: SCHOOL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function lessonTimeRange(start: string, end: string): string {
  return `${schoolTime(start)}–${schoolTime(end)}`;
}

// "יום שלישי, 14/05/2026"
export function formatLessonDate(instant: Date | string): string {
  return new Date(instant).toLocaleDateString("he-IL", {
    timeZone: SCHOOL_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Minutes after "HH:MM", as "HH:MM" (same day only).
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function weekStart(date: string): string {
  return addDays(date, -dayOfWeek(date));
}

function monthStart(date: string): string {
  return `${date.slice(0, 8)}01`;
}

function addMonths(date: string, months: number): string {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

// "YYYY-MM" month picker values (history screens).
export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, delta: number): string {
  return addMonths(`${month}-01`, delta).slice(0, 7);
}

// First and last local date of a month.
export function monthDates(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(addMonths(from, 1), -1) };
}

export function monthTitle(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC", month: "long", year: "numeric" });
}

// The dates a view shows: [first, last] inclusive. The month grid always shows six whole weeks.
export function viewRange(view: CalendarView, date: string): { from: string; to: string } {
  if (view === "day") return { from: date, to: date };
  if (view === "week") {
    const from = weekStart(date);
    return { from, to: addDays(from, 6) };
  }
  const from = weekStart(monthStart(date));
  return { from, to: addDays(from, 41) };
}

// UTC bounds for querying lessons shown in [from, to] (local dates).
export function utcBounds(from: string, to: string): { from: string; to: string } {
  return { from: localToUtc(from, "00:00").toISOString(), to: localToUtc(addDays(to, 1), "00:00").toISOString() };
}

// The date the previous/next button moves to.
export function shiftDate(view: CalendarView, date: string, direction: 1 | -1): string {
  if (view === "day") return addDays(date, direction);
  if (view === "week") return addDays(date, 7 * direction);
  return addMonths(monthStart(date), direction);
}

// Toolbar title, e.g. "מאי 2026" or "10–16/05/2026".
export function viewTitle(view: CalendarView, date: string): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC", ...opts });
  if (view === "month") return fmt(date, { month: "long", year: "numeric" });
  if (view === "day") return fmt(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const { from, to } = viewRange("week", date);
  return `${fmt(from, { day: "numeric", month: "numeric" })} – ${fmt(to, { day: "numeric", month: "numeric", year: "numeric" })}`;
}

export function isCalendarView(value: string): value is CalendarView {
  return (CALENDAR_VIEWS as string[]).includes(value);
}
