import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { StudentLevel } from "./labels";

type Client = SupabaseClient<Database>;

export type StudentFilters = { q: string; status: string; subject: string; level: string; teacher: string };

export type StudentSubjectView = {
  id: string;
  lessonType: { id: string; name: string; color: string };
  teacherId: string;
  teacherName: string;
  teacherInactive: boolean;
  level: StudentLevel;
  background: string | null;
};

const SUBJECT_COLUMNS = "id, level, professional_background, regular_teacher_id, lesson_types(id, name, color)";

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function readFilters(params: Record<string, string | string[] | undefined>): StudentFilters {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string).trim() : "");
  return { q: get("q"), status: get("status"), subject: get("subject"), level: get("level"), teacher: get("teacher") };
}

// Teacher names come from a narrow RPC (no contact details), so this works for admins and teachers alike.
// Teacher status is visible to admins (RLS on teachers); a teacher only sees their own.
async function teacherLookup(supabase: Client) {
  const [{ data: names }, { data: statuses }] = await Promise.all([
    supabase.rpc("list_teacher_names"),
    supabase.from("teachers").select("id, status"),
  ]);
  const nameById = new Map((names ?? []).map((t) => [t.id, t.full_name]));
  const inactive = new Set((statuses ?? []).filter((t) => t.status === "inactive").map((t) => t.id));
  return { nameById, inactive };
}

type SubjectRow = {
  id: string;
  level: StudentLevel;
  professional_background: string | null;
  regular_teacher_id: string;
  lesson_types: { id: string; name: string; color: string } | null;
};

function toSubjectViews(rows: SubjectRow[], lookup: Awaited<ReturnType<typeof teacherLookup>>): StudentSubjectView[] {
  return rows
    .flatMap((s) =>
      s.lesson_types
        ? [
            {
              id: s.id,
              lessonType: s.lesson_types,
              teacherId: s.regular_teacher_id,
              teacherName: lookup.nameById.get(s.regular_teacher_id) ?? "—",
              teacherInactive: lookup.inactive.has(s.regular_teacher_id),
              level: s.level,
              background: s.professional_background,
            },
          ]
        : [],
    )
    .sort((a, b) => a.lessonType.name.localeCompare(b.lessonType.name, "he"));
}

// Students visible to the caller (RLS: admins see all, a teacher sees their own), filtered in the database.
// Subject, level and teacher filters must all match the same enrollment row.
export async function listStudents(supabase: Client, filters: StudentFilters, { withContacts }: { withContacts: boolean }) {
  const matchSubject = Boolean(filters.subject || filters.level || filters.teacher);
  const columns = [
    "id, full_name, birth_date, status",
    `subjects:student_subjects(${SUBJECT_COLUMNS})`,
    withContacts ? "student_contacts(phone, parent_phone)" : null,
    matchSubject ? "match:student_subjects!inner(lesson_type_id, level, regular_teacher_id)" : null,
  ]
    .filter(Boolean)
    .join(", ");

  let query = supabase.from("students").select(columns).order("full_name");
  if (filters.q) query = query.ilike("full_name", `%${escapeLike(filters.q)}%`);
  if (filters.status === "active" || filters.status === "inactive") query = query.eq("status", filters.status);
  if (filters.subject) query = query.eq("match.lesson_type_id", filters.subject);
  if (filters.level) query = query.eq("match.level", filters.level as StudentLevel);
  if (filters.teacher) query = query.eq("match.regular_teacher_id", filters.teacher);

  const [{ data, error }, lookup, { count }] = await Promise.all([
    query,
    teacherLookup(supabase),
    supabase.from("students").select("id", { count: "exact", head: true }),
  ]);
  if (error) throw error;

  type Row = {
    id: string;
    full_name: string;
    birth_date: string;
    status: "active" | "inactive";
    subjects: SubjectRow[];
    student_contacts?: { phone: string | null; parent_phone: string | null } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).map((s) => ({
    id: s.id,
    fullName: s.full_name,
    birthDate: s.birth_date,
    status: s.status,
    subjects: toSubjectViews(s.subjects, lookup),
    phone: s.student_contacts?.phone ?? null,
    parentPhone: s.student_contacts?.parent_phone ?? null,
  }));
  return { rows, total: count ?? rows.length };
}

export async function getStudent(supabase: Client, id: string, { withContacts }: { withContacts: boolean }) {
  const [{ data: student }, { data: subjects }, contacts, lookup] = await Promise.all([
    supabase.from("students").select("id, full_name, birth_date, status, expected_return_date, return_mode").eq("id", id).maybeSingle(),
    supabase.from("student_subjects").select(SUBJECT_COLUMNS).eq("student_id", id),
    withContacts
      ? supabase
          .from("student_contacts")
          .select("phone, email, parent_name, parent_phone, parent_email")
          .eq("student_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    teacherLookup(supabase),
  ]);
  if (!student) return null;
  return {
    student,
    contacts: contacts.data,
    subjects: toSubjectViews((subjects ?? []) as SubjectRow[], lookup),
  };
}
