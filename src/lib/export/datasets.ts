import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCATION_LABELS, LESSON_STATUS_LABELS, ATTENDANCE_LABELS } from "@/lib/lessons/labels";
import { schoolDate, schoolTime } from "@/lib/lessons/time";
import { loadCalendarLessons, type CalendarLesson } from "@/lib/lessons/queries";
import type { ReportLine } from "@/lib/reports/queries";
import { ageOn } from "@/lib/students/age";
import { LEVEL_LABELS, STUDENT_STATUS_LABELS, type StudentLevel } from "@/lib/students/labels";
import { STATUS_LABELS } from "@/lib/teachers/account";
import { WEEKDAY_LABELS, dayOfWeek } from "@/lib/time/weekdays";
import type { Database } from "@/types/database";
import type { CsvColumn } from "./csv";
import { MAX_EXPORT_ROWS } from "./params";

type Client = SupabaseClient<Database>;

export type Dataset<Row> = { columns: CsvColumn<Row>[]; rows: Row[] };

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

type StudentRow = {
  full_name: string;
  birth_date: string | null;
  status: "active" | "inactive";
  subjects: { level: StudentLevel; regular_teacher_id: string; lesson_types: { name: string } | null }[];
  student_contacts: {
    phone: string | null;
    email: string | null;
    parent_name: string | null;
    parent_phone: string | null;
    parent_email: string | null;
  } | null;
};

export type StudentFilterParams = { q?: string; status?: string; subject?: string; level?: string; teacher?: string };

// Students with contact details (admins only - enforced by the route and by RLS on student_contacts).
export async function studentsDataset(supabase: Client, f: StudentFilterParams) {
  const matchSubject = Boolean(f.subject || f.level || f.teacher);
  const columns = [
    "full_name, birth_date, status",
    "subjects:student_subjects(level, regular_teacher_id, lesson_types(name))",
    "student_contacts(phone, email, parent_name, parent_phone, parent_email)",
    matchSubject ? "match:student_subjects!inner(lesson_type_id, level, regular_teacher_id)" : null,
  ]
    .filter(Boolean)
    .join(", ");
  let query = supabase
    .from("students")
    .select(columns)
    .is("deleted_at", null)
    .is("anonymized_at", null)
    .order("full_name")
    .limit(MAX_EXPORT_ROWS + 1);
  if (f.q) query = query.ilike("full_name", `%${escapeLike(f.q)}%`);
  if (f.status === "active" || f.status === "inactive") query = query.eq("status", f.status);
  if (f.subject) query = query.eq("match.lesson_type_id", f.subject);
  if (f.level) query = query.eq("match.level", f.level as StudentLevel);
  if (f.teacher) query = query.eq("match.regular_teacher_id", f.teacher);

  const [{ data, error }, { data: names }] = await Promise.all([query, supabase.rpc("list_teacher_names")]);
  if (error) throw error;
  const teacherName = new Map((names ?? []).map((t) => [t.id, t.full_name]));
  const rows = (data ?? []) as unknown as StudentRow[];

  const cols: CsvColumn<StudentRow>[] = [
    { header: "שם", value: (s) => s.full_name },
    { header: "תאריך לידה", value: (s) => s.birth_date },
    { header: "גיל", value: (s) => (s.birth_date ? ageOn(s.birth_date) : null) },
    { header: "סטטוס", value: (s) => STUDENT_STATUS_LABELS[s.status].label },
    {
      header: "תחומי לימוד",
      value: (s) =>
        s.subjects
          .filter((x) => x.lesson_types)
          .map((x) => `${x.lesson_types!.name} (${LEVEL_LABELS[x.level]})`)
          .join("; "),
    },
    {
      header: "מורים קבועים",
      value: (s) =>
        s.subjects
          .filter((x) => x.lesson_types)
          .map((x) => `${x.lesson_types!.name}: ${teacherName.get(x.regular_teacher_id) ?? ""}`)
          .join("; "),
    },
    { header: "טלפון", value: (s) => s.student_contacts?.phone, phone: true },
    { header: "אימייל", value: (s) => s.student_contacts?.email },
    { header: "שם הורה", value: (s) => s.student_contacts?.parent_name },
    { header: "טלפון הורה", value: (s) => s.student_contacts?.parent_phone, phone: true },
    { header: "אימייל הורה", value: (s) => s.student_contacts?.parent_email },
  ];
  return { columns: cols, rows } satisfies Dataset<StudentRow>;
}

type TeacherRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: "active" | "inactive";
  profile_id: string | null;
  teacher_skills: { lesson_type_id: string; lesson_types: { name: string } | null }[];
};

export type TeacherFilterParams = { q?: string; subject?: string; status?: string };

export async function teachersDataset(supabase: Client, f: TeacherFilterParams) {
  let query = supabase
    .from("teachers")
    .select("id, full_name, email, phone, status, profile_id, teacher_skills(lesson_type_id, lesson_types(name))")
    .is("deleted_at", null)
    .is("anonymized_at", null)
    .order("full_name")
    .limit(MAX_EXPORT_ROWS + 1);
  if (f.q) query = query.ilike("full_name", `%${escapeLike(f.q)}%`);
  if (f.status === "active" || f.status === "inactive") query = query.eq("status", f.status);
  if (f.status === "unregistered") query = query.is("profile_id", null);
  const { data, error } = await query;
  if (error) throw error;
  const rows = ((data ?? []) as unknown as TeacherRow[]).filter(
    (t) => !f.subject || t.teacher_skills.some((s) => s.lesson_type_id === f.subject),
  );

  const cols: CsvColumn<TeacherRow>[] = [
    { header: "שם", value: (t) => t.full_name },
    {
      header: "תחומי הוראה",
      value: (t) =>
        t.teacher_skills
          .flatMap((s) => (s.lesson_types ? [s.lesson_types.name] : []))
          .sort((a, b) => a.localeCompare(b, "he"))
          .join("; "),
    },
    { header: "טלפון", value: (t) => t.phone, phone: true },
    { header: "אימייל", value: (t) => t.email },
    { header: "סטטוס", value: (t) => STATUS_LABELS[t.status].label },
    { header: "רשום במערכת", value: (t) => (t.profile_id ? "כן" : "לא") },
  ];
  return { columns: cols, rows } satisfies Dataset<TeacherRow>;
}

export type ScheduleFilterParams = {
  from: string;
  to: string;
  teacher?: string;
  student?: string;
  type?: string;
  cancelled?: string;
};

// The schedule as the caller may see it (a teacher gets only their own lessons - enforced in the database).
export async function scheduleDataset(supabase: Client, f: ScheduleFilterParams) {
  const lessons = await loadCalendarLessons(supabase, f.from, f.to, {
    teacherId: f.teacher,
    studentId: f.student,
    lessonTypeId: f.type,
    includeCancelled: f.cancelled === "1",
  });
  const cols: CsvColumn<CalendarLesson>[] = [
    { header: "תאריך", value: (l) => schoolDate(l.start_at) },
    { header: "יום", value: (l) => WEEKDAY_LABELS[dayOfWeek(schoolDate(l.start_at))] },
    { header: "התחלה", value: (l) => schoolTime(l.start_at) },
    { header: "סיום", value: (l) => schoolTime(l.end_at) },
    { header: "תלמיד", value: (l) => l.student_name },
    { header: "מורה", value: (l) => l.teacher_name },
    { header: "תחום", value: (l) => l.lesson_type_name },
    { header: "מיקום", value: (l) => LOCATION_LABELS[l.location] },
    { header: "סטטוס שיעור", value: (l) => LESSON_STATUS_LABELS[l.status].label },
    { header: "נוכחות", value: (l) => (l.attendance_status ? ATTENDANCE_LABELS[l.attendance_status].label : "") },
  ];
  return { columns: cols, rows: lessons } satisfies Dataset<CalendarLesson>;
}

// The report tables exactly as shown on screen (same lines, same numbers).
export function reportDataset(lines: ReportLine[], firstHeader: string) {
  const cols: CsvColumn<ReportLine>[] = [
    { header: firstHeader, value: (l) => l.name },
    { header: "שיעורים מתוכננים", value: (l) => l.scheduled },
    { header: "התקיימו", value: (l) => l.held },
    { header: "התלמיד לא הגיע", value: (l) => l.studentAbsent },
    { header: "המורה לא הגיע", value: (l) => l.teacherAbsent },
    { header: "ממתינים לדיווח", value: (l) => l.unreported },
    { header: "עתידיים", value: (l) => l.upcoming },
    { header: "בוטלו", value: (l) => l.cancelled },
    { header: "יום סגירה", value: (l) => l.closedDay },
  ];
  return { columns: cols, rows: lines } satisfies Dataset<ReportLine>;
}
