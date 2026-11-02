import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-lcr-${Date.now()}`;
const TEST_LESSON_TYPE = "תחום בדיקה";

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

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A Monday about 140 days ahead; each test uses its own week.
function baseMonday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 140);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const BASE = baseMonday();
const week = (i: number) => addDays(BASE, 7 * i);
const nullable = <T,>(v: T | null) => v as unknown as T;
const schoolDate = (instant: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(instant);

describe.skipIf(!users)("Teacher requests to change or cancel a lesson (Development)", () => {
  let service: Client;
  let admin: Client;
  let admin2: Client;
  let teacher: Client;
  let teacher2: Client;
  let lessonTypeId: string;
  const teacherIds = { teacher: "", teacher2: "" };
  const studentIds: string[] = [];
  let savedHours: Hours[] = [];

  async function newStudent(name: string) {
    const { data, error } = await admin.rpc("save_student", {
      p_id: nullable<string>(null), p_full_name: `${PREFIX} ${name}`, p_birth_date: "2010-01-01", p_phone: "",
      p_email: "", p_parent_name: "", p_parent_phone: "", p_parent_email: "",
    });
    if (error) throw error;
    studentIds.push(data);
    const { error: subjectError } = await admin.rpc("save_student_subject", {
      p_id: nullable<string>(null), p_student_id: data, p_lesson_type_id: lessonTypeId,
      p_teacher_id: teacherIds.teacher, p_level: "beginner", p_background: "",
    });
    if (subjectError) throw subjectError;
    return data;
  }

  async function newLesson(student: string, date: string, start = "10:00") {
    const { data, error } = await admin.rpc("book_lesson", {
      p_student_id: student, p_lesson_type_id: lessonTypeId, p_teacher_id: teacherIds.teacher, p_date: date,
      p_start_time: start, p_duration: 45, p_location: "school", p_confirm_outside_hours: false,
    });
    if (error) throw error;
    return (data as unknown as { id: string }).id;
  }

  const ask = (client: Client, lessonId: string, kind: "cancel" | "change", opts: { date?: string; start?: string; reason?: string } = {}) =>
    client.rpc("request_lesson_change", {
      p_lesson_id: lessonId, p_kind: kind, p_date: nullable<string>(opts.date ?? null),
      p_start: nullable<string>(opts.start ?? null), p_reason: opts.reason ?? "",
    });

  const requestRow = async (id: string) =>
    (await service.from("lesson_change_requests").select("*").eq("id", id).single()).data!;
  const lessonRow = async (id: string) => (await service.from("lessons").select("*").eq("id", id).single()).data!;

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [admin, admin2, teacher, teacher2] = await Promise.all([
      signedIn(users!.admin), signedIn(users!.admin2), signedIn(users!.teacher), signedIn(users!.teacher2),
    ]);
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
    const days = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "08:00", close: "20:00" }));
    const { error: hoursError } = await admin.rpc("set_operating_hours", { p_days: days });
    if (hoursError) throw hoursError;

    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds));
    const today = schoolDate(new Date());
    const slots = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
      { teacher_id: teacherIds.teacher, day_of_week: day, start_time: "09:00", end_time: "18:00", valid_from: today },
      { teacher_id: teacherIds.teacher2, day_of_week: day, start_time: "09:00", end_time: "20:00", valid_from: today },
    ]);
    const { error: slotError } = await service.from("teacher_availability").insert(slots);
    if (slotError) throw slotError;
  });

  afterAll(async () => {
    if (!service) return;
    const { data: lessons } = await service.from("lessons").select("id").in("student_id", studentIds);
    const ids = (lessons ?? []).map((l) => l.id);
    if (ids.length) {
      const { data: reqs } = await service.from("lesson_change_requests").select("id").in("lesson_id", ids);
      await service.from("audit_events").delete().in("entity_id", [...ids, ...(reqs ?? []).map((r) => r.id)]);
      await service.from("lesson_change_requests").delete().in("lesson_id", ids);
    }
    await service.from("lessons").delete().in("student_id", studentIds);
    await service.from("exception_booking_requests").delete().in("student_id", studentIds);
    await service.from("student_subjects").delete().in("student_id", studentIds);
    await service.from("students").delete().in("id", studentIds);
    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds).filter(Boolean));
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  it("only the lesson's own teacher can ask; admins and other teachers cannot; no direct writes", async () => {
    const id = await newLesson(await newStudent("a"), week(0));
    expect((await ask(teacher2, id, "cancel")).error?.message).toBe("not_allowed");
    expect((await ask(admin, id, "cancel")).error?.message).toBe("not_allowed");
    const direct = await teacher.from("lesson_change_requests").insert({
      lesson_id: id, teacher_id: teacherIds.teacher, kind: "cancel", requested_by: users!.teacher.id,
    });
    expect(direct.error).not.toBeNull();
    const own = await ask(teacher, id, "cancel", { reason: "אני חולה" });
    expect(own.error).toBeNull();
    expect((await requestRow(own.data!)).reason).toBe("אני חולה");
  });

  it("allows one pending request per lesson", async () => {
    const id = await newLesson(await newStudent("b"), week(1));
    expect((await ask(teacher, id, "cancel")).error).toBeNull();
    expect((await ask(teacher, id, "change", { date: week(1), start: "11:00" })).error?.message).toBe("change_request_pending");
  });

  it("is too late on the day of the lesson", async () => {
    const student = await newStudent("c");
    const startAt = new Date(Date.now() + 10 * 60 * 1000);
    const { data: lesson, error } = await service.from("lessons").insert({
      occurrence_date: schoolDate(startAt), student_id: student, lesson_type_id: lessonTypeId,
      teacher_id: teacherIds.teacher, start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 45 * 60000).toISOString(),
      location: "school",
    }).select("id").single();
    expect(error).toBeNull();
    const result = await ask(teacher, lesson!.id, "cancel");
    // Right after midnight the lesson would already be "tomorrow", which is still allowed.
    expect(result.error?.message).toBe(schoolDate(startAt) === schoolDate(new Date()) ? "request_too_late" : undefined);
  });

  it("an admin approves a cancellation: the lesson is cancelled with the teacher's reason", async () => {
    const id = await newLesson(await newStudent("d"), week(2));
    const { data: reqId } = await ask(teacher, id, "cancel", { reason: "נסיעה" });
    const req = await requestRow(reqId!);
    expect((await teacher.rpc("decide_lesson_change_request", { p_id: reqId!, p_version: req.version, p_approve: true, p_note: "" })).error?.message).toBe("not_allowed");

    const decided = await admin.rpc("decide_lesson_change_request", { p_id: reqId!, p_version: req.version, p_approve: true, p_note: "בסדר" });
    expect(decided.error).toBeNull();
    const after = await requestRow(reqId!);
    expect(after.status).toBe("approved");
    expect(after.decision_note).toBe("בסדר");
    const lesson = await lessonRow(id);
    expect(lesson.status).toBe("cancelled");
    expect(lesson.cancel_source).toBe("teacher_request");
    expect(lesson.cancel_reason).toBe("נסיעה");
  });

  it("a rejection leaves the lesson as it was and keeps the admin's note", async () => {
    const id = await newLesson(await newStudent("e"), week(3));
    const { data: reqId } = await ask(teacher, id, "cancel");
    const req = await requestRow(reqId!);
    expect((await admin.rpc("decide_lesson_change_request", { p_id: reqId!, p_version: req.version, p_approve: false, p_note: "אין מחליף" })).error).toBeNull();
    const after = await requestRow(reqId!);
    expect(after.status).toBe("rejected");
    expect(after.decision_note).toBe("אין מחליף");
    expect((await lessonRow(id)).status).toBe("scheduled");
  });

  it("a change is approved by setting the new time, which closes the request", async () => {
    const date = week(4);
    const id = await newLesson(await newStudent("f"), date);
    const { data: reqId } = await ask(teacher, id, "change", { date, start: "11:00", reason: "מופע" });
    const req = await requestRow(reqId!);
    expect(req.proposed_start_time).toBe("11:00:00");
    expect((await admin.rpc("decide_lesson_change_request", { p_id: reqId!, p_version: req.version, p_approve: true, p_note: "" })).error?.message).toBe("change_requires_update");

    const lesson = await lessonRow(id);
    const moved = await admin.rpc("update_lesson", {
      p_id: id, p_version: lesson.version, p_date: date, p_start: "11:00", p_duration: 45,
      p_teacher_id: teacherIds.teacher, p_location: "school", p_confirm_outside_hours: false, p_change_request_id: reqId!,
    });
    expect(moved.error).toBeNull();
    expect((await requestRow(reqId!)).status).toBe("approved");
    expect(new Date((await lessonRow(id)).start_at).getTime()).toBeGreaterThan(new Date(lesson.start_at).getTime());
  });

  it("a teacher can withdraw their request; a stale version or a handled request is refused", async () => {
    const id = await newLesson(await newStudent("g"), week(5));
    const { data: reqId } = await ask(teacher, id, "cancel");
    const req = await requestRow(reqId!);
    expect((await teacher.rpc("cancel_lesson_change_request", { p_id: reqId!, p_version: req.version + 3 })).error?.message).toBe("request_already_handled");
    expect((await teacher2.rpc("cancel_lesson_change_request", { p_id: reqId!, p_version: req.version })).error?.message).toBe("request_already_handled");
    expect((await teacher.rpc("cancel_lesson_change_request", { p_id: reqId!, p_version: req.version })).error).toBeNull();
    expect((await requestRow(reqId!)).status).toBe("cancelled");
    expect((await admin.rpc("decide_lesson_change_request", { p_id: reqId!, p_version: req.version, p_approve: true, p_note: "" })).error?.message).toBe("request_already_handled");
  });

  it("lets exactly one of two admins decide at the same time", async () => {
    const id = await newLesson(await newStudent("h"), week(6));
    const { data: reqId } = await ask(teacher, id, "cancel");
    const req = await requestRow(reqId!);
    const results = await Promise.all([
      admin.rpc("decide_lesson_change_request", { p_id: reqId!, p_version: req.version, p_approve: true, p_note: "" }),
      admin2.rpc("decide_lesson_change_request", { p_id: reqId!, p_version: req.version, p_approve: true, p_note: "" }),
    ]);
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.message).toBe("request_already_handled");
  });

  it("lists requests with names: admins see all, a teacher only their own", async () => {
    const mine = await newLesson(await newStudent("i"), week(7));
    const { data: reqId } = await ask(teacher, mine, "cancel", { reason: "בדיקה" });
    const asAdmin = await admin.rpc("list_lesson_change_requests", { p_pending_only: true });
    const found = (asAdmin.data ?? []).find((r) => r.id === reqId);
    expect(found?.student_name).toBe(`${PREFIX} i`);
    expect(found?.kind).toBe("cancel");
    expect(found?.reason).toBe("בדיקה");
    expect((await teacher.rpc("list_lesson_change_requests", { p_pending_only: true })).data?.some((r) => r.id === reqId)).toBe(true);
    expect((await teacher2.rpc("list_lesson_change_requests", { p_pending_only: true })).data?.some((r) => r.id === reqId)).toBe(false);
    expect((await teacher2.from("lesson_change_requests").select("id").eq("id", reqId!)).data).toEqual([]);
  });

  it("a request closes by itself once its lesson has started", async () => {
    const student = await newStudent("j");
    const startAt = new Date(Date.now() - 5 * 60 * 1000);
    const { data: lesson } = await service.from("lessons").insert({
      occurrence_date: schoolDate(startAt), student_id: student, lesson_type_id: lessonTypeId,
      teacher_id: teacherIds.teacher2, start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 45 * 60000).toISOString(),
      location: "school",
    }).select("id").single();
    const { data: req } = await service.from("lesson_change_requests").insert({
      lesson_id: lesson!.id, teacher_id: teacherIds.teacher2, kind: "cancel", requested_by: users!.teacher.id,
    }).select("id").single();
    const listed = await admin.rpc("list_lesson_change_requests", { p_pending_only: false });
    expect(listed.data?.find((r) => r.id === req!.id)?.status).toBe("cancelled");
  });
});
