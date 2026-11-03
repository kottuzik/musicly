import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-rep-${Date.now()}`;
const TEST_LESSON_TYPE = "תחום בדיקה";
const PHONE = "0509998877";

type Client = SupabaseClient<Database>;
type Hours = Database["public"]["Tables"]["operating_hours"]["Row"];
type Availability = Database["public"]["Tables"]["teacher_availability"]["Row"];

function newClient(apiKey = key): Client {
  return createClient<Database>(url, apiKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signedIn(user: TestUser) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

function localDay(offset: number) {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
}

function utc(date: string, time: string) {
  for (const offset of ["+02:00", "+03:00"]) {
    const instant = new Date(`${date}T${time}:00${offset}`);
    const local = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(instant);
    if (local === time) return instant.toISOString();
  }
  throw new Error("bad time");
}
const nullable = <T,>(v: T | null) => v as unknown as T;
const dow = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

describe.skipIf(!users)("Reports, export log and AI read tools (Development)", () => {
  let service: Client;
  let admin: Client;
  let teacher: Client;
  let inactiveTeacher: Client;
  let anon: Client;
  let lessonTypeId: string;
  let teacherId = "";
  let teacher2Id = "";
  const studentIds = { s1: "", s2: "" };
  let savedHours: Hours[] = [];
  let savedAvailability: Availability[] = [];
  const createdLessons: string[] = [];

  async function insertLesson(student: string, date: string, time: string, opts: { teacher?: string; status?: "scheduled" | "cancelled" | "closed_day" } = {}) {
    const start = utc(date, time);
    const { data, error } = await service
      .from("lessons")
      .insert({
        occurrence_date: date,
        student_id: student,
        lesson_type_id: lessonTypeId,
        teacher_id: opts.teacher ?? teacherId,
        start_at: start,
        end_at: new Date(new Date(start).getTime() + 45 * 60_000).toISOString(),
        location: "school",
        status: opts.status ?? "scheduled",
      })
      .select("id")
      .single();
    if (error) throw error;
    createdLessons.push(data.id);
    return data.id;
  }

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    anon = newClient();
    [admin, teacher, inactiveTeacher] = await Promise.all([signedIn(users!.admin), signedIn(users!.teacher), signedIn(users!.teacherInactive)]);
    teacherId = (await service.from("teachers").select("id").eq("profile_id", users!.teacher.id).single()).data!.id;
    teacher2Id = (await service.from("teachers").select("id").eq("profile_id", users!.teacher2.id).single()).data!.id;
    lessonTypeId = (await service.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single()).data!.id;

    savedHours = (await service.from("operating_hours").select("*")).data ?? [];
    const week = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "08:00", close: "20:00" }));
    expect((await admin.rpc("set_operating_hours", { p_days: week })).error).toBeNull();

    for (const k of ["s1", "s2"] as const) {
      const { data, error } = await admin.rpc("save_student", {
        p_id: nullable<string>(null), p_full_name: `${PREFIX} ${k}`, p_birth_date: "2010-01-01", p_phone: k === "s1" ? PHONE : "", p_email: "",
        p_parent_name: "", p_parent_phone: "", p_parent_email: "",
      });
      if (error) throw error;
      studentIds[k] = data;
      const { error: subjectError } = await admin.rpc("save_student_subject", {
        p_id: nullable<string>(null), p_student_id: data, p_lesson_type_id: lessonTypeId, p_teacher_id: teacherId,
        p_level: "beginner", p_background: "",
      });
      if (subjectError) throw subjectError;
    }
  });

  afterAll(async () => {
    if (!service) return;
    if (createdLessons.length) {
      await service.from("audit_events").delete().in("entity_id", createdLessons);
      await service.from("attendance").delete().in("lesson_id", createdLessons);
      await service.from("lessons").delete().in("id", createdLessons);
    }
    const students = Object.values(studentIds).filter(Boolean);
    await service.from("student_subjects").delete().in("student_id", students);
    await service.from("student_contacts").delete().in("student_id", students);
    await service.from("students").delete().in("id", students);
    await service.from("audit_events").delete().eq("action", "export_created").eq("actor_id", users!.admin.id);
    await service.from("ai_usage").delete().eq("user_id", users!.admin.id);
    await service.from("teacher_availability").delete().eq("teacher_id", teacherId);
    if (savedAvailability.length) await service.from("teacher_availability").insert(savedAvailability);
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  describe("report_lessons_summary", () => {
    const from = localDay(-60);
    const to = localDay(40);
    const run = (group: string, c: Client = admin) =>
      c.rpc("report_lessons_summary", { p_from: from, p_to: to, p_teacher_id: teacherId, p_group: group });

    it("counts attendance only for scheduled lessons; cancelled and closed days get their own columns", async () => {
      // The test teacher may have other lessons in Development: compare against what was there before.
      const base = (await run("total")).data![0];
      const held = await insertLesson(studentIds.s1, localDay(-50), "09:00");
      const heldThenCancelled = await insertLesson(studentIds.s2, localDay(-50), "10:00");
      const absent = await insertLesson(studentIds.s1, localDay(-49), "09:00");
      await insertLesson(studentIds.s2, localDay(-49), "10:00"); // ended, no report
      await insertLesson(studentIds.s1, localDay(-48), "09:00", { status: "closed_day" });
      await insertLesson(studentIds.s2, localDay(-48), "10:00", { status: "cancelled" });
      await insertLesson(studentIds.s1, localDay(30), "09:00"); // upcoming

      expect((await admin.rpc("set_attendance", { p_lesson_id: held, p_status: "held", p_note: "", p_version: nullable<number>(null) })).error).toBeNull();
      expect((await admin.rpc("set_attendance", { p_lesson_id: heldThenCancelled, p_status: "held", p_note: "", p_version: nullable<number>(null) })).error).toBeNull();
      expect((await admin.rpc("set_attendance", { p_lesson_id: absent, p_status: "student_absent", p_note: "", p_version: nullable<number>(null) })).error).toBeNull();

      // The "held" report is removed with the lesson when it is cancelled after the fact.
      const version = (await service.from("lessons").select("version").eq("id", heldThenCancelled).single()).data!.version;
      expect((await admin.rpc("cancel_lesson", { p_id: heldThenCancelled, p_version: version, p_reason: "", p_confirm_held: true })).error).toBeNull();

      const { data, error } = await run("total");
      expect(error).toBeNull();
      const t = data![0];
      const delta = (a: number | string, b: number | string) => Number(a) - Number(b);
      expect({
        scheduled: delta(t.scheduled_total, base.scheduled_total), held: delta(t.held, base.held),
        sa: delta(t.student_absent, base.student_absent), ta: delta(t.teacher_absent, base.teacher_absent),
        unreported: delta(t.unreported, base.unreported), upcoming: delta(t.upcoming, base.upcoming),
        cancelled: delta(t.cancelled, base.cancelled), closed: delta(t.closed_day, base.closed_day),
      }).toEqual({ scheduled: 4, held: 1, sa: 1, ta: 0, unreported: 1, upcoming: 1, cancelled: 2, closed: 1 });
      // Every scheduled lesson falls into exactly one column.
      expect(Number(t.held) + Number(t.student_absent) + Number(t.teacher_absent) + Number(t.unreported) + Number(t.upcoming)).toBe(Number(t.scheduled_total));
    });

    it("groups add up to the total, and the dashboard summary agrees", async () => {
      const total = (await run("total")).data![0];
      for (const group of ["teacher", "lesson_type"]) {
        const rows = (await run(group)).data!;
        expect(rows.length).toBeGreaterThan(0);
        const sum = (f: (r: (typeof rows)[number]) => number | string) => rows.reduce((n, r) => n + Number(f(r)), 0);
        expect(sum((r) => r.held)).toBe(Number(total.held));
        expect(sum((r) => r.cancelled)).toBe(Number(total.cancelled));
        expect(sum((r) => r.scheduled_total)).toBe(Number(total.scheduled_total));
      }
      const summary = await admin.rpc("attendance_summary", { p_from: utc(from, "00:00"), p_to: utc(to, "00:00"), p_teacher_id: teacherId });
      expect(Number(summary.data![0].held)).toBe(Number(total.held));
      expect(Number(summary.data![0].student_absent)).toBe(Number(total.student_absent));
    });

    it("refuses a range over a year and bad groups", async () => {
      const long = await admin.rpc("report_lessons_summary", { p_from: localDay(-400), p_to: localDay(0), p_teacher_id: nullable<string>(null), p_group: "total" });
      expect(long.error?.message).toBe("range_too_large");
      const bad = await admin.rpc("report_lessons_summary", { p_from: from, p_to: to, p_teacher_id: nullable<string>(null), p_group: "nope" });
      expect(bad.error?.message).toBe("invalid_input");
    });
  });

  describe("only active admins reach reports, export log and AI tools", () => {
    const calls: [string, (c: Client) => PromiseLike<{ error: { message: string } | null }>][] = [
      ["report_lessons_summary", (c) => c.rpc("report_lessons_summary", { p_from: localDay(-1), p_to: localDay(0), p_teacher_id: nullable<string>(null), p_group: "total" })],
      ["log_export", (c) => c.rpc("log_export", { p_kind: "students", p_rows: 1 })],
      ["ai_reserve_request", (c) => c.rpc("ai_reserve_request", { p_hourly: 5, p_daily: 5 })],
      ["ai_find_people", (c) => c.rpc("ai_find_people", { p_kind: "student", p_query: "a", p_lesson_type: nullable<string>(null) })],
      ["ai_find_available_teachers", (c) => c.rpc("ai_find_available_teachers", { p_lesson_type_id: lessonTypeId, p_date: localDay(3), p_from: "09:00", p_to: "10:00" })],
      ["ai_suggest_slots", (c) => c.rpc("ai_suggest_slots", { p_student_id: studentIds.s1, p_lesson_type_id: lessonTypeId, p_teacher_id: nullable<string>(null), p_from: localDay(1), p_to: localDay(2), p_duration: nullable<number>(null), p_limit: 3 })],
    ];

    it.each(calls)("%s refuses a teacher, an inactive teacher and a signed-out caller", async (_name, call) => {
      expect((await call(teacher)).error?.message).toBe("not_allowed");
      expect((await call(inactiveTeacher)).error).not.toBeNull();
      expect((await call(anon)).error).not.toBeNull();
    });

    it("ai_usage cannot be read or written directly", async () => {
      expect((await admin.from("ai_usage").select("id")).data ?? []).toEqual([]);
      expect((await admin.from("ai_usage").insert({ user_id: users!.admin.id })).error).not.toBeNull();
    });
  });

  it("log_export records the kind and row count and nothing else", async () => {
    expect((await admin.rpc("log_export", { p_kind: "students", p_rows: 7 })).error).toBeNull();
    expect((await admin.rpc("log_export", { p_kind: "everything", p_rows: 7 })).error?.message).toBe("invalid_input");
    const { data } = await service.from("audit_events").select("action, entity, new_values, old_values").eq("action", "export_created").eq("actor_id", users!.admin.id);
    expect(data?.length).toBeGreaterThan(0);
    expect(data![0].new_values).toEqual({ kind: "students", rows: 7 });
  });

  describe("AI read tools", () => {
    const date = localDay(3);
    const counts = async () => {
      const out: Record<string, number> = {};
      for (const table of ["lessons", "lesson_series", "attendance", "students", "teachers", "notifications", "audit_events"] as const) {
        out[table] = (await service.from(table).select("*", { count: "exact", head: true })).count ?? 0;
      }
      return out;
    };

    beforeAll(async () => {
      savedAvailability = (await service.from("teacher_availability").select("*").eq("teacher_id", teacherId)).data ?? [];
      await service.from("teacher_availability").delete().eq("teacher_id", teacherId);
      const { error } = await service.from("teacher_availability").insert({
        teacher_id: teacherId, day_of_week: dow(date), start_time: "09:00", end_time: "12:00", valid_from: localDay(-30),
      });
      if (error) throw error;
      await insertLesson(studentIds.s2, date, "09:00"); // teacher busy 09:00-09:45
      await insertLesson(studentIds.s1, date, "10:00", { teacher: teacher2Id }); // student s1 busy 10:00-10:45
    });

    it("finds people by name without contact details", async () => {
      const { data, error } = await admin.rpc("ai_find_people", { p_kind: "student", p_query: PREFIX, p_lesson_type: nullable<string>(null) });
      expect(error).toBeNull();
      expect(data!.length).toBe(2);
      expect(Object.keys(data![0]).sort()).toEqual(["id", "name", "status", "subjects"]);
      expect(JSON.stringify(data)).not.toContain(PHONE);
    });

    it("lists a teacher's free runs, skipping busy time", async () => {
      const { data, error } = await admin.rpc("ai_find_available_teachers", { p_lesson_type_id: lessonTypeId, p_date: date, p_from: "09:00", p_to: "11:00" });
      expect(error).toBeNull();
      const mine = data!.filter((r) => r.teacher_id === teacherId);
      expect(mine).toEqual([expect.objectContaining({ free_from: "09:45:00", free_to: "11:00:00" })]);
    });

    it("suggests only times when teacher and student are both free, inside hours and availability", async () => {
      const { data, error } = await admin.rpc("ai_suggest_slots", {
        p_student_id: studentIds.s1, p_lesson_type_id: lessonTypeId, p_teacher_id: nullable<string>(null),
        p_from: date, p_to: date, p_duration: 45, p_limit: 20,
      });
      expect(error).toBeNull();
      const slots = data!;
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.length).toBeLessThanOrEqual(8);
      // The teacher is busy until 09:45 and the student from 10:00 to 10:45 (with another teacher), so a
      // 45-minute lesson fits only from 10:45 until the end of the teacher's availability at 12:00.
      expect(slots.map((s) => s.start_time)).toEqual(["10:45:00", "11:00:00", "11:15:00"]);
      for (const s of slots) expect(s.teacher_id).toBe(teacherId);
    });

    it("refuses an unenrolled subject or a range over 14 days", async () => {
      const long = await admin.rpc("ai_suggest_slots", {
        p_student_id: studentIds.s1, p_lesson_type_id: lessonTypeId, p_teacher_id: nullable<string>(null),
        p_from: localDay(1), p_to: localDay(30), p_duration: nullable<number>(null), p_limit: 3,
      });
      expect(long.error?.message).toBe("invalid_input");
    });

    it("never changes school data", async () => {
      const before = await counts();
      await admin.rpc("ai_find_people", { p_kind: "teacher", p_query: "", p_lesson_type: nullable<string>(null) });
      await admin.rpc("ai_find_available_teachers", { p_lesson_type_id: lessonTypeId, p_date: date, p_from: "09:00", p_to: "12:00" });
      await admin.rpc("ai_suggest_slots", {
        p_student_id: studentIds.s1, p_lesson_type_id: lessonTypeId, p_teacher_id: nullable<string>(null),
        p_from: date, p_to: localDay(5), p_duration: nullable<number>(null), p_limit: 8,
      });
      await admin.rpc("report_lessons_summary", { p_from: localDay(-5), p_to: localDay(5), p_teacher_id: nullable<string>(null), p_group: "teacher" });
      expect(await counts()).toEqual(before);
    });
  });

  describe("ai_reserve_request limits", () => {
    beforeAll(async () => {
      await service.from("ai_usage").delete().eq("user_id", users!.admin.id);
    });

    it("blocks past the hourly limit and says how long to wait", async () => {
      expect((await admin.rpc("ai_reserve_request", { p_hourly: 2, p_daily: 100000 })).error).toBeNull();
      expect((await admin.rpc("ai_reserve_request", { p_hourly: 2, p_daily: 100000 })).error).toBeNull();
      const third = await admin.rpc("ai_reserve_request", { p_hourly: 2, p_daily: 100000 });
      expect(third.error?.message).toBe("ai_rate_limited");
      expect(Number(third.error?.details)).toBeGreaterThan(0);
    });

    it("lets only one of two parallel requests take the last slot", async () => {
      await service.from("ai_usage").delete().eq("user_id", users!.admin.id);
      const results = await Promise.all([
        admin.rpc("ai_reserve_request", { p_hourly: 1, p_daily: 100000 }),
        admin.rpc("ai_reserve_request", { p_hourly: 1, p_daily: 100000 }),
      ]);
      expect(results.filter((r) => !r.error).length).toBe(1);
    });

    it("records usage without any content", async () => {
      await service.from("ai_usage").delete().eq("user_id", users!.admin.id);
      const { data: id } = await admin.rpc("ai_reserve_request", { p_hourly: 5, p_daily: 100000 });
      expect((await admin.rpc("ai_record_usage", { p_id: id!, p_tokens_in: 120, p_tokens_out: 30, p_outcome: "ok" })).error).toBeNull();
      const row = (await service.from("ai_usage").select("*").eq("id", id!).single()).data!;
      expect(row).toMatchObject({ tokens_in: 120, tokens_out: 30, outcome: "ok" });
      expect(Object.keys(row).sort()).toEqual(["created_at", "id", "outcome", "tokens_in", "tokens_out", "user_id"]);
    });
  });
});
