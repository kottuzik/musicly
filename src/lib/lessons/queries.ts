import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { schoolToday } from "@/lib/students/age";
import { addDays } from "@/lib/time/weekdays";
import type { Database } from "@/types/database";
import { utcBounds, weekStart } from "./time";

type Client = SupabaseClient<Database>;

export type CalendarLesson = Database["public"]["Functions"]["list_calendar_lessons"]["Returns"][number];
export type LessonDetails = Database["public"]["Functions"]["get_lesson"]["Returns"][number];
export type ExceptionRequest = Database["public"]["Functions"]["list_exception_requests"]["Returns"][number];
export type LessonChangeRequest = Database["public"]["Functions"]["list_lesson_change_requests"]["Returns"][number];
export type AttentionLesson = Database["public"]["Functions"]["list_attention_lessons"]["Returns"][number];
export type RecentChange = Database["public"]["Functions"]["list_recent_changes"]["Returns"][number];
export type LessonHistoryEntry = Database["public"]["Functions"]["list_lesson_history"]["Returns"][number];

export type CalendarFilters = {
  teacherId?: string;
  studentId?: string;
  lessonTypeId?: string;
  includeCancelled?: boolean;
  // Admins: only lessons flagged "needs attention".
  attentionOnly?: boolean;
};

// Lessons shown between two local dates (inclusive). Teachers get only their own (enforced in the DB).
export async function loadCalendarLessons(supabase: Client, from: string, to: string, filters: CalendarFilters = {}) {
  const bounds = utcBounds(from, to);
  const { data } = await supabase.rpc("list_calendar_lessons", {
    p_from: bounds.from,
    p_to: bounds.to,
    // Null means "no filter" (the generated types do not mark SQL arguments as nullable).
    p_teacher_id: (filters.teacherId || null) as unknown as string,
    p_student_id: (filters.studentId || null) as unknown as string,
    p_lesson_type_id: (filters.lessonTypeId || null) as unknown as string,
    p_include_cancelled: filters.includeCancelled ?? false,
    p_attention_only: filters.attentionOnly ?? false,
  });
  return data ?? [];
}

export async function loadLesson(supabase: Client, id: string): Promise<LessonDetails | null> {
  const { data } = await supabase.rpc("get_lesson", { p_id: id });
  return data?.[0] ?? null;
}

export type BookingStudent = {
  id: string;
  name: string;
  subjects: { lessonTypeId: string; regularTeacherId: string }[];
};
export type BookingLessonType = { id: string; name: string; color: string; duration: number };
export type BookingTeacher = { id: string; name: string; lessonTypeIds: string[] };
export type BookingHours = { day_of_week: number; open_time: string; close_time: string };
export type BookingSlot = {
  teacher_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  valid_from: string;
  valid_to: string | null;
};

// Everything the "new lesson" dialog needs (admins only): active students with their subjects,
// active teachers with what they teach, school hours and current teacher availability.
export async function loadBookingOptions(supabase: Client) {
  const today = schoolToday();
  const [students, lessonTypes, teachers, hours, slots] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, student_subjects(lesson_type_id, regular_teacher_id)")
      .eq("status", "active")
      .order("full_name"),
    supabase.from("lesson_types").select("id, name, color, default_duration_minutes").order("name"),
    supabase.from("teachers").select("id, full_name, teacher_skills(lesson_type_id)").eq("status", "active").order("full_name"),
    supabase.from("operating_hours").select("day_of_week, open_time, close_time").order("day_of_week"),
    supabase
      .from("teacher_availability")
      .select("teacher_id, day_of_week, start_time, end_time, valid_from, valid_to")
      .or(`valid_to.is.null,valid_to.gte.${today}`)
      .order("start_time"),
  ]);

  return {
    students: (students.data ?? []).map<BookingStudent>((s) => ({
      id: s.id,
      name: s.full_name,
      subjects: s.student_subjects.map((ss) => ({ lessonTypeId: ss.lesson_type_id, regularTeacherId: ss.regular_teacher_id })),
    })),
    lessonTypes: (lessonTypes.data ?? []).map<BookingLessonType>((lt) => ({
      id: lt.id,
      name: lt.name,
      color: lt.color,
      duration: lt.default_duration_minutes,
    })),
    teachers: (teachers.data ?? []).map<BookingTeacher>((t) => ({
      id: t.id,
      name: t.full_name,
      lessonTypeIds: t.teacher_skills.map((s) => s.lesson_type_id),
    })),
    hours: (hours.data ?? []) as BookingHours[],
    slots: (slots.data ?? []) as BookingSlot[],
  };
}

