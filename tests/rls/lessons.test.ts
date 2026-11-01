import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-lessons-${Date.now()}`;
const TEST_LESSON_TYPE = "תחום בדיקה";

type Client = SupabaseClient<Database>;
type Hours = Database["public"]["Tables"]["operating_hours"]["Row"];
type Location = Database["public"]["Enums"]["lesson_location"];

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

// A Monday about two months ahead: far from today's data, well inside the 12-month window.
function baseMonday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 60);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const D = baseMonday();
const nullable = (v: string | null) => v as unknown as string;

describe.skipIf(!users)("Lessons, series and booking requests (Development)", () => {
  let service: Client;
  let admin: Client;
  let teacher: Client;
  let teacher2: Client;
  let anon: Client;
  let lessonTypeId: string;
  const teacherIds = { teacher: "", teacher2: "" };
  const studentIds = { s1: "", s2: "", s3: "" };
  let savedHours: Hours[] = [];
  const extraTypeIds: string[] = [];
  let extraTeacherId = "";

  const book = (
    client: Client,
    student: string,
    teacherId: string,
    date: string,
    start: string,
    opts: { duration?: number; location?: Location; confirm?: boolean } = {},
  ) =>
    client.rpc("book_lesson", {
      p_student_id: student,
      p_lesson_type_id: lessonTypeId,
      p_teacher_id: teacherId,
      p_date: date,
      p_start_time: start,
      p_duration: opts.duration ?? 45,
      p_location: opts.location ?? "school",
      p_confirm_outside_hours: opts.confirm ?? false,
    });

  const result = (data: unknown) => data as { result: string; id: string };

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    anon = newClient();
    [admin, teacher, teacher2] = await Promise.all([
      signedIn(users!.admin),
      signedIn(users!.teacher),
      signedIn(users!.teacher2),
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

    // teacher: 09:00–18:00 every day (as two adjacent slots, to check they merge); teacher2: 09:00–20:00.
    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const slots = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
      { teacher_id: teacherIds.teacher, day_of_week: day, start_time: "09:00", end_time: "12:00", valid_from: today },
      { teacher_id: teacherIds.teacher, day_of_week: day, start_time: "12:00", end_time: "18:00", valid_from: today },
      { teacher_id: teacherIds.teacher2, day_of_week: day, start_time: "09:00", end_time: "20:00", valid_from: today },
    ]);
    const { error: slotError } = await service.from("teacher_availability").insert(slots);
    if (slotError) throw slotError;

    for (const k of ["s1", "s2", "s3"] as const) {
      const { data, error } = await admin.rpc("save_student", {
        p_id: nullable(null),
        p_full_name: `${PREFIX} ${k}`,
        p_birth_date: "2010-01-01",
        p_phone: "",
        p_email: "",
        p_parent_name: "",
        p_parent_phone: "",
        p_parent_email: "",
      });
      if (error) throw error;
      studentIds[k] = data;
      const { error: subjectError } = await admin.rpc("save_student_subject", {
        p_id: nullable(null),
        p_student_id: data,
        p_lesson_type_id: lessonTypeId,
        p_teacher_id: teacherIds.teacher,
        p_level: "beginner",
        p_background: "",
      });
      if (subjectError) throw subjectError;
    }
  });

  afterAll(async () => {
    if (!service) return;
    const students = Object.values(studentIds).filter(Boolean);
    await service.from("lessons").delete().in("student_id", students);
    await service.from("lesson_series").delete().in("student_id", students);
    await service.from("exception_booking_requests").delete().in("student_id", students);
    await service.from("student_subjects").delete().in("student_id", students);
    await service.from("students").delete().in("id", students);
    await service.from("school_closures").delete().like("name", `${PREFIX}%`);
    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds).filter(Boolean));
    if (extraTeacherId) await service.from("teachers").delete().eq("id", extraTeacherId);
    if (extraTypeIds.length) {
      await service.from("teacher_skills").delete().in("lesson_type_id", extraTypeIds);
      await service.from("lesson_types").delete().in("id", extraTypeIds);
    }
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  describe("one-time lessons", () => {
    it("only admins book; there is no direct write access", async () => {
      expect((await book(teacher, studentIds.s1, teacherIds.teacher, D, "10:00")).error?.message).toBe("not_allowed");
      const direct = await admin.from("lessons").insert({
        occurrence_date: D,
        student_id: studentIds.s1,
        lesson_type_id: lessonTypeId,
        teacher_id: teacherIds.teacher,
        start_at: `${D}T07:00:00Z`,
        end_at: `${D}T07:45:00Z`,
        location: "school",
      });
      expect(direct.error).not.toBeNull();
    });

    it("an admin books a Zoom lesson; only its teacher (and admins) can see it", async () => {
      const { data, error } = await book(admin, studentIds.s1, teacherIds.teacher, D, "10:00", { location: "zoom" });
      expect(error).toBeNull();
      expect(result(data).result).toBe("lesson");

      const own = await teacher.from("lessons").select("id, location").eq("id", result(data).id);
      expect(own.data).toEqual([{ id: result(data).id, location: "zoom" }]);
      expect((await teacher2.from("lessons").select("id").eq("id", result(data).id)).data).toEqual([]);
      expect((await anon.from("lessons").select("id")).data ?? []).toEqual([]);
    });

    it("blocks a teacher overlap and a student overlap, but allows back-to-back lessons", async () => {
      expect((await book(admin, studentIds.s2, teacherIds.teacher, D, "10:15")).error?.message).toBe("teacher_busy");
      expect((await book(admin, studentIds.s1, teacherIds.teacher2, D, "10:30")).error?.message).toBe("student_busy");
      const adjacent = await book(admin, studentIds.s2, teacherIds.teacher, D, "10:45");
      expect(adjacent.error).toBeNull();
      expect(result(adjacent.data).result).toBe("lesson");
    });

    it("lets exactly one of two simultaneous bookings through", async () => {
      const sameTeacher = await Promise.all([
        book(admin, studentIds.s1, teacherIds.teacher, D, "13:00"),
        book(admin, studentIds.s2, teacherIds.teacher, D, "13:00"),
      ]);
      expect(sameTeacher.filter((r) => !r.error)).toHaveLength(1);
      expect(sameTeacher.find((r) => r.error)?.error?.message).toBe("teacher_busy");

      const sameStudent = await Promise.all([
        book(admin, studentIds.s3, teacherIds.teacher, D, "15:00"),
        book(admin, studentIds.s3, teacherIds.teacher2, D, "15:00"),
      ]);
      expect(sameStudent.filter((r) => !r.error)).toHaveLength(1);
      expect(sameStudent.find((r) => r.error)?.error?.message).toMatch(/^(student_busy|teacher_busy)$/);
    });

    it("a substitute teacher sees the student's name in the calendar", async () => {
      const { error } = await book(admin, studentIds.s1, teacherIds.teacher2, D, "16:00");
      expect(error).toBeNull();
      const { data } = await teacher2.rpc("list_calendar_lessons", {
        p_from: `${D}T00:00:00Z`,
        p_to: `${addDays(D, 1)}T00:00:00Z`,
        p_teacher_id: nullable(null),
        p_student_id: nullable(null),
        p_lesson_type_id: nullable(null),
        p_include_cancelled: false,
      });
      expect(data?.map((l) => l.student_name)).toContain(`${PREFIX} s1`);
      expect(data?.every((l) => l.teacher_id === teacherIds.teacher2)).toBe(true);
    });

    it("asks for confirmation outside school hours", async () => {
      expect((await book(admin, studentIds.s1, teacherIds.teacher2, D, "07:00")).error?.message).toBe(
        "outside_hours_confirm_required",
      );
      // Confirmed, but also outside the teacher's availability: a request, not a lesson.
      const confirmed = await book(admin, studentIds.s1, teacherIds.teacher2, D, "07:00", { confirm: true });
      expect(confirmed.error).toBeNull();
      expect(result(confirmed.data).result).toBe("request");
    });
  });

  describe("bookings outside the teacher's availability", () => {
    let requestId: string;

    it("creates a pending request that holds no time", async () => {
      const { data, error } = await book(admin, studentIds.s1, teacherIds.teacher, D, "18:30");
      expect(error).toBeNull();
      expect(result(data).result).toBe("request");
      requestId = result(data).id;
      const { count } = await service.from("lessons").select("id", { count: "exact", head: true }).eq("exception_request_id", requestId);
      expect(count).toBe(0);
      // The same student can still be booked at that time with another teacher.
      const other = await book(admin, studentIds.s1, teacherIds.teacher2, D, "18:30");
      expect(result(other.data).result).toBe("lesson");
    });

    it("approval re-checks the time and closes as cannot_schedule when taken", async () => {
      const { data: r } = await service.from("exception_booking_requests").select("version").eq("id", requestId).single();
      expect((await teacher2.rpc("respond_exception_request", { p_id: requestId, p_version: r!.version, p_approve: true, p_note: "" })).error?.message).toBe(
        "not_allowed",
      );
      const { data, error } = await teacher.rpc("respond_exception_request", {
        p_id: requestId,
        p_version: r!.version,
        p_approve: true,
        p_note: "",
      });
      expect(error).toBeNull();
      expect((data as { result: string }).result).toBe("cannot_schedule");
      const { data: after } = await service.from("exception_booking_requests").select("status, result_note").eq("id", requestId).single();
      expect(after?.status).toBe("cannot_schedule");
      expect(after?.result_note).toBeTruthy();
    });

    it("approval books the lesson when still free; a stale version is rejected", async () => {
      const { data } = await book(admin, studentIds.s2, teacherIds.teacher, D, "19:00");
      const id = result(data).id;
      const { data: r } = await service.from("exception_booking_requests").select("version").eq("id", id).single();
      const approved = await teacher.rpc("respond_exception_request", { p_id: id, p_version: r!.version, p_approve: true, p_note: "" });
      expect(approved.error).toBeNull();
      expect((approved.data as { result: string }).result).toBe("approved");
      const { data: lesson } = await service.from("lessons").select("status").eq("exception_request_id", id).single();
      expect(lesson?.status).toBe("scheduled");

      const again = await teacher.rpc("respond_exception_request", { p_id: id, p_version: r!.version, p_approve: false, p_note: "" });
      expect(again.error?.message).toBe("request_already_handled");
    });

    it("expires a pending request once its time has passed", async () => {
      const { data, error } = await service
        .from("exception_booking_requests")
        .insert({
          kind: "single",
          student_id: studentIds.s3,
          lesson_type_id: lessonTypeId,
          teacher_id: teacherIds.teacher,
          location: "school",
          start_date: "2020-01-01",
          start_time: "10:00",
          duration_minutes: 45,
          first_start_at: "2020-01-01T08:00:00Z",
          requested_by: users!.admin.id,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      await admin.rpc("expire_exception_requests");
      const { data: after } = await service.from("exception_booking_requests").select("status").eq("id", data!.id).single();
      expect(after?.status).toBe("expired");
    });
  });

  describe("weekly series", () => {
    it("creates a series with an end date: closures marked, busy weeks skipped", async () => {
      // Week 2 is a closure day, week 3 the teacher is already busy.
      const closure = await admin.rpc("save_closure", {
        p_name: `${PREFIX} סגירה`,
        p_start_date: addDays(D, 7),
        p_end_date: addDays(D, 7),
        p_holiday_key: "",
      });
      expect(closure.error).toBeNull();
      expect((await book(admin, studentIds.s1, teacherIds.teacher, addDays(D, 14), "12:00")).error).toBeNull();

      const meetings = [{ day: 1, start: "12:00" }];
      const preview = await admin.rpc("preview_series", {
        p_student_id: studentIds.s2,
        p_lesson_type_id: lessonTypeId,
        p_meetings: meetings,
        p_start_date: D,
        p_end_date: addDays(D, 21),
      });
      expect(preview.error).toBeNull();
      const p = (preview.data as { scheduled: number; closed_dates: string[]; skipped: { date: string; reason: string }[] }[])[0];
      expect(p.scheduled).toBe(2);
      expect(p.closed_dates).toEqual([addDays(D, 7)]);
      expect(p.skipped).toEqual([{ date: addDays(D, 14), reason: "teacher_busy" }]);

      const { data, error } = await admin.rpc("create_series", {
        p_student_id: studentIds.s2,
        p_lesson_type_id: lessonTypeId,
        p_meetings: meetings,
        p_start_date: D,
        p_end_date: addDays(D, 21),
        p_location: "school",
        p_confirm_outside_hours: false,
      });
      expect(error).toBeNull();
      const created = (data as { id: string; created: number; skipped: unknown[] }[])[0];
      expect(created.created).toBe(2);
      expect(created.skipped).toHaveLength(1);
      const { data: rows } = await service.from("lessons").select("occurrence_date, status").eq("series_id", created.id).order("occurrence_date");
      expect(rows).toEqual([
        { occurrence_date: D, status: "scheduled" },
        { occurrence_date: addDays(D, 7), status: "closed_day" },
        { occurrence_date: addDays(D, 21), status: "scheduled" },
      ]);
    });

    it("an open-ended series fills a 12-month window, and a new closure marks its lessons", async () => {
      const { data, error } = await admin.rpc("create_series", {
        p_student_id: studentIds.s3,
        p_lesson_type_id: lessonTypeId,
        p_meetings: [{ day: 2, start: "09:00" }],
        p_start_date: D,
        p_end_date: nullable(null),
        p_location: "zoom",
        p_confirm_outside_hours: false,
      });
      expect(error).toBeNull();
      const id = (data as { id: string }[])[0].id;
      const { count } = await service.from("lessons").select("id", { count: "exact", head: true }).eq("series_id", id);
      expect(count).toBeGreaterThan(40);
      expect(count).toBeLessThanOrEqual(53);

      const target = addDays(D, 1 + 28);
      await admin.rpc("save_closure", { p_name: `${PREFIX} סגירה 2`, p_start_date: target, p_end_date: target, p_holiday_key: "" });
      const { data: lesson } = await service.from("lessons").select("status").eq("series_id", id).eq("occurrence_date", target).single();
      expect(lesson?.status).toBe("closed_day");
    });

    it("a series is only with the regular teacher; outside weekly availability it becomes one request", async () => {
      const { data, error } = await admin.rpc("create_series", {
        p_student_id: studentIds.s1,
        p_lesson_type_id: lessonTypeId,
        p_meetings: [{ day: 3, start: "18:00" }],
        p_start_date: D,
        p_end_date: addDays(D, 30),
        p_location: "school",
        p_confirm_outside_hours: false,
      });
      expect(error).toBeNull();
      expect((data as { result: string }[])[0].result).toBe("request");
    });
  });

  describe("guards on related data", () => {
    it("a subject with planned lessons cannot be removed, nor its regular teacher changed", async () => {
      const { data: ss } = await service.from("student_subjects").select("id").eq("student_id", studentIds.s2).single();
      expect((await admin.rpc("remove_student_subject", { p_id: ss!.id })).error?.message).toBe("subject_has_lessons");
      const change = await admin.rpc("save_student_subject", {
        p_id: ss!.id,
        p_student_id: studentIds.s2,
        p_lesson_type_id: lessonTypeId,
        p_teacher_id: teacherIds.teacher2,
        p_level: "beginner",
        p_background: "",
      });
      expect(change.error?.message).toBe("regular_teacher_has_lessons");
    });

    it("deleting a lesson type: blocked by students or a teacher's only subject; otherwise removed from teachers atomically", async () => {
      expect((await admin.rpc("delete_lesson_type", { p_id: lessonTypeId, p_remove_from_teachers: true })).error?.message).toBe(
        "lesson_type_has_students",
      );

      const { data: types } = await service
        .from("lesson_types")
        .insert([
          { name: `${PREFIX} A`, default_duration_minutes: 30, color: "#38BDF8" },
          { name: `${PREFIX} B`, default_duration_minutes: 30, color: "#34D399" },
        ])
        .select("id, name");
      const a = types!.find((t) => t.name.endsWith(" A"))!.id;
      const b = types!.find((t) => t.name.endsWith(" B"))!.id;
      extraTypeIds.push(a, b);

      // A: taught by teacher2 (who also teaches the test subject).
      await service.from("teacher_skills").insert({ teacher_id: teacherIds.teacher2, lesson_type_id: a });
      expect((await admin.rpc("delete_lesson_type", { p_id: a, p_remove_from_teachers: false })).error?.message).toBe(
        "lesson_type_has_teachers",
      );
      expect((await teacher.rpc("delete_lesson_type", { p_id: a, p_remove_from_teachers: true })).error?.message).toBe("not_allowed");
      expect((await admin.rpc("delete_lesson_type", { p_id: a, p_remove_from_teachers: true })).error).toBeNull();
      const { count } = await service.from("teacher_skills").select("*", { count: "exact", head: true }).eq("lesson_type_id", a);
      expect(count).toBe(0);

      // B: the only subject of a teacher.
      const { data: extra } = await service
        .from("teachers")
        .insert({ full_name: `${PREFIX} מורה`, email: `${PREFIX}@example.test` })
        .select("id")
        .single();
      extraTeacherId = extra!.id;
      await service.from("teacher_skills").insert({ teacher_id: extraTeacherId, lesson_type_id: b });
      expect((await admin.rpc("delete_lesson_type", { p_id: b, p_remove_from_teachers: true })).error?.message).toBe(
        "lesson_type_only_skill",
      );
    });
  });
});
