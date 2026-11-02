import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-series-${Date.now()}`;
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

// A Monday about a month ahead. Each test gets its own 7-week block so series never collide.
function baseMonday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 30);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const BASE = baseMonday();
const block = (i: number) => addDays(BASE, 49 * i);
const nullable = <T,>(v: T | null) => v as unknown as T;
const localTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

describe.skipIf(!users)("Changing, stopping and extending series (Development)", () => {
  let service: Client;
  let admin: Client;
  let teacher: Client;
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

  // A weekly series for the student with the regular teacher, from `start` for six weeks.
  async function newSeries(student: string, start: string, hhmm: string, weeks = 6) {
    const { data, error } = await admin.rpc("create_series", {
      p_student_id: student, p_lesson_type_id: lessonTypeId, p_meetings: [{ day: 1, start: hhmm }],
      p_start_date: start, p_end_date: addDays(start, 7 * (weeks - 1)), p_location: "school", p_confirm_outside_hours: false,
    });
    if (error) throw error;
    return (data as unknown as { id: string; result: string }[])[0].id;
  }

  const lessonsOf = async (seriesId: string) =>
    (await service.from("lessons").select("*").eq("series_id", seriesId).order("occurrence_date")).data ?? [];

  const change = (seriesId: string, from: string, start: string, opts: { teacherId?: string; day?: number; confirm?: boolean } = {}) =>
    admin.rpc("change_series", {
      p_series_id: seriesId, p_from_date: from, p_day: opts.day ?? 1, p_start: start, p_duration: 45,
      p_teacher_id: opts.teacherId ?? teacherIds.teacher, p_location: "school", p_confirm_outside_hours: opts.confirm ?? false,
    });

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [admin, teacher] = await Promise.all([signedIn(users!.admin), signedIn(users!.teacher)]);
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

    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const slots = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
      { teacher_id: teacherIds.teacher, day_of_week: day, start_time: "09:00", end_time: "18:00", valid_from: today },
      { teacher_id: teacherIds.teacher2, day_of_week: day, start_time: "09:00", end_time: "20:00", valid_from: today },
    ]);
    const { error: slotError } = await service.from("teacher_availability").insert(slots);
    if (slotError) throw slotError;
  });

  afterAll(async () => {
    if (!service) return;
    const { data: lessons } = await service.from("lessons").select("id, series_id").in("student_id", studentIds);
    const ids = (lessons ?? []).map((l) => l.id);
    const { data: series } = await service.from("lesson_series").select("id").in("student_id", studentIds);
    const seriesIds = (series ?? []).map((s) => s.id);
    await service.from("audit_events").delete().in("entity_id", [...ids, ...seriesIds, ...studentIds]);
    await service.from("lessons").delete().in("student_id", studentIds);
    await service.from("exception_booking_requests").delete().in("student_id", studentIds);
    await service.from("lesson_series").delete().in("student_id", studentIds);
    await service.from("student_subjects").delete().in("student_id", studentIds);
    await service.from("students").delete().in("id", studentIds);
    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds).filter(Boolean));
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  it("teachers cannot change, stop or extend a series", async () => {
    const start = block(0);
    const student = await newStudent("a");
    const id = await newSeries(student, start, "10:00");
    expect((await teacher.rpc("change_series", {
      p_series_id: id, p_from_date: start, p_day: 1, p_start: "11:00", p_duration: 45,
      p_teacher_id: teacherIds.teacher, p_location: "school", p_confirm_outside_hours: false,
    })).error?.message).toBe("not_allowed");
    expect((await teacher.rpc("stop_series", { p_series_id: id, p_from_date: start })).error?.message).toBe("not_allowed");
    expect((await teacher.rpc("extend_series", { p_series_id: id, p_end_date: nullable<string>(null), p_resume_from: nullable<string>(null) })).error?.message).toBe("not_allowed");
  });

  it("changes the time from a date: earlier meetings and past lessons stay, later ones move to a new series", async () => {
    const start = block(1);
    const student = await newStudent("b");
    const id = await newSeries(student, start, "10:00");
    // A lesson that already happened, in the same series.
    const past = await service.from("lessons").insert({
      series_id: id, occurrence_date: "2020-01-06", student_id: student, lesson_type_id: lessonTypeId,
      teacher_id: teacherIds.teacher, start_at: "2020-01-06T08:00:00Z", end_at: "2020-01-06T08:45:00Z", location: "school",
    }).select("id").single();
    expect(past.error).toBeNull();

    const from = addDays(start, 14);
    const { data, error } = await change(id, from, "11:00");
    expect(error).toBeNull();
    const res = data as { result: string; new_series_id: string; moved: number; flagged: number };
    expect(res.result).toBe("series");
    expect(res.moved).toBe(4);
    expect(res.flagged).toBe(0);

    const old = await lessonsOf(id);
    const oldFuture = old.filter((l) => l.occurrence_date >= start);
    expect(oldFuture.map((l) => l.occurrence_date)).toEqual([start, addDays(start, 7)]);
    expect(oldFuture.every((l) => localTime(l.start_at) === "10:00")).toBe(true);
    expect(old.find((l) => l.occurrence_date === "2020-01-06")?.start_at).toBe("2020-01-06T08:00:00+00:00");
    const oldRow = (await service.from("lesson_series").select("status, end_date").eq("id", id).single()).data!;
    expect(oldRow).toEqual({ status: "ended", end_date: addDays(from, -1) });

    const moved = await lessonsOf(res.new_series_id);
    expect(moved).toHaveLength(4);
    expect(moved.every((l) => localTime(l.start_at) === "11:00" && l.status === "scheduled")).toBe(true);
    const created = (await service.from("lesson_series").select("start_time, start_date").eq("id", res.new_series_id).single()).data!;
    expect(created).toEqual({ start_time: "11:00:00", start_date: from });
  });

  it("a meeting that clashes stays where it was, flagged for attention; the rest move", async () => {
    const start = block(2);
    const student = await newStudent("c");
    const other = await newStudent("d");
    const id = await newSeries(student, start, "10:00");
    // Another student's lesson with the same teacher at the new time, in week 3.
    const clash = addDays(start, 21);
    const { error: bookError } = await admin.rpc("book_lesson", {
      p_student_id: other, p_lesson_type_id: lessonTypeId, p_teacher_id: teacherIds.teacher, p_date: clash,
      p_start_time: "11:00", p_duration: 45, p_location: "school", p_confirm_outside_hours: false,
    });
    expect(bookError).toBeNull();

    const preview = await admin.rpc("preview_series_change", {
      p_series_id: id, p_from_date: start, p_day: 1, p_start: "11:00", p_duration: 45,
      p_teacher_id: teacherIds.teacher, p_location: "school",
    });
    const meetings = (preview.data as unknown as { meetings: { outcome: string }[] }).meetings;
    expect(meetings.map((m) => m.outcome)).toEqual(["move", "move", "move", "teacher_busy", "move", "move"]);

    const { data, error } = await change(id, start, "11:00");
    expect(error).toBeNull();
    const res = data as { moved: number; flagged: number; new_series_id: string };
    expect(res.moved).toBe(5);
    expect(res.flagged).toBe(1);
    const flagged = (await lessonsOf(id)).filter((l) => l.requires_attention);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].attention_reason).toBe("series_change_conflict");
    expect(flagged[0].occurrence_date).toBe(clash);
    expect(localTime(flagged[0].start_at)).toBe("10:00");
  });

  it("a new teacher becomes the regular teacher, including for the student's other series of the subject", async () => {
    const start = block(3);
    const student = await newStudent("e");
    const main = await newSeries(student, start, "10:00");
    // A second series on Wednesday.
    const wed = addDays(start, 2);
    const { data: second, error: secondError } = await admin.rpc("create_series", {
      p_student_id: student, p_lesson_type_id: lessonTypeId, p_meetings: [{ day: 3, start: "12:00" }],
      p_start_date: wed, p_end_date: addDays(wed, 35), p_location: "school", p_confirm_outside_hours: false,
    });
    expect(secondError).toBeNull();
    const secondId = (second as unknown as { id: string }[])[0].id;

    const from = addDays(start, 14);
    const { data, error } = await change(main, from, "10:00", { teacherId: teacherIds.teacher2 });
    expect(error).toBeNull();
    expect((data as { result: string }).result).toBe("series");

    const regular = (await service.from("student_subjects").select("regular_teacher_id").eq("student_id", student).eq("lesson_type_id", lessonTypeId).single()).data!;
    expect(regular.regular_teacher_id).toBe(teacherIds.teacher2);
    const futureLessons = (await service.from("lessons").select("teacher_id, occurrence_date, series_id").eq("student_id", student).gte("occurrence_date", from)).data ?? [];
    expect(futureLessons.length).toBeGreaterThan(0);
    expect(futureLessons.every((l) => l.teacher_id === teacherIds.teacher2)).toBe(true);
    // Earlier lessons keep the old teacher.
    const earlier = (await service.from("lessons").select("teacher_id").eq("student_id", student).lt("occurrence_date", from)).data ?? [];
    expect(earlier.every((l) => l.teacher_id === teacherIds.teacher)).toBe(true);
    expect((await service.from("lesson_series").select("status").eq("id", secondId).single()).data?.status).toBe("ended");
  });

  it("a change outside the teacher's availability waits for their approval", async () => {
    const start = block(4);
    const student = await newStudent("f");
    const id = await newSeries(student, start, "10:00");
    const { data, error } = await change(id, start, "19:00");
    expect(error).toBeNull();
    const res = data as { result: string; id: string };
    expect(res.result).toBe("request");
    // Nothing changed yet.
    expect((await lessonsOf(id)).every((l) => localTime(l.start_at) === "10:00")).toBe(true);
    expect((await change(id, start, "19:15")).error?.message).toBe("change_request_pending");

    const { data: req } = await service.from("exception_booking_requests").select("kind, version, apply_from, target_series_id").eq("id", res.id).single();
    expect(req).toMatchObject({ kind: "series_change", apply_from: start, target_series_id: id });
    const approved = await teacher.rpc("respond_exception_request", { p_id: res.id, p_version: req!.version, p_approve: true, p_note: "" });
    expect((approved.data as { result: string }).result).toBe("approved");
    const after = (await service.from("exception_booking_requests").select("series_id").eq("id", res.id).single()).data!;
    const moved = await lessonsOf(after.series_id!);
    expect(moved).toHaveLength(6);
    expect(moved.every((l) => localTime(l.start_at) === "19:00")).toBe(true);
  });

  it("stops a series from a date, then resumes it later without creating the weeks in between", async () => {
    const start = block(5);
    const student = await newStudent("g");
    const id = await newSeries(student, start, "10:00");
    const stopFrom = addDays(start, 14);
    const stop = await admin.rpc("stop_series", { p_series_id: id, p_from_date: stopFrom });
    expect(stop.error).toBeNull();
    expect((stop.data as { cancelled: number }).cancelled).toBe(4);
    const afterStop = await lessonsOf(id);
    expect(afterStop.filter((l) => l.status === "scheduled")).toHaveLength(2);
    const cancelled = afterStop.filter((l) => l.status === "cancelled");
    expect(cancelled.every((l) => l.cancel_source === "series_stopped")).toBe(true);
    expect((await service.from("lesson_series").select("status, end_date").eq("id", id).single()).data).toEqual({ status: "ended", end_date: addDays(stopFrom, -1) });
    expect((await admin.rpc("stop_series", { p_series_id: id, p_from_date: stopFrom })).error?.message).toBe("series_ended");

    const resumeFrom = addDays(start, 28);
    const end = addDays(start, 35);
    const preview = await admin.rpc("preview_series_extend", { p_series_id: id, p_end_date: end, p_resume_from: resumeFrom });
    expect(preview.error).toBeNull();
    expect((preview.data as { restore: number }).restore).toBe(2);
    const resumed = await admin.rpc("extend_series", { p_series_id: id, p_end_date: end, p_resume_from: resumeFrom });
    expect(resumed.error).toBeNull();
    expect((resumed.data as { restored: number }).restored).toBe(2);

    const lessons = await lessonsOf(id);
    const byDate = new Map(lessons.map((l) => [l.occurrence_date, l.status]));
    expect(byDate.get(addDays(start, 14))).toBe("cancelled");
    expect(byDate.get(addDays(start, 21))).toBe("cancelled");
    expect(byDate.get(addDays(start, 28))).toBe("scheduled");
    expect(byDate.get(addDays(start, 35))).toBe("scheduled");
    expect((await service.from("lesson_series").select("status, end_date").eq("id", id).single()).data).toEqual({ status: "active", end_date: end });
  });

  it("extends an active series with an end date, and can remove the end date", async () => {
    const start = block(0); // early in the year, so removing the end date has room to generate more
    const student = await newStudent("h");
    const id = await newSeries(student, start, "14:00", 3);
    expect(await lessonsOf(id)).toHaveLength(3);
    expect((await admin.rpc("extend_series", { p_series_id: id, p_end_date: addDays(start, 7), p_resume_from: nullable<string>(null) })).error?.message).toBe("invalid_input");

    const more = await admin.rpc("extend_series", { p_series_id: id, p_end_date: addDays(start, 35), p_resume_from: nullable<string>(null) });
    expect(more.error).toBeNull();
    expect(await lessonsOf(id)).toHaveLength(6);
    // No duplicate dates.
    expect(new Set((await lessonsOf(id)).map((l) => l.occurrence_date)).size).toBe(6);

    const open = await admin.rpc("extend_series", { p_series_id: id, p_end_date: nullable<string>(null), p_resume_from: nullable<string>(null) });
    expect(open.error).toBeNull();
    expect((await service.from("lesson_series").select("end_date").eq("id", id).single()).data?.end_date).toBeNull();
    expect((await lessonsOf(id)).length).toBeGreaterThan(6);
  });
});
