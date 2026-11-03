import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { LOCATION_LABELS, LESSON_STATUS_LABELS, ATTENDANCE_LABELS } from "@/lib/lessons/labels";
import { loadCalendarLessons } from "@/lib/lessons/queries";
import { schoolDate, schoolTime } from "@/lib/lessons/time";
import { loadReport } from "@/lib/reports/queries";
import { WEEKDAY_LABELS, dayOfWeek } from "@/lib/time/weekdays";
import type { Database } from "@/types/database";
import type { ToolDefinition } from "./provider";

type Client = SupabaseClient<Database>;

// Read-only tools. Each one validates what the model sends, runs a read-only database function as
// the signed-in admin, and builds its answer field by field - never by passing rows through - so
// contact details, birth dates and notes cannot reach the model.

export type SuggestedSlot = {
  date: string;
  weekday: string;
  start: string;
  end: string;
  teacher: string;
  student: string;
  subject: string;
};

export type ToolOutput = { result: unknown; slots?: SuggestedSlot[] };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM");
const name = z.string().trim().min(1).max(80);

const schemas = {
  find_people: z.object({
    kind: z.enum(["student", "teacher"]),
    query: z.string().trim().max(80).describe("Part of the person's NAME only. Leave it empty ('') when you are not searching by name, e.g. when filtering by subject."),
    lesson_type: name.optional().describe("The subject, e.g. פסנתר. Use this (not query) for 'teachers of piano'."),
  }),
  find_available_teachers: z.object({
    lesson_type: name,
    date,
    from_time: time,
    to_time: time,
  }),
  find_lessons: z.object({
    from: date,
    to: date,
    teacher_name: name.optional(),
    student_name: name.optional(),
    lesson_type: name.optional(),
    include_cancelled: z.boolean().optional(),
  }),
  suggest_alternative_slots: z.object({
    student_name: name,
    lesson_type: name,
    teacher_name: name.optional(),
    from: date,
    to: date,
    duration_minutes: z.number().int().min(5).max(240).optional(),
  }),
  school_summary: z.object({
    from: date,
    to: date,
    teacher_name: name.optional(),
  }),
} as const;

export type ToolName = keyof typeof schemas;

const DESCRIPTIONS: Record<ToolName, string> = {
  find_people:
    "Look up students or teachers. Use it for 'who is / what is the name of the teacher of X', 'which teachers teach X', 'list all teachers' and for finding a person by name. Pass lesson_type to keep only people of one subject; leave query empty to list everyone. Returns name, status (active / inactive) and subjects only - never contact details. It says nothing about free time.",
  find_available_teachers:
    "ONLY when the admin asks about free time or availability ('who is free on Wednesday afternoon'): teachers of a subject who are free on an exact YYYY-MM-DD date within a time window. Never use it to find out who teaches a subject.",
  find_lessons:
    "Lessons in a date range (max 31 days), optionally filtered by teacher, student or subject. Use it to look up a cancelled lesson before suggesting alternatives.",
  suggest_alternative_slots:
    "Up to 8 possible times for a lesson of a student in a subject, when both teacher and student are free and the school is open. Creates nothing.",
  school_summary: "Counts of lessons held, missed, cancelled and waiting for an attendance report in a date range (max 366 days).",
};

export function toolDefinitions(): ToolDefinition[] {
  return (Object.keys(schemas) as ToolName[]).map((key) => {
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(schemas[key]) as Record<string, unknown>;
    void _ignored;
    return { type: "function", function: { name: key, description: DESCRIPTIONS[key], parameters } };
  });
}

export function isToolName(value: string): value is ToolName {
  return Object.hasOwn(schemas, value);
}

class ToolFailure extends Error {}

const weekday = (d: string) => WEEKDAY_LABELS[dayOfWeek(d)];
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

async function lessonTypeId(supabase: Client, input: string) {
  const { data } = await supabase.from("lesson_types").select("id, name");
  const needle = input.trim().toLowerCase();
  const all = data ?? [];
  const exact = all.filter((t) => t.name.toLowerCase() === needle);
  const matches = exact.length ? exact : all.filter((t) => t.name.toLowerCase().includes(needle));
  if (matches.length === 0) throw new ToolFailure(`No subject matches "${input}". Subjects: ${all.map((t) => t.name).join(", ")}`);
  if (matches.length > 1) throw new ToolFailure(`Several subjects match "${input}": ${matches.map((t) => t.name).join(", ")}. Ask which.`);
  return { id: matches[0].id, name: matches[0].name };
}

async function personId(supabase: Client, kind: "student" | "teacher", input: string) {
  const { data, error } = await supabase.rpc("ai_find_people", {
    p_kind: kind,
    p_query: input,
    p_lesson_type: null as unknown as string,
  });
  if (error) throw new ToolFailure("lookup failed");
  const rows = data ?? [];
  const exact = rows.filter((r) => r.name.toLowerCase() === input.trim().toLowerCase());
  const pick = exact.length === 1 ? exact : rows;
  if (pick.length === 0) throw new ToolFailure(`No ${kind} matches "${input}".`);
  if (pick.length > 1) throw new ToolFailure(`Several ${kind}s match "${input}": ${pick.map((r) => r.name).join(", ")}. Ask which.`);
  return { id: pick[0].id, name: pick[0].name };
}

const MAX_ROWS = 40;

