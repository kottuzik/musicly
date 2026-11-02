import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-single-${Date.now()}`;
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

// A Monday about three months ahead, away from the other lesson tests.
function baseMonday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 100);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const D = baseMonday();
// Each test uses its own Monday so lessons from different tests never collide.
const day = (i: number) => {
  const d = new Date(`${D}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * i);
  return d.toISOString().slice(0, 10);
};
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
const result = (data: unknown) => data as { result: string; id: string; suggestions?: string[] };

describe.skipIf(!users)("Changing, cancelling and restoring one lesson (Development)", () => {
  let service: Client;
  let admin: Client;
  let teacher: Client;
  let teacher2: Client;
  let lessonTypeId: string;
  const teacherIds = { teacher: "", teacher2: "" };
  const studentIds = { s1: "", s2: "", s3: "" };
  let savedHours: Hours[] = [];

  const book = (student: string, teacherId: string, start: string, date: string) =>
    admin.rpc("book_lesson", {
      p_student_id: student, p_lesson_type_id: lessonTypeId, p_teacher_id: teacherId, p_date: date,
      p_start_time: start, p_duration: 45, p_location: "school", p_confirm_outside_hours: false,
    });

  async function newLesson(student: string, start: string, date: string, teacherId = teacherIds.teacher) {
    const { data, error } = await book(student, teacherId, start, date);
    if (error) throw error;
    return result(data).id;
  }

  const version = async (id: string) => (await service.from("lessons").select("version").eq("id", id).single()).data!.version;
  const row = async (id: string) =>
    (await service.from("lessons").select("*").eq("id", id).single()).data!;

  const update = async (id: string, date: string, start: string, opts: { teacherId?: string; confirm?: boolean; v?: number } = {}) =>
    admin.rpc("update_lesson", {
      p_id: id, p_version: opts.v ?? (await version(id)), p_date: date, p_start: start, p_duration: 45,
      p_teacher_id: opts.teacherId ?? teacherIds.teacher, p_location: "zoom",
      p_confirm_outside_hours: opts.confirm ?? false, p_change_request_id: nullable(null),
    });

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [admin, teacher, teacher2] = await Promise.all([
      signedIn(users!.admin), signedIn(users!.teacher), signedIn(users!.teacher2),
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
    const week = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "08:00", close: "20:00" }));
    const { error: hoursError } = await admin.rpc("set_operating_hours", { p_days: week });
    if (hoursError) throw hoursError;

    // teacher: 09:00–18:00 every day; teacher2: 09:00–20:00.
    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const slots = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
      { teacher_id: teacherIds.teacher, day_of_week: day, start_time: "09:00", end_time: "18:00", valid_from: today },
      { teacher_id: teacherIds.teacher2, day_of_week: day, start_time: "09:00", end_time: "20:00", valid_from: today },
    ]);
    const { error: slotError } = await service.from("teacher_availability").insert(slots);
    if (slotError) throw slotError;

    for (const k of ["s1", "s2", "s3"] as const) {
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
    const students = Object.values(studentIds).filter(Boolean);
    const { data: lessons } = await service.from("lessons").select("id").in("student_id", students);
    const ids = (lessons ?? []).map((l) => l.id);
    if (ids.length) {
      await service.from("audit_events").delete().in("entity_id", ids);
      await service.from("lesson_change_requests").delete().in("lesson_id", ids);
    }
    await service.from("lessons").delete().in("student_id", students);
    await service.from("exception_booking_requests").delete().in("student_id", students);
    await service.from("student_subjects").delete().in("student_id", students);
    await service.from("students").delete().in("id", students);
    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds).filter(Boolean));
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  it("teachers cannot change or cancel, and the audit log is read-only for them", async () => {
    const d = day(0);
    const id = await newLesson(studentIds.s1, "09:00", d);
    const v = await version(id);
    expect((await teacher.rpc("update_lesson", {
      p_id: id, p_version: v, p_date: d, p_start: "10:00", p_duration: 45, p_teacher_id: teacherIds.teacher,
      p_location: "school", p_confirm_outside_hours: false, p_change_request_id: nullable(null),
    })).error?.message).toBe("not_allowed");
    expect((await teacher.rpc("cancel_lesson", { p_id: id, p_version: v, p_reason: "" })).error?.message).toBe("not_allowed");
    expect((await teacher.from("audit_events").select("id")).data ?? []).toEqual([]);
  });

  it("changes time and location, rejects a stale version, allows shifting into its own time, logs it", async () => {
    const d = day(1);
    const id = await newLesson(studentIds.s1, "10:00", d);
    const first = await update(id, d, "10:15");
    expect(first.error).toBeNull();
    expect(result(first.data).result).toBe("lesson");
    const after = await row(id);
    expect(after.location).toBe("zoom");
    expect(after.version).toBeGreaterThan(1);
    expect((await update(id, d, "11:00", { v: 1 })).error?.message).toBe("lesson_changed");

    const { data: events } = await service.from("audit_events").select("action").eq("entity_id", id);
    expect(events?.map((e) => e.action)).toContain("lesson_updated");
  });

  it("refuses a time taken by another lesson of the teacher or of the student", async () => {
    const d = day(2);
    const mine = await newLesson(studentIds.s1, "11:00", d);
    await newLesson(studentIds.s2, "12:00", d);
    expect((await update(mine, d, "12:15")).error?.message).toBe("teacher_busy");
    await newLesson(studentIds.s1, "16:00", d, teacherIds.teacher2);
    expect((await update(mine, d, "16:15")).error?.message).toBe("student_busy");
  });

  it("a move outside the teacher's availability waits for their approval", async () => {
    const d = day(3);
    const id = await newLesson(studentIds.s2, "13:00", d);
    const before = await row(id);
    const { data, error } = await update(id, d, "19:00");
    expect(error).toBeNull();
    expect(result(data).result).toBe("request");
    expect((await row(id)).start_at).toBe(before.start_at);

    const requestId = result(data).id;
    const { data: req } = await service.from("exception_booking_requests").select("kind, version, target_lesson_id").eq("id", requestId).single();
    expect(req?.kind).toBe("lesson_change");
    expect(req?.target_lesson_id).toBe(id);

    const approved = await teacher.rpc("respond_exception_request", { p_id: requestId, p_version: req!.version, p_approve: true, p_note: "" });
    expect(approved.error).toBeNull();
    expect((approved.data as { result: string }).result).toBe("approved");
    expect((await row(id)).start_at).toBe(utc(d, "19:00").replace(/\.000Z$/, "+00:00"));
  });

  it("a new change replaces an earlier request to the teacher that was not answered", async () => {
    const d = day(30);
    const id = await newLesson(studentIds.s2, "13:00", d);
    const first = await update(id, d, "19:00");
    const firstId = result(first.data).id;
    expect(result(first.data).result).toBe("request");

    const second = await update(id, d, "19:15");
    expect(second.error).toBeNull();
    expect(result(second.data).result).toBe("request");
    expect(result(second.data).id).not.toBe(firstId);
    expect((await service.from("exception_booking_requests").select("id").eq("id", firstId)).data).toEqual([]);
    const { data: pending } = await service.from("exception_booking_requests").select("id").eq("target_lesson_id", id).eq("status", "pending");
    expect(pending).toHaveLength(1);
    expect((await service.from("audit_events").select("action").eq("entity_id", id).eq("action", "change_request_replaced")).data).toHaveLength(1);

    // A change into the teacher's availability applies at once and leaves no request waiting.
    const direct = await update(id, d, "15:00");
    expect(result(direct.data).result).toBe("lesson");
    const { data: left } = await service.from("exception_booking_requests").select("id").eq("target_lesson_id", id).eq("status", "pending");
    expect(left).toEqual([]);
  });

  it("an approval fails cleanly when the time was taken in the meantime", async () => {
    const d = day(4);
    const id = await newLesson(studentIds.s1, "14:00", d);
    const before = await row(id);
    const { data } = await update(id, d, "18:15");
    const requestId = result(data).id;
    const { data: req } = await service.from("exception_booking_requests").select("version").eq("id", requestId).single();
    await service.from("lessons").insert({
      occurrence_date: d, student_id: studentIds.s3, lesson_type_id: lessonTypeId, teacher_id: teacherIds.teacher,
      start_at: utc(d, "18:15"), end_at: utc(d, "19:00"), location: "school",
    });
    const { data: responded } = await teacher.rpc("respond_exception_request", { p_id: requestId, p_version: req!.version, p_approve: true, p_note: "" });
    expect((responded as { result: string }).result).toBe("cannot_schedule");
    expect((await row(id)).start_at).toBe(before.start_at);
    expect((await service.from("exception_booking_requests").select("status").eq("id", requestId).single()).data?.status).toBe("cannot_schedule");
  });

  it("outside the school's hours needs confirmation", async () => {
    const d = day(5);
    const id = await newLesson(studentIds.s2, "09:00", d, teacherIds.teacher2);
    expect((await update(id, d, "19:30", { teacherId: teacherIds.teacher2 })).error?.message).toBe("outside_hours_confirm_required");
    const ok = await update(id, d, "19:30", { teacherId: teacherIds.teacher2, confirm: true });
    expect(ok.error).toBeNull();
    // 19:30-20:15 is also beyond teacher2's availability, so it goes to them as a request that remembers the flag.
    expect(result(ok.data).result).toBe("request");
    const { data: req } = await service.from("exception_booking_requests").select("outside_hours").eq("id", result(ok.data).id).single();
    expect(req?.outside_hours).toBe(true);
  });

  it("lists only free substitutes who teach the subject, for admins only", async () => {
    const d = day(6);
    const id = await newLesson(studentIds.s1, "17:00", d);
    const { data } = await admin.rpc("list_substitutes", { p_lesson_id: id });
    const ids = (data ?? []).map((s) => s.teacher_id);
    expect(ids).toContain(teacherIds.teacher2);
    expect(ids).not.toContain(teacherIds.teacher);
    expect((await teacher.rpc("list_substitutes", { p_lesson_id: id })).error?.message).toBe("not_allowed");
    // A busy substitute drops off the list.
    await newLesson(studentIds.s2, "17:00", d, teacherIds.teacher2);
    const { data: busy } = await admin.rpc("list_substitutes", { p_lesson_id: id });
    expect((busy ?? []).map((s) => s.teacher_id)).not.toContain(teacherIds.teacher2);
  });

  it("cancels with details, frees the time, and refuses a second cancel", async () => {
    const d = day(7);
    const id = await newLesson(studentIds.s2, "15:00", d);
    const v = await version(id);
    expect((await admin.rpc("cancel_lesson", { p_id: id, p_version: v + 5, p_reason: "" })).error?.message).toBe("lesson_changed");
    const { error } = await admin.rpc("cancel_lesson", { p_id: id, p_version: v, p_reason: "המורה חולה" });
    expect(error).toBeNull();
    const cancelled = await row(id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancel_source).toBe("admin");
    expect(cancelled.cancel_reason).toBe("המורה חולה");
    expect(cancelled.cancelled_at).not.toBeNull();
    expect((await book(studentIds.s1, teacherIds.teacher, "15:00", d)).error).toBeNull();
    expect((await admin.rpc("cancel_lesson", { p_id: id, p_version: await version(id), p_reason: "" })).error?.message).toBe("lesson_not_scheduled");
  });

  it("restores at the original time, or offers other times when it was taken", async () => {
    const d = day(8);
    const id = await newLesson(studentIds.s2, "11:00", d, teacherIds.teacher2);
    await admin.rpc("cancel_lesson", { p_id: id, p_version: await version(id), p_reason: "" });
    const takeId = await newLesson(studentIds.s1, "11:00", d, teacherIds.teacher2);
    const args = async () => ({
      p_id: id, p_version: await version(id), p_date: nullable(null), p_start: nullable(null), p_confirm_outside_hours: false,
    });
    const taken = await admin.rpc("restore_lesson", await args());
    expect(result(taken.data).result).toBe("slot_taken");
    expect(result(taken.data).suggestions!.length).toBeGreaterThan(0);

    await admin.rpc("cancel_lesson", { p_id: takeId, p_version: await version(takeId), p_reason: "" });
    const back = await admin.rpc("restore_lesson", await args());
    expect(back.error).toBeNull();
    expect(result(back.data).result).toBe("lesson");
    const restored = await row(id);
    expect(restored.status).toBe("scheduled");
    expect(restored.cancel_source).toBeNull();
    expect((await admin.rpc("restore_lesson", await args())).error?.message).toBe("lesson_not_cancelled");
  });

  it("a teacher restores their own cancelled lesson, but not someone else's", async () => {
    const d = day(9);
    const id = await newLesson(studentIds.s1, "12:00", d);
    await admin.rpc("cancel_lesson", { p_id: id, p_version: await version(id), p_reason: "" });
    const args = async () => ({
      p_id: id, p_version: await version(id), p_date: nullable(null), p_start: nullable(null), p_confirm_outside_hours: false,
    });
    expect((await teacher2.rpc("restore_lesson", await args())).error?.message).toBe("not_allowed");
    const own = await teacher.rpc("restore_lesson", await args());
    expect(own.error).toBeNull();
    expect(result(own.data).result).toBe("lesson");
  });

  it("an admin restoring outside the teacher's availability sends them a request", async () => {
    const d = day(10);
    const id = await newLesson(studentIds.s2, "13:30", d);
    await admin.rpc("cancel_lesson", { p_id: id, p_version: await version(id), p_reason: "" });
    const { data, error } = await admin.rpc("restore_lesson", {
      p_id: id, p_version: await version(id), p_date: d, p_start: "19:00", p_confirm_outside_hours: false,
    });
    expect(error).toBeNull();
    expect(result(data).result).toBe("request");
    expect((await row(id)).status).toBe("cancelled");
    const { data: req } = await service.from("exception_booking_requests").select("kind, version").eq("id", result(data).id).single();
    expect(req?.kind).toBe("restore");
    const approved = await teacher.rpc("respond_exception_request", { p_id: result(data).id, p_version: req!.version, p_approve: true, p_note: "" });
    expect((approved.data as { result: string }).result).toBe("approved");
    expect((await row(id)).status).toBe("scheduled");
  });

  it("clears the attention flag on request", async () => {
    const d = day(11);
    const id = await newLesson(studentIds.s1, "10:30", d, teacherIds.teacher2);
    await service.from("lessons").update({ requires_attention: true, attention_reason: "outside_hours" }).eq("id", id);
    expect((await row(id)).requires_attention).toBe(true);
    const { error } = await admin.rpc("clear_lesson_attention", { p_id: id, p_version: await version(id) });
    expect(error).toBeNull();
    expect((await row(id)).requires_attention).toBe(false);
    expect((await teacher.rpc("clear_lesson_attention", { p_id: id, p_version: await version(id) })).error?.message).toBe("not_allowed");
  });
});
