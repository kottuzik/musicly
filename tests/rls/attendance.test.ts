import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-att-${Date.now()}`;
const TEST_LESSON_TYPE = "תחום בדיקה";
const NOTE = "הערה פרטית על התלמיד";

type Client = SupabaseClient<Database>;
type Hours = Database["public"]["Tables"]["operating_hours"]["Row"];

function newClient(apiKey = key): Client {
  return createClient<Database>(url, apiKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signedIn(user: TestUser) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

// School-local date n days from today (negative = past).
function localDay(offset: number) {
  const d = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
}

// School-local date and time as a UTC instant (Asia/Jerusalem, +02:00 or +03:00).
function utc(date: string, time: string) {
  for (const offset of ["+02:00", "+03:00"]) {
    const instant = new Date(`${date}T${time}:00${offset}`);
    const local = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(instant);
    if (local === time) return instant.toISOString();
  }
  throw new Error("bad time");
}
const nullable = (v: string | null) => v as unknown as string;

describe.skipIf(!users)("Attendance and its audit trail (Development)", () => {
  let service: Client;
  let admin: Client;
  let teacher: Client;
  let teacher2: Client;
  let lessonTypeId: string;
  const teacherIds = { teacher: "", teacher2: "" };
  const studentIds = { s1: "", s2: "" };
  let savedHours: Hours[] = [];

  async function insertLesson(
    student: string,
    date: string,
    time: string,
    opts: { teacherId?: string; status?: "scheduled" | "cancelled" | "closed_day" } = {},
  ) {
    const start = utc(date, time);
    const { data, error } = await service
      .from("lessons")
      .insert({
        occurrence_date: date,
        student_id: student,
        lesson_type_id: lessonTypeId,
        teacher_id: opts.teacherId ?? teacherIds.teacher,
        start_at: start,
        end_at: new Date(new Date(start).getTime() + 45 * 60_000).toISOString(),
        location: "school",
        status: opts.status ?? "scheduled",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const lessonVersion = async (id: string) => (await service.from("lessons").select("version").eq("id", id).single()).data!.version;
  const attendanceRow = async (id: string) => (await service.from("attendance").select("*").eq("lesson_id", id).maybeSingle()).data;
  const events = async (id: string) =>
    (await service.from("audit_events").select("action, old_values, new_values").eq("entity_id", id).order("created_at")).data ?? [];

  const report = (client: Client, id: string, status: Database["public"]["Enums"]["attendance_status"], opts: { note?: string; v?: number | null } = {}) =>
    client.rpc("set_attendance", { p_lesson_id: id, p_status: status, p_note: opts.note ?? "", p_version: (opts.v ?? null) as number });

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [admin, teacher, teacher2] = await Promise.all([signedIn(users!.admin), signedIn(users!.teacher), signedIn(users!.teacher2)]);
    for (const k of ["teacher", "teacher2"] as const) {
      const { data, error } = await service.from("teachers").select("id").eq("profile_id", users![k].id).single();
      if (error) throw error;
      teacherIds[k] = data.id;
    }
    const { data: lt, error: ltError } = await service.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single();
    if (ltError) throw ltError;
    lessonTypeId = lt.id;

    const { data: hours } = await service.from("operating_hours").select("*");
    savedHours = hours ?? [];
    const week = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "08:00", close: "20:00" }));
    const { error: hoursError } = await admin.rpc("set_operating_hours", { p_days: week });
    if (hoursError) throw hoursError;

    for (const k of ["s1", "s2"] as const) {
      const { data, error } = await admin.rpc("save_student", {
        p_id: nullable(null), p_full_name: `${PREFIX} ${k}`, p_birth_date: "2010-01-01", p_phone: "", p_email: "",
        p_parent_name: "", p_parent_phone: "", p_parent_email: "",
      });
      if (error) throw error;
      studentIds[k] = data;
      const { error: subjectError } = await admin.rpc("save_student_subject", {
        p_id: nullable(null), p_student_id: data, p_lesson_type_id: lessonTypeId, p_teacher_id: teacherIds.teacher,
        p_level: "beginner", p_background: "",
      });
      if (subjectError) throw subjectError;
    }
  });

  afterAll(async () => {
    if (!service) return;
    await service.from("teachers").update({ status: "active" }).eq("id", teacherIds.teacher2);
    const students = Object.values(studentIds).filter(Boolean);
    const { data: lessons } = await service.from("lessons").select("id").in("student_id", students);
    const ids = (lessons ?? []).map((l) => l.id);
    if (ids.length) await service.from("audit_events").delete().in("entity_id", ids);
    await service.from("lessons").delete().in("student_id", students);
    await service.from("student_subjects").delete().in("student_id", students);
    await service.from("students").delete().in("id", students);
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  it("a teacher reports their own lesson; the log keeps the status but never the note", async () => {
    const id = await insertLesson(studentIds.s1, localDay(-3), "09:00");
    const { error } = await report(teacher, id, "held", { note: NOTE });
    expect(error).toBeNull();
    const row = await attendanceRow(id);
    expect(row?.status).toBe("held");
    expect(row?.note).toBe(NOTE);

    const log = await events(id);
    expect(log.map((e) => e.action)).toEqual(["attendance_reported"]);
    expect(log[0].new_values).toEqual({ status: "held", has_note: true });
    expect(JSON.stringify(log)).not.toContain(NOTE);
  });

  it("another teacher, an inactive teacher and direct writes are all refused", async () => {
    const id = await insertLesson(studentIds.s1, localDay(-3), "10:00");
    expect((await report(teacher2, id, "held")).error?.message).toBe("not_allowed");

    const mine = await insertLesson(studentIds.s2, localDay(-3), "10:00", { teacherId: teacherIds.teacher2 });
    await service.from("teachers").update({ status: "inactive" }).eq("id", teacherIds.teacher2);
    expect((await report(teacher2, mine, "held")).error?.message).toBe("not_allowed");
    await service.from("teachers").update({ status: "active" }).eq("id", teacherIds.teacher2);

    const direct = await teacher.from("attendance").insert({ lesson_id: id, status: "held" });
    expect(direct.error).not.toBeNull();
    expect(await attendanceRow(id)).toBeNull();
  });

  it("a teacher sees only attendance of their own lessons", async () => {
    const id = await insertLesson(studentIds.s1, localDay(-3), "11:00");
    await report(admin, id, "student_absent");
    expect(((await teacher.from("attendance").select("lesson_id").eq("lesson_id", id)).data ?? []).length).toBe(1);
    expect(((await teacher2.from("attendance").select("lesson_id").eq("lesson_id", id)).data ?? []).length).toBe(0);
  });

  it("an admin corrects any lesson; a stale version is refused and an unchanged save logs nothing", async () => {
    const id = await insertLesson(studentIds.s1, localDay(-2), "09:00");
    expect((await report(teacher, id, "held")).error).toBeNull();
    // A report exists, so an empty version means the form is out of date.
    expect((await report(admin, id, "student_absent", { v: null })).error?.message).toBe("attendance_changed");
    expect((await report(admin, id, "student_absent", { v: 99 })).error?.message).toBe("attendance_changed");

    expect((await report(admin, id, "student_absent", { v: 1 })).error).toBeNull();
    const row = await attendanceRow(id);
    expect(row?.version).toBe(2);
    expect(row?.status).toBe("student_absent");

    // Same values again: no change, no new log entry.
    expect((await report(admin, id, "student_absent", { v: 2 })).error).toBeNull();
    const log = await events(id);
    expect(log.map((e) => e.action)).toEqual(["attendance_reported", "attendance_changed"]);
    expect(log[1].old_values).toEqual({ status: "held", has_note: false });
    expect(log[1].new_values).toEqual({ status: "student_absent", has_note: false });
  });

  it("a report can be entered before the lesson takes place", async () => {
    const id = await insertLesson(studentIds.s2, localDay(30), "09:00");
    expect((await report(teacher, id, "teacher_absent")).error).toBeNull();
  });

  it("no attendance for a cancelled or closed-day lesson", async () => {
    const cancelled = await insertLesson(studentIds.s1, localDay(-2), "12:00", { status: "cancelled" });
    const closed = await insertLesson(studentIds.s2, localDay(-2), "12:00", { status: "closed_day" });
    expect((await report(admin, cancelled, "held")).error?.message).toBe("lesson_not_scheduled");
    expect((await report(admin, closed, "held")).error?.message).toBe("lesson_not_scheduled");
  });

  it("cancelling a lesson marked held needs confirmation, removes the report and keeps it in the log", async () => {
    const id = await insertLesson(studentIds.s1, localDay(-4), "09:00");
    await report(teacher, id, "held", { note: NOTE });

    const v = await lessonVersion(id);
    expect((await admin.rpc("cancel_lesson", { p_id: id, p_version: v, p_reason: "" })).error?.message).toBe("held_confirmation_required");
    expect((await service.from("lessons").select("status").eq("id", id).single()).data?.status).toBe("scheduled");

    const { error } = await admin.rpc("cancel_lesson", { p_id: id, p_version: v, p_reason: "דווח בטעות", p_confirm_held: true });
    expect(error).toBeNull();
    expect((await service.from("lessons").select("status").eq("id", id).single()).data?.status).toBe("cancelled");
    expect(await attendanceRow(id)).toBeNull();

    const log = await events(id);
    const held = log.find((e) => e.action === "held_lesson_cancelled");
    expect(held?.old_values).toEqual({ attendance_status: "held", has_note: true });
    expect(JSON.stringify(log)).not.toContain(NOTE);

    // Restoring brings the lesson back without a report: the teacher reports again.
    const restored = await admin.rpc("restore_lesson", {
      p_id: id, p_version: await lessonVersion(id), p_date: nullable(null), p_start: nullable(null), p_confirm_outside_hours: false,
    });
    expect(restored.error).toBeNull();
    expect(await attendanceRow(id)).toBeNull();
    expect((await report(teacher, id, "held")).error).toBeNull();
  });

  it("a past lesson without a held report still cannot be cancelled, and a teacher cannot cancel", async () => {
    const id = await insertLesson(studentIds.s2, localDay(-11), "09:00");
    await report(admin, id, "student_absent");
    const v = await lessonVersion(id);
    expect((await admin.rpc("cancel_lesson", { p_id: id, p_version: v, p_reason: "", p_confirm_held: true })).error?.message).toBe("lesson_past");

    const held = await insertLesson(studentIds.s1, localDay(-11), "13:00");
    await report(admin, held, "held");
    expect((await teacher.rpc("cancel_lesson", { p_id: held, p_version: await lessonVersion(held), p_reason: "", p_confirm_held: true })).error?.message).toBe("not_allowed");
  });

  it("a future lesson already marked held also needs the confirmation", async () => {
    const id = await insertLesson(studentIds.s1, localDay(40), "09:00");
    await report(teacher, id, "held");
    const v = await lessonVersion(id);
    expect((await admin.rpc("cancel_lesson", { p_id: id, p_version: v, p_reason: "" })).error?.message).toBe("held_confirmation_required");
    expect((await admin.rpc("cancel_lesson", { p_id: id, p_version: v, p_reason: "", p_confirm_held: true })).error).toBeNull();
  });

  it("any other way a lesson stops being scheduled also clears the report (and logs it)", async () => {
    const id = await insertLesson(studentIds.s2, localDay(-5), "09:00");
    await report(admin, id, "teacher_absent");
    const { error } = await service.from("lessons").update({ status: "closed_day" }).eq("id", id);
    expect(error).toBeNull();
    expect(await attendanceRow(id)).toBeNull();
    const cleared = (await events(id)).find((e) => e.action === "attendance_cleared");
    expect(cleared?.old_values).toEqual({ attendance_status: "teacher_absent", has_note: false });
  });

  it("history: a teacher sees only their own lessons, an admin sees every teacher's", async () => {
    const month = localDay(-6).slice(0, 7);
    const own = await insertLesson(studentIds.s1, localDay(-6), "15:00");
    const other = await insertLesson(studentIds.s1, localDay(-6), "16:00", { teacherId: teacherIds.teacher2 });
    const range = { p_from: utc(`${month}-01`, "00:00"), p_to: new Date(Date.now() + 90 * 86_400_000).toISOString() };

    const mine = await teacher.rpc("list_history_lessons", { p_student_id: studentIds.s1, p_teacher_id: nullable(null), ...range });
    expect(mine.error).toBeNull();
    const mineIds = (mine.data ?? []).map((l) => l.id);
    expect(mineIds).toContain(own);
    expect(mineIds).not.toContain(other);

    // A teacher cannot widen the list by naming another teacher.
    const sneaky = await teacher.rpc("list_history_lessons", { p_student_id: studentIds.s1, p_teacher_id: teacherIds.teacher2, ...range });
    expect((sneaky.data ?? []).map((l) => l.id)).not.toContain(other);

    const all = await admin.rpc("list_history_lessons", { p_student_id: studentIds.s1, p_teacher_id: nullable(null), ...range });
    const allIds = (all.data ?? []).map((l) => l.id);
    expect(allIds).toEqual(expect.arrayContaining([own, other]));
  });

  it("unreported lessons: last 30 days only, own lessons for a teacher, gone once reported", async () => {
    const recent = await insertLesson(studentIds.s2, localDay(-7), "09:00");
    const old = await insertLesson(studentIds.s2, localDay(-45), "09:00");
    const theirs = await insertLesson(studentIds.s1, localDay(-7), "17:00", { teacherId: teacherIds.teacher2 });

    const asAdmin = (await admin.rpc("list_unreported_lessons", { p_limit: 100 })).data ?? [];
    expect(asAdmin.map((l) => l.id)).toEqual(expect.arrayContaining([recent, theirs]));
    expect(asAdmin.map((l) => l.id)).not.toContain(old);

    const asTeacher = (await teacher.rpc("list_unreported_lessons", { p_limit: 100 })).data ?? [];
    expect(asTeacher.map((l) => l.id)).toContain(recent);
    expect(asTeacher.map((l) => l.id)).not.toContain(theirs);

    await report(teacher, recent, "held");
    const after = (await teacher.rpc("list_unreported_lessons", { p_limit: 100 })).data ?? [];
    expect(after.map((l) => l.id)).not.toContain(recent);
  });

  it("the summary counts only scheduled lessons, and only admins may read it", async () => {
    const from = utc(localDay(-10), "00:00");
    const to = utc(localDay(-9), "00:00");
    const a = await insertLesson(studentIds.s1, localDay(-10), "09:00");
    const b = await insertLesson(studentIds.s2, localDay(-10), "10:00");
    const c = await insertLesson(studentIds.s1, localDay(-10), "12:00");
    const d = await insertLesson(studentIds.s2, localDay(-10), "13:00");
    await report(teacher, a, "held");
    await report(teacher, b, "held");
    await report(teacher, c, "student_absent");
    // d stays unreported.
    expect(d).toBeTruthy();

    const first = (await admin.rpc("attendance_summary", { p_from: from, p_to: to, p_teacher_id: nullable(null) })).data?.[0];
    expect(Number(first?.held)).toBeGreaterThanOrEqual(2);

    // Cancelling one held lesson afterwards lowers the count by exactly one.
    const v = await lessonVersion(b);
    await admin.rpc("cancel_lesson", { p_id: b, p_version: v, p_reason: "", p_confirm_held: true });
    const second = (await admin.rpc("attendance_summary", { p_from: from, p_to: to, p_teacher_id: nullable(null) })).data?.[0];
    expect(Number(second?.held)).toBe(Number(first?.held) - 1);
    expect(Number(second?.unreported)).toBeGreaterThanOrEqual(1);

    expect((await teacher.rpc("attendance_summary", { p_from: from, p_to: to, p_teacher_id: nullable(null) })).error?.message).toBe("not_allowed");
  });

  it("the activity log is for admins only and holds no names", async () => {
    const id = await insertLesson(studentIds.s1, localDay(-8), "09:00");
    await report(teacher, id, "held", { note: NOTE });
    const range = { p_from: utc(localDay(-1), "00:00"), p_to: new Date(Date.now() + 86_400_000).toISOString(), p_kind: "attendance", p_offset: 0 };

    expect((await teacher.rpc("list_audit_events", range)).error?.message).toBe("not_allowed");
    const { data, error } = await admin.rpc("list_audit_events", range);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // Reported 8 days ago in lesson time but logged now: it appears with the student looked up by name.
    const mine = (data ?? []).find((e) => e.entity_id === id);
    expect(mine?.action).toBe("attendance_reported");
    expect(mine?.student_name).toBe(`${PREFIX} s1`);
    expect(JSON.stringify(mine?.new_values)).not.toContain(PREFIX);
  });
});
