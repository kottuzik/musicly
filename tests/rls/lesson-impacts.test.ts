import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-impact-${Date.now()}`;
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

// A Monday about 170 days ahead; each test uses its own week.
function baseMonday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 170);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const BASE = baseMonday();
const week = (i: number) => addDays(BASE, 7 * i);
const nullable = <T,>(v: T | null) => v as unknown as T;
const localTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const localDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(iso));

describe.skipIf(!users)("Effects on existing lessons (Development)", () => {
  let service: Client;
  let admin: Client;
  let teacher: Client;
    let lessonTypeId: string;
  let originalDuration = 45;
  let extraTeacherId = "";
  const teacherIds = { teacher: "", teacher2: "" };
  const studentIds: string[] = [];
  let savedHours: Hours[] = [];
  let openTimes: { day: number; open: string; close: string }[] = [];

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

  async function newLesson(student: string, date: string, start: string, teacherId = teacherIds.teacher) {
    const { data, error } = await admin.rpc("book_lesson", {
      p_student_id: student, p_lesson_type_id: lessonTypeId, p_teacher_id: teacherId, p_date: date,
      p_start_time: start, p_duration: 45, p_location: "school", p_confirm_outside_hours: false,
    });
    if (error) throw error;
    return (data as unknown as { id: string }).id;
  }

  const row = async (id: string) => (await service.from("lessons").select("*").eq("id", id).single()).data!;
  const setHours = (open: string, close: string) =>
    admin.rpc("set_operating_hours", { p_days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open, close })) });

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [admin, teacher] = await Promise.all([signedIn(users!.admin), signedIn(users!.teacher)]);
    for (const k of ["teacher", "teacher2"] as const) {
      const { data, error } = await service.from("teachers").select("id").eq("profile_id", users![k].id).single();
      if (error) throw error;
      teacherIds[k] = data.id;
    }
    const { data: lt, error: ltError } = await service.from("lesson_types").select("id, default_duration_minutes").eq("name", TEST_LESSON_TYPE).single();
    if (ltError) throw ltError;
    lessonTypeId = lt.id;
    originalDuration = lt.default_duration_minutes;

    const { data: hours } = await service.from("operating_hours").select("*");
    savedHours = hours ?? [];
    openTimes = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "08:00", close: "20:00" }));
    expect((await admin.rpc("set_operating_hours", { p_days: openTimes })).error).toBeNull();

    const { data: extra } = await service.from("teachers").insert({ full_name: `${PREFIX} מורה`, email: `${PREFIX}@example.test` }).select("id").single();
    extraTeacherId = extra!.id;
    await service.from("teacher_skills").insert({ teacher_id: extraTeacherId, lesson_type_id: lessonTypeId });

    const allTeachers = [...Object.values(teacherIds), extraTeacherId];
    await service.from("teacher_availability").delete().in("teacher_id", allTeachers);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const slots = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
      { teacher_id: teacherIds.teacher, day_of_week: day, start_time: "09:00", end_time: "18:00", valid_from: today },
      { teacher_id: teacherIds.teacher2, day_of_week: day, start_time: "09:00", end_time: "20:00", valid_from: today },
      { teacher_id: extraTeacherId, day_of_week: day, start_time: "09:00", end_time: "18:00", valid_from: today },
    ]);
    const { error: slotError } = await service.from("teacher_availability").insert(slots);
    if (slotError) throw slotError;
  });

  afterAll(async () => {
    if (!service) return;
    const { data: lessons } = await service.from("lessons").select("id").in("student_id", studentIds);
    const lessonIds = (lessons ?? []).map((l) => l.id);
    const { data: series } = await service.from("lesson_series").select("id").in("student_id", studentIds);
    const seriesIds = (series ?? []).map((s) => s.id);
    if (lessonIds.length) await service.from("lesson_change_requests").delete().in("lesson_id", lessonIds);
    await service.from("audit_events").delete().in("entity_id", [...lessonIds, ...seriesIds, ...studentIds, lessonTypeId, extraTeacherId]);
    await service.from("lessons").delete().in("student_id", studentIds);
    await service.from("exception_booking_requests").delete().in("student_id", studentIds);
    await service.from("lesson_series").delete().in("student_id", studentIds);
    await service.from("student_subjects").delete().in("student_id", studentIds);
    await service.from("students").delete().in("id", studentIds);
    await service.from("school_closures").delete().like("name", `${PREFIX}%`);
    await service.from("teacher_absences").delete().in("teacher_id", [...Object.values(teacherIds), extraTeacherId]);
    await service.from("availability_requests").delete().in("teacher_id", [...Object.values(teacherIds), extraTeacherId]);
    await service.from("teacher_availability").delete().in("teacher_id", [...Object.values(teacherIds), extraTeacherId].filter(Boolean));
    if (extraTeacherId) {
      await service.from("teacher_skills").delete().eq("teacher_id", extraTeacherId);
      await service.from("teachers").delete().eq("id", extraTeacherId);
    }
    await service.from("lesson_types").update({ default_duration_minutes: originalDuration }).eq("id", lessonTypeId);
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  it("an absence is decided lesson by lesson, all or nothing", async () => {
    const mon = week(0);
    const [s1, s2, s3, s4] = await Promise.all(["a1", "a2", "a3", "a4"].map(newStudent));
    const l1 = await newLesson(s1, mon, "10:00");
    const l2 = await newLesson(s2, addDays(mon, 1), "10:00");
    const l3 = await newLesson(s3, addDays(mon, 2), "10:00");
    const l4 = await newLesson(s4, addDays(mon, 3), "10:00");

    const { data: requestId, error } = await teacher.rpc("report_absence", {
      p_teacher_id: teacherIds.teacher, p_start_date: mon, p_end_date: addDays(mon, 3),
      p_start_time: nullable<string>(null), p_end_time: nullable<string>(null), p_reason: "מחלה",
    });
    expect(error).toBeNull();
    const impact = await admin.rpc("availability_request_impact", { p_request_id: requestId! });
    expect((impact.data ?? []).map((i) => i.lesson_id).sort()).toEqual([l1, l2, l3, l4].sort());
    expect((await teacher.rpc("availability_request_impact", { p_request_id: requestId! })).error?.message).toBe("not_allowed");

    const version = async () => (await service.from("availability_requests").select("version").eq("id", requestId!).single()).data!.version;
    // One bad decision (a time in the past) rolls everything back.
    const failed = await admin.rpc("decide_availability_request", {
      p_id: requestId!, p_version: await version(), p_approve: true, p_note: "",
      p_decisions: [
        { lesson_id: l1, action: "cancel" },
        { lesson_id: l3, action: "move", date: "2020-01-06", start: "10:00" },
      ],
    });
    expect(failed.error?.message).toBe("decision_failed");
    expect(failed.error?.details).toBe(l3);
    expect((await service.from("availability_requests").select("status").eq("id", requestId!).single()).data?.status).toBe("pending");
    expect((await row(l1)).status).toBe("scheduled");

    const done = await admin.rpc("decide_availability_request", {
      p_id: requestId!, p_version: await version(), p_approve: true, p_note: "בסדר",
      p_decisions: [
        { lesson_id: l1, action: "cancel" },
        { lesson_id: l2, action: "substitute", teacher_id: teacherIds.teacher2 },
        { lesson_id: l3, action: "move", date: addDays(mon, 4), start: "13:00" },
        { lesson_id: l4, action: "keep" },
      ],
    });
    expect(done.error).toBeNull();
    expect(done.data).toMatchObject({ cancelled: 1, substituted: 1, moved: 1, kept: 1 });
    expect((await row(l1)).status).toBe("cancelled");
    expect((await row(l2)).teacher_id).toBe(teacherIds.teacher2);
    const moved = await row(l3);
    expect([localDate(moved.start_at), localTime(moved.start_at)]).toEqual([addDays(mon, 4), "13:00"]);
    const kept = await row(l4);
    expect(kept).toMatchObject({ requires_attention: true, attention_reason: "teacher_absent", status: "scheduled" });
    expect((await service.from("availability_requests").select("status").eq("id", requestId!).single()).data?.status).toBe("approved");
  });

  it("an admin's direct absence or removal flags the lessons it hits", async () => {
    const mon = week(1);
    const s = await newStudent("b1");
    const l = await newLesson(s, mon, "10:00");
    expect((await admin.rpc("report_absence", {
      p_teacher_id: teacherIds.teacher, p_start_date: mon, p_end_date: mon,
      p_start_time: nullable<string>(null), p_end_time: nullable<string>(null), p_reason: "",
    })).error).toBeNull();
    expect(await row(l)).toMatchObject({ requires_attention: true, attention_reason: "teacher_absent" });

    // A weekly slot removed from a date flags that weekday's lessons from then on.
    const s2 = await newStudent("b2");
    const wk = week(2);
    const l2 = await newLesson(s2, wk, "10:00", extraTeacherId);
    const { data: slot } = await service.from("teacher_availability").select("id").eq("teacher_id", extraTeacherId).eq("day_of_week", 1).single();
    expect((await admin.rpc("remove_availability", { p_availability_id: slot!.id, p_kind: "remove_weekly", p_date: wk, p_reason: "" })).error).toBeNull();
    expect(await row(l2)).toMatchObject({ requires_attention: true, attention_reason: "availability_removed" });
  });

  it("new operating hours flag lessons that no longer fit, and clear them when they fit again", async () => {
    const day = week(3);
    const s = await newStudent("c1");
    const late = await newLesson(s, day, "19:00", teacherIds.teacher2);
    const early = await newLesson(await newStudent("c2"), addDays(day, 1), "10:00");
    const { error } = await setHours("08:00", "18:00");
    expect(error).toBeNull();
    expect(await row(late)).toMatchObject({ requires_attention: true, attention_reason: "outside_hours" });
    expect((await row(early)).requires_attention).toBe(false);
    expect((await setHours("08:00", "20:00")).error).toBeNull();
    expect(await row(late)).toMatchObject({ requires_attention: false, attention_reason: null });
  });

  it("cancelling a closure day brings back the chosen lessons and cancels the rest", async () => {
    const day = week(4);
    const [sa, sb, sc] = await Promise.all(["d1", "d2", "d3"].map(newStudent));
    const la = await newLesson(sa, day, "10:00");
    const lb = await newLesson(sb, day, "11:00");
    const lc = await newLesson(sc, day, "12:00", teacherIds.teacher2);
    const { data: closureId } = await admin.rpc("save_closure", { p_name: `${PREFIX} סגירה`, p_start_date: day, p_end_date: day, p_holiday_key: "" });
    expect((await row(la)).status).toBe("closed_day");
    // The first lesson's time is taken by someone else while the day was closed.
    await service.from("lessons").insert({
      occurrence_date: day, student_id: studentIds[studentIds.length - 1], lesson_type_id: lessonTypeId,
      teacher_id: teacherIds.teacher, start_at: (await row(la)).start_at, end_at: (await row(la)).end_at, location: "school",
    });

    const impact = await admin.rpc("closure_impact", { p_id: closureId! });
    const byLesson = new Map((impact.data ?? []).map((i) => [i.lesson_id, i.free]));
    expect(byLesson.get(la)).toBe(false);
    expect(byLesson.get(lb)).toBe(true);
    expect((await teacher.rpc("closure_impact", { p_id: closureId! })).error?.message).toBe("not_allowed");

    const bad = await admin.rpc("cancel_closure", { p_id: closureId!, p_restore: [la, lb] });
    expect(bad.error?.message).toBe("decision_failed");
    expect(bad.error?.details).toBe(la);
    expect((await service.from("school_closures").select("status").eq("id", closureId!).single()).data?.status).toBe("active");

    const ok = await admin.rpc("cancel_closure", { p_id: closureId!, p_restore: [lb] });
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual({ restored: 1, cancelled: 2 });
    expect((await row(lb)).status).toBe("scheduled");
    expect(await row(la)).toMatchObject({ status: "cancelled", cancel_source: "closure_removed" });
    expect((await row(lc)).status).toBe("cancelled");
  });

  it("cancelling a closure without a choice restores every lesson that is free", async () => {
    const day = week(5);
    const l = await newLesson(await newStudent("e1"), day, "10:00");
    const { data: closureId } = await admin.rpc("save_closure", { p_name: `${PREFIX} סגירה 2`, p_start_date: day, p_end_date: day, p_holiday_key: "" });
    expect((await admin.rpc("cancel_closure", { p_id: closureId! })).data).toEqual({ restored: 1, cancelled: 0 });
    expect((await row(l)).status).toBe("scheduled");
  });

  it("a longer subject duration: free meetings stretch, clashing ones move or keep their old length", async () => {
    const start = week(6);
    const student = await newStudent("f1");
    const { data: created, error } = await admin.rpc("create_series", {
      p_student_id: student, p_lesson_type_id: lessonTypeId, p_meetings: [{ day: 1, start: "10:00" }],
      p_start_date: start, p_end_date: addDays(start, 21), p_location: "school", p_confirm_outside_hours: false,
    });
    expect(error).toBeNull();
    const seriesId = (created as unknown as { id: string }[])[0].id;
    const { data: meetings } = await service.from("lessons").select("id, occurrence_date").eq("series_id", seriesId).order("occurrence_date");
    expect(meetings).toHaveLength(4);
    // Another student blocks 10:45 in week 2 and week 3: a 60-minute lesson would run into it.
    const blocker = await newStudent("f2");
    await newLesson(blocker, addDays(start, 7), "10:45");
    await newLesson(blocker, addDays(start, 14), "10:45");

    const impact = await admin.rpc("lesson_type_duration_impact", { p_id: lessonTypeId, p_new_duration: 60 });
    const mine = (impact.data as unknown as { series_id: string; meetings: number; conflicts: { lesson_id: string; suggestions: string[] }[] }[])
      .find((s) => s.series_id === seriesId)!;
    expect(mine.meetings).toBe(4);
    expect(mine.conflicts.map((c) => c.lesson_id)).toEqual([meetings![1].id, meetings![2].id]);
    expect(mine.conflicts[0].suggestions.length).toBeGreaterThan(0);

    const applied = await admin.rpc("apply_lesson_type_duration", {
      p_id: lessonTypeId, p_new_duration: 60,
      p_series: [{ series_id: seriesId, alternatives: [{ lesson_id: meetings![1].id, start: "14:00" }, { lesson_id: meetings![2].id, start: null }] }],
    });
    expect(applied.error).toBeNull();
    expect(applied.data).toEqual({ updated: 2, moved: 1, kept: 1 });
    const minutes = async (id: string) => {
      const l = await row(id);
      return (new Date(l.end_at).getTime() - new Date(l.start_at).getTime()) / 60000;
    };
    expect(await minutes(meetings![0].id)).toBe(60);
    expect(await minutes(meetings![1].id)).toBe(60);
    expect(localTime((await row(meetings![1].id)).start_at)).toBe("14:00");
    expect(await minutes(meetings![2].id)).toBe(45);
    expect(await minutes(meetings![3].id)).toBe(60);
    expect((await service.from("lesson_types").select("default_duration_minutes").eq("id", lessonTypeId).single()).data?.default_duration_minutes).toBe(60);
    expect((await teacher.rpc("apply_lesson_type_duration", { p_id: lessonTypeId, p_new_duration: 45, p_series: [] })).error?.message).toBe("not_allowed");
    await service.from("lesson_types").update({ default_duration_minutes: originalDuration }).eq("id", lessonTypeId);
  });

  it("deactivating a student cancels upcoming lessons, ends series and closes pending requests", async () => {
    const start = week(11);
    const student = await newStudent("g1");
    const { data: created } = await admin.rpc("create_series", {
      p_student_id: student, p_lesson_type_id: lessonTypeId, p_meetings: [{ day: 1, start: "11:00" }],
      p_start_date: start, p_end_date: addDays(start, 14), p_location: "school", p_confirm_outside_hours: false,
    });
    const seriesId = (created as unknown as { id: string }[])[0].id;
    const single = await newLesson(student, addDays(start, 1), "11:00");
    // A booking waiting for the teacher's approval (outside their availability).
    const { data: pending } = await admin.rpc("book_lesson", {
      p_student_id: student, p_lesson_type_id: lessonTypeId, p_teacher_id: teacherIds.teacher, p_date: addDays(start, 2),
      p_start_time: "19:00", p_duration: 45, p_location: "school", p_confirm_outside_hours: false,
    });
    const requestId = (pending as unknown as { id: string }).id;

    const impact = await admin.rpc("student_status_impact", { p_id: student });
    expect(impact.data).toEqual({ lessons: 4, series: 1, requests: 1 });
    expect((await teacher.rpc("student_status_impact", { p_id: student })).error?.message).toBe("not_allowed");

    expect((await admin.rpc("set_student_status", { p_id: student, p_status: "inactive", p_return_date: nullable<string>(null), p_return_mode: nullable<"notify">(null) })).error).toBeNull();
    const lessons = (await service.from("lessons").select("status, cancel_source").eq("student_id", student)).data ?? [];
    expect(lessons).toHaveLength(4);
    expect(lessons.every((l) => l.status === "cancelled" && l.cancel_source === "student_inactive")).toBe(true);
    expect((await service.from("lesson_series").select("status").eq("id", seriesId).single()).data?.status).toBe("ended");
    expect((await service.from("exception_booking_requests").select("status").eq("id", requestId).single()).data?.status).toBe("cancelled");
    expect((await row(single)).status).toBe("cancelled");
    // Reactivating brings nothing back.
    await admin.rpc("set_student_status", { p_id: student, p_status: "active", p_return_date: nullable<string>(null), p_return_mode: nullable<"notify">(null) });
    expect((await row(single)).status).toBe("cancelled");
  });

  it("deactivating a teacher flags their upcoming lessons and closes their pending requests", async () => {
    const start = week(12);
    const student = await newStudent("h1");
    // Earlier tests left lessons with this teacher; count only what this test creates.
    await service.from("lessons").delete().eq("teacher_id", extraTeacherId);
    const lesson = await newLesson(student, addDays(start, 1), "10:00", extraTeacherId);
    const { data: pending } = await admin.rpc("book_lesson", {
      p_student_id: student, p_lesson_type_id: lessonTypeId, p_teacher_id: extraTeacherId, p_date: addDays(start, 2),
      p_start_time: "19:00", p_duration: 45, p_location: "school", p_confirm_outside_hours: false,
    });
    const requestId = (pending as unknown as { id: string }).id;

    expect((await admin.rpc("teacher_status_impact", { p_id: extraTeacherId })).data).toEqual({ lessons: 1, requests: 1 });
    expect((await admin.rpc("set_teacher_status", { p_teacher_id: extraTeacherId, p_status: "inactive" })).error).toBeNull();
    expect(await row(lesson)).toMatchObject({ requires_attention: true, attention_reason: "teacher_inactive", status: "scheduled" });
    expect((await service.from("exception_booking_requests").select("status").eq("id", requestId).single()).data?.status).toBe("cancelled");

    const attention = await admin.rpc("list_attention_lessons");
    expect(attention.data?.find((l) => l.id === lesson)?.attention_reason).toBe("teacher_inactive");
    expect((await teacher.rpc("list_attention_lessons")).error?.message).toBe("not_allowed");
    await admin.rpc("set_teacher_status", { p_teacher_id: extraTeacherId, p_status: "active", p_availability_mode: "restore" });
  });

  it("the reads for the new screens: calendar filter, details, history and recent changes", async () => {
    const day = week(13);
    const student = await newStudent("i1");
    const l = await newLesson(student, day, "10:00");
    await service.from("lessons").update({ requires_attention: true, attention_reason: "outside_hours" }).eq("id", l);
    const from = `${day}T00:00:00Z`;
    const to = `${addDays(day, 1)}T00:00:00Z`;
    const args = (attentionOnly: boolean) => ({
      p_from: from, p_to: to, p_teacher_id: nullable<string>(null), p_student_id: nullable<string>(null),
      p_lesson_type_id: nullable<string>(null), p_include_cancelled: false, p_attention_only: attentionOnly,
    });
    expect((await admin.rpc("list_calendar_lessons", args(true))).data?.some((x) => x.id === l)).toBe(true);
    const adminView = (await admin.rpc("list_calendar_lessons", args(false))).data?.find((x) => x.id === l);
    expect(adminView?.attention_reason).toBe("outside_hours");
    const teacherView = (await teacher.rpc("list_calendar_lessons", args(false))).data?.find((x) => x.id === l);
    expect(teacherView?.attention_reason).toBeNull();

    const details = (await admin.rpc("get_lesson", { p_id: l })).data?.[0];
    expect(details).toMatchObject({ duration_minutes: 45, requires_attention: true, attention_reason: "outside_hours", pending_change_request_id: null });
    expect(typeof details?.version).toBe("number");

    await admin.rpc("cancel_lesson", { p_id: l, p_version: details!.version, p_reason: "בדיקה" });
    const history = await admin.rpc("list_lesson_history", { p_lesson_id: l });
    expect(history.data?.map((h) => h.action)).toContain("lesson_cancelled");
    expect((await teacher.rpc("list_lesson_history", { p_lesson_id: l })).error?.message).toBe("not_allowed");
    const recent = await admin.rpc("list_recent_changes", { p_limit: 50 });
    expect(recent.data?.some((r) => r.entity_id === l && r.action === "lesson_cancelled" && r.student_name === `${PREFIX} i1`)).toBe(true);
  });
});