export async function runTool(supabase: Client, tool: ToolName, rawArgs: unknown): Promise<ToolOutput> {
  const parsed = schemas[tool].safeParse(rawArgs);
  if (!parsed.success) return { result: { error: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join("; ")}` } };
  try {
    switch (tool) {
      case "find_people": {
        const a = parsed.data as z.infer<typeof schemas.find_people>;
        const { data, error } = await supabase.rpc("ai_find_people", {
          p_kind: a.kind,
          p_query: a.query,
          p_lesson_type: (a.lesson_type ?? null) as unknown as string,
        });
        if (error) throw new ToolFailure("lookup failed");
        return { result: { people: (data ?? []).map((p) => ({ name: p.name, status: p.status, subjects: p.subjects })) } };
      }
      case "find_available_teachers": {
        const a = parsed.data as z.infer<typeof schemas.find_available_teachers>;
        const lt = await lessonTypeId(supabase, a.lesson_type);
        const { data, error } = await supabase.rpc("ai_find_available_teachers", {
          p_lesson_type_id: lt.id,
          p_date: a.date,
          p_from: a.from_time,
          p_to: a.to_time,
        });
        if (error) throw new ToolFailure("lookup failed");
        return {
          result: {
            subject: lt.name,
            date: a.date,
            weekday: weekday(a.date),
            free: (data ?? []).map((r) => ({ teacher: r.teacher_name, from: r.free_from.slice(0, 5), to: r.free_to.slice(0, 5) })),
            note: (data ?? []).length ? undefined : "No teacher of this subject is free in that window (or the school is closed).",
          },
        };
      }
      case "find_lessons": {
        const a = parsed.data as z.infer<typeof schemas.find_lessons>;
        if (a.to < a.from || days(a.from, a.to) > 30) throw new ToolFailure("Range must be between 1 and 31 days.");
        const [teacher, student, lt] = await Promise.all([
          a.teacher_name ? personId(supabase, "teacher", a.teacher_name) : null,
          a.student_name ? personId(supabase, "student", a.student_name) : null,
          a.lesson_type ? lessonTypeId(supabase, a.lesson_type) : null,
        ]);
        const lessons = await loadCalendarLessons(supabase, a.from, a.to, {
          teacherId: teacher?.id,
          studentId: student?.id,
          lessonTypeId: lt?.id,
          includeCancelled: a.include_cancelled ?? false,
        });
        return {
          result: {
            total: lessons.length,
            shown: Math.min(lessons.length, MAX_ROWS),
            lessons: lessons.slice(0, MAX_ROWS).map((l) => ({
              date: schoolDate(l.start_at),
              weekday: weekday(schoolDate(l.start_at)),
              start: schoolTime(l.start_at),
              end: schoolTime(l.end_at),
              student: l.student_name,
              teacher: l.teacher_name,
              subject: l.lesson_type_name,
              location: LOCATION_LABELS[l.location],
              status: LESSON_STATUS_LABELS[l.status].label,
              attendance: l.attendance_status ? ATTENDANCE_LABELS[l.attendance_status].label : null,
            })),
          },
        };
      }
      case "suggest_alternative_slots": {
        const a = parsed.data as z.infer<typeof schemas.suggest_alternative_slots>;
        if (a.to < a.from || days(a.from, a.to) > 13) throw new ToolFailure("Range must be between 1 and 14 days.");
        const [student, lt, teacher] = await Promise.all([
          personId(supabase, "student", a.student_name),
          lessonTypeId(supabase, a.lesson_type),
          a.teacher_name ? personId(supabase, "teacher", a.teacher_name) : null,
        ]);
        const { data, error } = await supabase.rpc("ai_suggest_slots", {
          p_student_id: student.id,
          p_lesson_type_id: lt.id,
          p_teacher_id: (teacher?.id ?? null) as unknown as string,
          p_from: a.from,
          p_to: a.to,
          p_duration: (a.duration_minutes ?? null) as unknown as number,
          p_limit: 8,
        });
        if (error) throw new ToolFailure(error.message || "lookup failed");
        const slots = (data ?? []).map<SuggestedSlot>((s) => ({
          date: s.slot_date,
          weekday: weekday(s.slot_date),
          start: s.start_time.slice(0, 5),
          end: s.end_time.slice(0, 5),
          teacher: s.teacher_name,
          student: student.name,
          subject: lt.name,
        }));
        return { result: { slots, note: slots.length ? undefined : "No free time found in that range." }, slots };
      }
      case "school_summary": {
        const a = parsed.data as z.infer<typeof schemas.school_summary>;
        const teacher = a.teacher_name ? await personId(supabase, "teacher", a.teacher_name) : null;
        const { lines, error } = await loadReport(supabase, { from: a.from, to: a.to }, teacher?.id, "total");
        if (error) throw new ToolFailure(error.message);
        const t = lines[0];
        return {
          result: t
            ? { scheduled: t.scheduled, held: t.held, studentAbsent: t.studentAbsent, teacherAbsent: t.teacherAbsent,
                waitingForReport: t.unreported, upcoming: t.upcoming, cancelled: t.cancelled, closedDay: t.closedDay }
            : { scheduled: 0, held: 0, note: "No lessons in that period." },
        };
      }
    }
  } catch (error) {
    if (error instanceof ToolFailure) return { result: { error: error.message } };
    return { result: { error: "The lookup failed." } };
  }
}