export type BookingOptions = Awaited<ReturnType<typeof loadBookingOptions>>;

export async function loadExceptionRequests(supabase: Client, pendingOnly = false) {
  await supabase.rpc("expire_exception_requests");
  const { data } = await supabase.rpc("list_exception_requests", { p_pending_only: pendingOnly });
  return data ?? [];
}

// Teacher requests to change or cancel a lesson: admins see all, a teacher their own.
export async function loadLessonChangeRequests(supabase: Client, pendingOnly = false) {
  const { data } = await supabase.rpc("list_lesson_change_requests", { p_pending_only: pendingOnly });
  return data ?? [];
}

// Admins: upcoming lessons flagged "needs attention".
export async function loadAttentionLessons(supabase: Client) {
  const { data } = await supabase.rpc("list_attention_lessons");
  return data ?? [];
}

// Admins: the latest logged changes and cancellations.
export async function loadRecentChanges(supabase: Client, limit = 10) {
  const { data } = await supabase.rpc("list_recent_changes", { p_limit: limit });
  return data ?? [];
}

// Admins: everything that happened to one lesson, newest first.
export async function loadLessonHistory(supabase: Client, lessonId: string) {
  const { data } = await supabase.rpc("list_lesson_history", { p_lesson_id: lessonId });
  return data ?? [];
}

// Admin home: counts and today's upcoming lessons.
export async function loadAdminDashboard(supabase: Client) {
  const today = schoolToday();
  const week = weekStart(today);
  const todayBounds = utcBounds(today, today);
  const weekBounds = utcBounds(week, addDays(week, 6));
  await supabase.rpc("expire_exception_requests");
  await supabase.rpc("expire_lesson_change_requests");

  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [students, teachers, todayCount, weekCount, availabilityRequests, exceptionRequests, changeRequests, attention, recent, todayLessons] = await Promise.all([
    count(supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(supabase.from("teachers").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(
      supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled")
        .gte("start_at", todayBounds.from)
        .lt("start_at", todayBounds.to),
    ),
    count(
      supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled")
        .gte("start_at", weekBounds.from)
        .lt("start_at", weekBounds.to),
    ),
    count(supabase.from("availability_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(supabase.from("exception_booking_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(supabase.from("lesson_change_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    loadAttentionLessons(supabase),
    loadRecentChanges(supabase, 8),
    loadCalendarLessons(supabase, today, today),
  ]);

  const now = new Date().toISOString();
  return {
    students,
    teachers,
    todayCount,
    weekCount,
    pendingRequests: availabilityRequests + exceptionRequests + changeRequests,
    attention,
    recent,
    upcoming: todayLessons.filter((l) => l.status === "scheduled" && l.end_at > now),
  };
}

// Teacher home: their lessons from now through the next 7 days, and requests awaiting them.
export async function loadTeacherDashboard(supabase: Client) {
  const today = schoolToday();
  const [lessons, requests] = await Promise.all([
    loadCalendarLessons(supabase, today, addDays(today, 7)),
    loadExceptionRequests(supabase, true),
  ]);
  const now = new Date().toISOString();
  return {
    upcoming: lessons.filter((l) => l.status === "scheduled" && l.end_at > now),
    pendingRequests: requests.length,
  };
}
