import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-ntf-${Date.now()}`;
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

const localDay = (offset: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() + offset * 86_400_000));
const nullable = (v: string | null) => v as unknown as string;
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);
// A day-based start time that no other lesson of this file shares (a teacher cannot overlap herself).
let seq = 0;
const later = (days: number) => minutesFromNow(days * 1440 + 100 + seq++ * 50);

describe.skipIf(!users)("Notifications, reminders, e-mail outbox and scheduled jobs (Development)", () => {
  let service: Client;
  let admin: Client;
  let teacher: Client;
  let teacher2: Client;
  let lessonTypeId: string;
  let adminProfileId: string;
  let savedHours: Hours[] = [];
  const teacherIds = { teacher: "", teacher2: "" };
  const studentIds: string[] = [];
  const seriesIds: string[] = [];
  const startedAt = new Date().toISOString();

  async function newStudent(name: string, regular: "teacher" | "teacher2" = "teacher") {
    const { data, error } = await admin.rpc("save_student", {
      p_id: nullable(null), p_full_name: `${PREFIX} ${name}`, p_birth_date: "2010-01-01", p_phone: "", p_email: "",
      p_parent_name: "", p_parent_phone: "", p_parent_email: "",
    });
    if (error) throw error;
    studentIds.push(data);
    const { error: subjectError } = await admin.rpc("save_student_subject", {
      p_id: nullable(null), p_student_id: data, p_lesson_type_id: lessonTypeId, p_teacher_id: teacherIds[regular],
      p_level: "beginner", p_background: "",
    });
    if (subjectError) throw subjectError;
    return data;
  }

  async function insertLesson(
    student: string,
    start: Date,
    opts: { teacherId?: string; minutes?: number; status?: "scheduled" | "cancelled" } = {},
  ) {
    const { data, error } = await service
      .from("lessons")
      .insert({
        occurrence_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(start),
        student_id: student,
        lesson_type_id: lessonTypeId,
        teacher_id: opts.teacherId ?? teacherIds.teacher,
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + (opts.minutes ?? 45) * 60_000).toISOString(),
        location: "school",
        status: opts.status ?? "scheduled",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const notifsFor = async (userId: string, type?: string, entityId?: string) => {
    let q = service.from("notifications").select("*").eq("user_id", userId).order("created_at");
    if (type) q = q.eq("type", type);
    if (entityId) q = q.eq("entity_id", entityId);
    return (await q).data ?? [];
  };
  const lessonVersion = async (id: string) => (await service.from("lessons").select("version").eq("id", id).single()).data!.version;
  const outboxFor = async (userId: string) =>
    (await service.from("email_outbox").select("*").eq("user_id", userId).order("created_at")).data ?? [];

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [admin, teacher, teacher2] = await Promise.all([signedIn(users!.admin), signedIn(users!.teacher), signedIn(users!.teacher2)]);
    adminProfileId = users!.admin.id;
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

    await service.from("notification_preferences").delete().in("user_id", [users!.teacher.id, users!.teacher2.id, users!.admin.id]);
    await service.from("reminder_preferences").delete().in("teacher_id", Object.values(teacherIds));
  });

  afterAll(async () => {
    if (!service) return;
    await service.from("teachers").update({ status: "active" }).eq("id", teacherIds.teacher2);
    await service.from("email_outbox").delete().like("dedupe_key", `${PREFIX}%`);
    const { data: lessons } = await service.from("lessons").select("id").in("student_id", studentIds);
    const ids = (lessons ?? []).map((l) => l.id);
    const { data: reqs } = ids.length
      ? await service.from("lesson_change_requests").select("id").in("lesson_id", ids)
      : { data: [] as { id: string }[] };
    if (ids.length) {
      await service.from("audit_events").delete().in("entity_id", [...ids, ...seriesIds, ...studentIds, ...(reqs ?? []).map((r) => r.id)]);
      await service.from("lesson_change_requests").delete().in("lesson_id", ids);
    }
    await service.from("lessons").delete().in("student_id", studentIds);
    await service.from("lesson_series").delete().in("student_id", studentIds);
    await service.from("exception_booking_requests").delete().in("student_id", studentIds);
    await service.from("student_subjects").delete().in("student_id", studentIds);
    await service.from("students").delete().in("id", studentIds);
    await service.from("teacher_availability").delete().in("teacher_id", Object.values(teacherIds).filter(Boolean));
    await service.from("reminder_preferences").delete().in("teacher_id", Object.values(teacherIds).filter(Boolean));
    await service.from("notification_preferences").delete().in("user_id", [users!.teacher.id, users!.teacher2.id, users!.admin.id]);
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  // -------------------------------------------------------------------------
  // Who is told
  // -------------------------------------------------------------------------

  it("a new one-time lesson tells its teacher only, and the list shows the student's name only to who may see it", async () => {
    const s1 = await newStudent("s1");
    const id = await insertLesson(s1, later(3));
    const mine = await notifsFor(users!.teacher.id, "lesson_new", id);
    expect(mine).toHaveLength(1);
    expect(mine[0].category).toBe("activity");
    expect(await notifsFor(users!.teacher2.id, "lesson_new", id)).toHaveLength(0);
    // The stored payload never holds the student's name.
    expect(JSON.stringify(mine[0].payload)).not.toContain(PREFIX);

    const list = await teacher.rpc("list_notifications", { p_tab: "activity", p_offset: 0 });
    expect(list.error).toBeNull();
    expect((list.data ?? []).find((n) => n.id === mine[0].id)?.subject_name).toBe(`${PREFIX} s1`);
    const other = await teacher2.rpc("list_notifications", { p_tab: "activity", p_offset: 0 });
    expect((other.data ?? []).some((n) => n.id === mine[0].id)).toBe(false);
  });

  it("lessons of a series are announced once, by the series", async () => {
    const s = await newStudent("series");
    const seriesStart = later(8);
    const day = localDay(8);
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    const { data: series, error } = await service
      .from("lesson_series")
      .insert({
        student_id: s, lesson_type_id: lessonTypeId, teacher_id: teacherIds.teacher, day_of_week: dow,
        start_time: "10:00", duration_minutes: 45, location: "school", start_date: day, generated_until: day,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    seriesIds.push(series!.id);
    const lessonId = await service
      .from("lessons")
      .insert({
        series_id: series!.id, occurrence_date: day, student_id: s, lesson_type_id: lessonTypeId, teacher_id: teacherIds.teacher,
        start_at: seriesStart.toISOString(), end_at: new Date(seriesStart.getTime() + 45 * 60_000).toISOString(), location: "school",
      })
      .select("id")
      .single();
    expect(lessonId.error).toBeNull();
    expect(await notifsFor(users!.teacher.id, "series_new", series!.id)).toHaveLength(1);
    expect(await notifsFor(users!.teacher.id, "lesson_new", lessonId.data!.id)).toHaveLength(0);
  });

  it("cancelling tells the teacher and not the admin who did it", async () => {
    const s = await newStudent("cancel");
    const id = await insertLesson(s, later(4));
    const { error } = await admin.rpc("cancel_lesson", { p_id: id, p_version: await lessonVersion(id), p_reason: "" });
    expect(error).toBeNull();
    expect(await notifsFor(users!.teacher.id, "lesson_cancelled", id)).toHaveLength(1);
    expect(await notifsFor(adminProfileId, "lesson_cancelled", id)).toHaveLength(0);
  });

  it("a teacher's change request tells every admin; the answer tells the teacher", async () => {
    const s = await newStudent("request");
    const id = await insertLesson(s, later(5));
    const { data: requestId, error } = await teacher.rpc("request_lesson_change", {
      p_lesson_id: id, p_kind: "cancel", p_date: nullable(null), p_start: nullable(null), p_reason: "",
    });
    expect(error).toBeNull();
    expect(await notifsFor(users!.admin.id, "change_request_new", requestId!)).toHaveLength(1);
    expect(await notifsFor(users!.admin2.id, "change_request_new", requestId!)).toHaveLength(1);
    expect(await notifsFor(users!.teacher.id, "change_request_new", requestId!)).toHaveLength(0);

    const { data: request } = await service.from("lesson_change_requests").select("version").eq("id", requestId!).single();
    const decided = await admin.rpc("decide_lesson_change_request", {
      p_id: requestId!, p_version: request!.version, p_approve: false, p_note: "לא",
    });
    expect(decided.error).toBeNull();
    expect(await notifsFor(users!.teacher.id, "change_request_rejected", requestId!)).toHaveLength(1);
  });

  it("turning a request down can suggest another time, which the teacher sees", async () => {
    const s = await newStudent("suggest");
    const id = await insertLesson(s, later(10));
    const ask = async () =>
      (await teacher.rpc("request_lesson_change", { p_lesson_id: id, p_kind: "change", p_date: nullable(null), p_start: nullable(null), p_reason: "" })).data!;
    const requestId = await ask();
    const version = async () => (await service.from("lesson_change_requests").select("version").eq("id", requestId).single()).data!.version;
    const decide = async (extra: Record<string, string | null>) =>
      admin.rpc("decide_lesson_change_request", { p_id: requestId, p_version: await version(), p_approve: false, p_note: "אין מקום", ...extra } as never);

    // Date and time come together, in a quarter hour, not in the past.
    expect((await decide({ p_counter_date: localDay(12) })).error?.message).toBe("invalid_input");
    expect((await decide({ p_counter_date: localDay(12), p_counter_start: "10:10:00" })).error?.message).toBe("invalid_input");
    expect((await decide({ p_counter_date: localDay(-1), p_counter_start: "10:00:00" })).error?.message).toBe("invalid_input");
    expect((await teacher.rpc("decide_lesson_change_request", {
      p_id: requestId, p_version: await version(), p_approve: false, p_note: "", p_counter_date: localDay(12), p_counter_start: "10:00:00",
    })).error?.message).toBe("not_allowed");

    expect((await decide({ p_counter_date: localDay(12), p_counter_start: "17:00:00" })).error).toBeNull();
    const row = (await service.from("lesson_change_requests").select("*").eq("id", requestId).single()).data!;
    expect(row.status).toBe("rejected");
    expect(row.counter_date).toBe(localDay(12));
    expect(row.counter_start_time).toBe("17:00:00");
    expect(row.decision_note).toContain("אין מקום");
    expect(row.decision_note).toContain("17:00");

    // Nothing was booked: the lesson is where it was, and the teacher's notification carries the suggestion.
    expect((await service.from("lessons").select("status").eq("id", id).single()).data?.status).toBe("scheduled");
    const [note] = await notifsFor(users!.teacher.id, "change_request_rejected", requestId);
    expect(note.payload).toMatchObject({ suggested_date: localDay(12), suggested_start: "17:00:00" });
  });

  it("an admin who restores nothing and edits nothing is told nothing: attendance fixes reach the other admins", async () => {
    const s = await newStudent("attendance");
    const id = await insertLesson(s, later(-3));
    expect((await teacher.rpc("set_attendance", { p_lesson_id: id, p_status: "held", p_note: "", p_version: null as unknown as number })).error).toBeNull();
    // A first report is not a correction.
    expect(await notifsFor(users!.admin.id, "attendance_changed", id)).toHaveLength(0);
    expect((await admin.rpc("set_attendance", { p_lesson_id: id, p_status: "student_absent", p_note: "", p_version: 1 })).error).toBeNull();
    expect(await notifsFor(users!.admin2.id, "attendance_changed", id)).toHaveLength(1);
    expect(await notifsFor(users!.admin.id, "attendance_changed", id)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Reading, archiving, preferences
  // -------------------------------------------------------------------------

  it("read-marking and archiving touch only your own notifications, and nothing can be deleted", async () => {
    const [first] = await notifsFor(users!.teacher.id, "lesson_new");
    expect(first).toBeTruthy();

    expect((await teacher2.rpc("mark_notifications_read", { p_ids: [first.id] })).data).toBe(0);
    expect((await service.from("notifications").select("read_at").eq("id", first.id).single()).data?.read_at).toBeNull();
    expect((await teacher2.rpc("archive_notifications", { p_ids: [first.id] })).data).toBe(0);

    expect((await teacher.rpc("mark_notifications_read", { p_ids: [first.id] })).data).toBe(1);
    expect((await teacher.rpc("archive_notifications", { p_ids: [first.id] })).data).toBe(1);
    const archived = await teacher.rpc("list_notifications", { p_tab: "archive", p_offset: 0 });
    expect((archived.data ?? []).some((n) => n.id === first.id)).toBe(true);
    const active = await teacher.rpc("list_notifications", { p_tab: "activity", p_offset: 0 });
    expect((active.data ?? []).some((n) => n.id === first.id)).toBe(false);
    expect((await teacher.rpc("unarchive_notifications", { p_ids: [first.id] })).data).toBe(1);

    // No delete and no direct write, however the request is made.
    const del = await teacher.from("notifications").delete().eq("id", first.id);
    expect(del.error).not.toBeNull();
    const upd = await teacher.from("notifications").update({ read_at: null }).eq("id", first.id);
    expect(upd.error).not.toBeNull();
    const ins = await teacher.from("notifications").insert({ user_id: users!.teacher.id, type: "x", category: "system" });
    expect(ins.error).not.toBeNull();
    expect((await service.from("notifications").select("id").eq("id", first.id)).data).toHaveLength(1);
  });

  it("marking all as read only affects the caller", async () => {
    const before = await notifsFor(users!.teacher2.id);
    await service.rpc("notify", {
      p_user: users!.teacher2.id, p_type: "email_failed", p_category: "system", p_entity: nullable(null),
      p_entity_id: nullable(null), p_payload: {}, p_dedupe: `${PREFIX}-all`, p_coalesce: false,
    });
    expect((await teacher.rpc("mark_all_notifications_read")).error).toBeNull();
    const after = await notifsFor(users!.teacher2.id);
    expect(after.length).toBe(before.length + 1);
    expect(after.every((n) => n.read_at === null || before.some((b) => b.id === n.id))).toBe(true);
    expect((await teacher2.rpc("mark_all_notifications_read")).error).toBeNull();
    expect((await notifsFor(users!.teacher2.id)).every((n) => n.read_at !== null)).toBe(true);
  });

  it("e-mail is queued only for who chose it, and once per notification", async () => {
    const s = await newStudent("email");
    await insertLesson(s, later(6));
    expect(await outboxFor(users!.teacher.id)).toHaveLength(0);

    expect((await teacher.rpc("set_notification_channel", { p_channel: "in_app_email" })).error).toBeNull();
    const id = await insertLesson(s, later(7));
    const [notification] = await notifsFor(users!.teacher.id, "lesson_new", id);
    const queued = await outboxFor(users!.teacher.id);
    expect(queued).toHaveLength(1);
    expect(queued[0].to_email).toBe(users!.teacher.email);
    expect(queued[0].status).toBe("pending");
    expect(queued[0].notification_id).toBe(notification.id);
    expect(JSON.stringify(queued[0].payload)).not.toContain(PREFIX);

    // The same dedupe key again creates neither a second notification nor a second e-mail.
    const args = {
      p_user: users!.teacher.id, p_type: "email_failed", p_category: "system" as const, p_entity: nullable(null),
      p_entity_id: nullable(null), p_payload: {}, p_dedupe: `${PREFIX}-twice`, p_coalesce: false,
    };
    await service.rpc("notify", args);
    await service.rpc("notify", args);
    expect((await notifsFor(users!.teacher.id, "email_failed")).filter((n) => n.dedupe_key === `${PREFIX}-twice`)).toHaveLength(1);
    expect(await outboxFor(users!.teacher.id)).toHaveLength(2);

    expect((await teacher.rpc("set_notification_channel", { p_channel: "in_app" })).error).toBeNull();
    await insertLesson(s, later(8));
    expect(await outboxFor(users!.teacher.id)).toHaveLength(2);
    await service.from("email_outbox").delete().eq("user_id", users!.teacher.id);
  });

  it("the channel can only be set by a signed-in user with a profile", async () => {
    const anon = newClient();
    expect((await anon.rpc("set_notification_channel", { p_channel: "in_app" })).error).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Reminders
  // -------------------------------------------------------------------------

  it("reminders are off by default, then follow the general preference and the lesson's own setting", async () => {
    const s = await newStudent("reminders");
    const reminders = async (lessonId: string) =>
      (await notifsFor(users!.teacher.id, "lesson_reminder", lessonId)).length;
    // One-minute lessons keep these start times from overlapping.
    const make = (minutes: number, status: "scheduled" | "cancelled" = "scheduled") =>
      insertLesson(s, minutesFromNow(minutes), { minutes: 1, status });

    const off = await make(57);
    await service.rpc("dispatch_due_reminders");
    expect(await reminders(off)).toBe(0);

    expect((await teacher.rpc("save_reminder_preferences", { p_enabled: true, p_offsets: [60] })).error).toBeNull();
    const overridden = await make(58);
    expect((await teacher.rpc("set_lesson_reminder", { p_lesson: overridden, p_mode: "off", p_offsets: [] })).error).toBeNull();
    const later = await make(125);
    const cancelled = await make(56, "cancelled");
    const missed = await make(40);
    const custom = await make(119);
    expect((await teacher.rpc("set_lesson_reminder", { p_lesson: custom, p_mode: "custom", p_offsets: [120] })).error).toBeNull();

    await service.rpc("dispatch_due_reminders");
    expect(await reminders(off)).toBe(1);
    expect(await reminders(overridden)).toBe(0);
    expect(await reminders(later)).toBe(0);
    expect(await reminders(cancelled)).toBe(0);
    expect(await reminders(missed)).toBe(0);
    const [custom120] = await notifsFor(users!.teacher.id, "lesson_reminder", custom);
    expect((custom120.payload as { offset_minutes: number }).offset_minutes).toBe(120);

    // Running the job again never repeats a reminder.
    await service.rpc("dispatch_due_reminders");
    await service.rpc("dispatch_due_reminders");
    expect(await reminders(off)).toBe(1);
    expect(await reminders(custom)).toBe(1);
    const { data: jobs } = await service.from("reminder_jobs").select("id").eq("lesson_id", off);
    expect(jobs).toHaveLength(1);

    // Several times for one lesson.
    expect((await teacher.rpc("save_reminder_preferences", { p_enabled: true, p_offsets: [60, 55] })).error).toBeNull();
    const two = await make(54);
    await service.rpc("dispatch_due_reminders");
    expect(await reminders(two)).toBe(2);
    expect(await reminders(off)).toBe(1);

    // Back to the default: following the general preference again.
    expect((await teacher.rpc("set_lesson_reminder", { p_lesson: overridden, p_mode: "default", p_offsets: [] })).error).toBeNull();
    expect((await teacher.from("lesson_reminder_overrides").select("lesson_id").eq("lesson_id", overridden)).data).toHaveLength(0);
  });

  it("an inactive teacher gets no reminders", async () => {
    const s = await newStudent("inactive-reminder", "teacher2");
    await service.from("reminder_preferences").upsert({ teacher_id: teacherIds.teacher2, enabled: true, offsets_minutes: [60] });
    const id = await insertLesson(s, minutesFromNow(59), { teacherId: teacherIds.teacher2, minutes: 1 });
    await service.from("teachers").update({ status: "inactive" }).eq("id", teacherIds.teacher2);
    await service.rpc("dispatch_due_reminders");
    expect(await notifsFor(users!.teacher2.id, "lesson_reminder", id)).toHaveLength(0);
    await service.from("teachers").update({ status: "active" }).eq("id", teacherIds.teacher2);
  });

  it("rejects bad reminder times and who may not set them", async () => {
    const bad = (offsets: number[]) => teacher.rpc("save_reminder_preferences", { p_enabled: true, p_offsets: offsets });
    expect((await bad([4])).error?.message).toBe("invalid_reminder_offsets");
    expect((await bad([10081])).error?.message).toBe("invalid_reminder_offsets");
    expect((await bad([60, 60])).error?.message).toBe("invalid_reminder_offsets");
    expect((await bad([10, 20, 30, 40, 50, 60])).error?.message).toBe("invalid_reminder_offsets");
    expect((await bad([])).error?.message).toBe("reminder_offsets_required");
    expect((await bad([5])).error).toBeNull();
    expect((await bad([10080])).error).toBeNull();
    expect((await admin.rpc("save_reminder_preferences", { p_enabled: true, p_offsets: [60] })).error?.message).toBe("not_allowed");

    const s = await newStudent("reminder-rules");
    const mine = await insertLesson(s, later(9));
    expect((await teacher2.rpc("set_lesson_reminder", { p_lesson: mine, p_mode: "off", p_offsets: [] })).error?.message).toBe("not_found");
    expect((await teacher.rpc("set_lesson_reminder", { p_lesson: mine, p_mode: "custom", p_offsets: [] })).error?.message).toBe("reminder_offsets_required");
    expect((await teacher.rpc("set_lesson_reminder", { p_lesson: mine, p_mode: "custom", p_offsets: [3] })).error?.message).toBe("invalid_reminder_offsets");
    expect((await teacher.rpc("set_lesson_reminder", { p_lesson: mine, p_mode: "weekly", p_offsets: [] })).error?.message).toBe("invalid_input");
    const past = await insertLesson(s, later(-2));
    expect((await teacher.rpc("set_lesson_reminder", { p_lesson: past, p_mode: "off", p_offsets: [] })).error?.message).toBe("lesson_not_upcoming");
    // A teacher sees only their own settings.
    expect((await teacher2.from("reminder_preferences").select("teacher_id").eq("teacher_id", teacherIds.teacher)).data).toHaveLength(0);
    expect((await teacher2.from("lesson_reminder_overrides").select("lesson_id")).data?.some((r) => r.lesson_id === mine)).toBe(false);
  });

  it("the unreported-attendance reminder is one notification a day, only when something is missing", async () => {
    const s = await newStudent("unreported");
    await insertLesson(s, later(-2));
    await service.rpc("notify_unreported_attendance");
    await service.rpc("notify_unreported_attendance");
    const found = (await notifsFor(users!.teacher.id, "attendance_unreported")).filter((n) => n.created_at >= startedAt);
    expect(found).toHaveLength(1);
    expect((found[0].payload as { count: number }).count).toBeGreaterThanOrEqual(1);
    expect(found[0].category).toBe("system");
  });

  // -------------------------------------------------------------------------
  // Scheduled jobs
  // -------------------------------------------------------------------------

  it("requests that can no longer be answered close on their own and tell who asked", async () => {
    const s = await newStudent("expire");
    const id = await insertLesson(s, later(3));
    const { data: requestId } = await teacher.rpc("request_lesson_change", {
      p_lesson_id: id, p_kind: "cancel", p_date: nullable(null), p_start: nullable(null), p_reason: "",
    });
    // The lesson starts before anyone answers.
    await service.from("lessons").update({
      start_at: minutesFromNow(-120).toISOString(), end_at: minutesFromNow(-75).toISOString(),
    }).eq("id", id);

    const { error: exceptionError } = await service.from("exception_booking_requests").insert({
      kind: "single", student_id: s, lesson_type_id: lessonTypeId, teacher_id: teacherIds.teacher, location: "school",
      start_date: localDay(0), start_time: "10:00", duration_minutes: 45, first_start_at: minutesFromNow(-60).toISOString(),
      requested_by: adminProfileId,
    });
    expect(exceptionError).toBeNull();

    expect((await service.rpc("expire_pending_requests")).error).toBeNull();
    const { data: request } = await service.from("lesson_change_requests").select("status, decided_by").eq("id", requestId!).single();
    expect(request).toMatchObject({ status: "cancelled", decided_by: null });
    expect(await notifsFor(users!.teacher.id, "change_request_closed", requestId!)).toHaveLength(1);
    const { data: expired } = await service.from("exception_booking_requests").select("id, status").eq("student_id", s);
    expect(expired?.[0].status).toBe("expired");
    expect(await notifsFor(adminProfileId, "approval_request_expired", expired![0].id)).toHaveLength(1);
  });

  it("the series window moves forward without duplicating lessons", async () => {
    await service.from("teacher_availability").delete().eq("teacher_id", teacherIds.teacher);
    const today = localDay(0);
    const { error: availError } = await service.from("teacher_availability").insert(
      [0, 1, 2, 3, 4, 5, 6].map((day) => ({ teacher_id: teacherIds.teacher, day_of_week: day, start_time: "09:00", end_time: "18:00", valid_from: today })),
    );
    expect(availError).toBeNull();

    const s = await newStudent("window");
    const start = localDay(14);
    const dow = new Date(`${start}T12:00:00Z`).getUTCDay();
    const { data: series, error } = await service
      .from("lesson_series")
      .insert({
        student_id: s, lesson_type_id: lessonTypeId, teacher_id: teacherIds.teacher, day_of_week: dow,
        start_time: "10:00", duration_minutes: 45, location: "school", start_date: start, generated_until: localDay(30),
      })
      .select("id, generated_until")
      .single();
    expect(error).toBeNull();
    seriesIds.push(series!.id);

    expect((await service.rpc("extend_recurring_lessons")).error).toBeNull();
    const after = await service.from("lesson_series").select("generated_until").eq("id", series!.id).single();
    expect(after.data!.generated_until > series!.generated_until).toBe(true);
    expect(after.data!.generated_until >= localDay(360)).toBe(true);

    const count = async () => (await service.from("lessons").select("id", { count: "exact", head: true }).eq("series_id", series!.id)).count ?? 0;
    const first = await count();
    expect(first).toBeGreaterThan(40);
    await service.rpc("extend_recurring_lessons");
    expect(await count()).toBe(first);
    const { data: dates } = await service.from("lessons").select("occurrence_date").eq("series_id", series!.id);
    expect(new Set((dates ?? []).map((d) => d.occurrence_date)).size).toBe(first);
  });

  it("a student whose return date came is reactivated or announced, once, and never gets lessons", async () => {
    const auto = await newStudent("return-auto");
    const notify = await newStudent("return-notify");
    for (const [id, mode] of [[auto, "auto"], [notify, "notify"]] as const) {
      const { error } = await service
        .from("students")
        .update({ status: "inactive", expected_return_date: localDay(-1), return_mode: mode })
        .eq("id", id);
      expect(error).toBeNull();
    }

    await service.rpc("activate_or_notify_students");
    await service.rpc("activate_or_notify_students");

    const a = (await service.from("students").select("status, expected_return_date, return_mode").eq("id", auto).single()).data;
    expect(a).toEqual({ status: "active", expected_return_date: null, return_mode: null });
    expect(await notifsFor(users!.admin.id, "student_returned_auto", auto)).toHaveLength(1);
    expect(await notifsFor(users!.admin2.id, "student_returned_auto", auto)).toHaveLength(1);
    const { data: audit } = await service.from("audit_events").select("action").eq("entity_id", auto);
    expect((audit ?? []).map((e) => e.action)).toContain("student_auto_activated");
    expect((await service.from("lessons").select("id").eq("student_id", auto)).data).toHaveLength(0);

    const n = (await service.from("students").select("status, return_notified_at").eq("id", notify).single()).data!;
    expect(n.status).toBe("inactive");
    expect(n.return_notified_at).not.toBeNull();
    expect(await notifsFor(users!.admin.id, "student_return_due", notify)).toHaveLength(1);

    // A new date starts over.
    await service.from("students").update({ expected_return_date: localDay(-2) }).eq("id", notify);
    expect((await service.from("students").select("return_notified_at").eq("id", notify).single()).data?.return_notified_at).toBeNull();
  });

  // -------------------------------------------------------------------------
  // The e-mail outbox
  // -------------------------------------------------------------------------

  describe("outbox", () => {
    const add = async (name: string) => {
      const { data, error } = await service
        .from("email_outbox")
        .insert({ to_email: "outbox@example.test", kind: "lesson_new", payload: {}, dedupe_key: `${PREFIX}-${name}` })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    };
    const row = async (id: string) => (await service.from("email_outbox").select("*").eq("id", id).single()).data!;

    it("two senders at once never take the same message", async () => {
      // Park anything else that is waiting, so the claim sees only these.
      const { data: others } = await service.from("email_outbox").select("id").eq("status", "pending").not("dedupe_key", "like", `${PREFIX}%`);
      const parked = (others ?? []).map((o) => o.id);
      if (parked.length) await service.from("email_outbox").update({ next_attempt_at: new Date(Date.now() + 86_400_000).toISOString() }).in("id", parked);
      try {
        const ids = await Promise.all([add("c1"), add("c2"), add("c3"), add("c4")]);
        const [a, b] = await Promise.all([service.rpc("claim_email_outbox", { p_limit: 3 }), service.rpc("claim_email_outbox", { p_limit: 3 })]);
        const claimed = [...(a.data ?? []), ...(b.data ?? [])].map((r) => r.id);
        expect(new Set(claimed).size).toBe(claimed.length);
        expect(claimed.sort()).toEqual(ids.sort());
        expect((await row(ids[0])).status).toBe("sending");
        expect((await row(ids[0])).attempts).toBe(1);
      } finally {
        if (parked.length) await service.from("email_outbox").update({ next_attempt_at: new Date().toISOString() }).in("id", parked);
      }
    });

    it("sent, skipped and failed deliveries are recorded; a failure retries and then tells the admins once", async () => {
      const sent = await add("sent");
      const skipped = await add("skipped");
      const failing = await add("failing");
      const claimedIds = ((await service.rpc("claim_email_outbox", { p_limit: 50 })).data ?? []).map((r) => r.id);
      expect(claimedIds).toEqual(expect.arrayContaining([sent, skipped, failing]));

      await service.rpc("complete_email_outbox", { p_id: sent, p_result: "sent", p_provider_id: "prov-1", p_error: "" });
      await service.rpc("complete_email_outbox", { p_id: skipped, p_result: "skipped", p_provider_id: "", p_error: "" });
      expect(await row(sent)).toMatchObject({ status: "sent", provider_id: "prov-1" });
      expect(await row(skipped)).toMatchObject({ status: "skipped_test_mode" });

      // Completing something that is not being sent changes nothing.
      await service.rpc("complete_email_outbox", { p_id: sent, p_result: "error", p_provider_id: "", p_error: "late" });
      expect((await row(sent)).status).toBe("sent");

      await service.rpc("complete_email_outbox", { p_id: failing, p_result: "error", p_provider_id: "", p_error: "resend_500" });
      let r = await row(failing);
      expect(r.status).toBe("pending");
      expect(new Date(r.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);

      for (const attempt of [2, 3]) {
        await service.from("email_outbox").update({ next_attempt_at: new Date().toISOString() }).eq("id", failing);
        const claimed = (await service.rpc("claim_email_outbox", { p_limit: 50 })).data ?? [];
        expect(claimed.map((c) => c.id)).toContain(failing);
        expect((await row(failing)).attempts).toBe(attempt);
        await service.rpc("complete_email_outbox", { p_id: failing, p_result: "error", p_provider_id: "", p_error: "resend_500" });
      }
      r = await row(failing);
      expect(r.status).toBe("failed");
      expect(r.last_error).toBe("resend_500");
      expect(await notifsFor(users!.admin.id, "email_failed", failing)).toHaveLength(1);
    });

    it("a message that was claimed and then lost becomes claimable again", async () => {
      const id = await add("lost");
      await service.rpc("claim_email_outbox", { p_limit: 50 });
      await service.from("email_outbox").update({ locked_until: new Date(Date.now() - 60_000).toISOString() }).eq("id", id);
      const again = (await service.rpc("claim_email_outbox", { p_limit: 50 })).data ?? [];
      expect(again.map((r) => r.id)).toContain(id);
      expect((await row(id)).attempts).toBe(2);
    });

    it("only the server can use the outbox", async () => {
      expect((await teacher.from("email_outbox").select("id")).error).not.toBeNull();
      expect((await teacher.from("job_runs").select("id")).error).not.toBeNull();
      expect((await teacher.from("reminder_jobs").select("id")).error).not.toBeNull();
      expect((await teacher.rpc("claim_email_outbox", { p_limit: 5 })).error).not.toBeNull();
      expect((await admin.rpc("dispatch_due_reminders")).error).not.toBeNull();
      expect((await admin.rpc("notify", {
        p_user: users!.admin.id, p_type: "x", p_category: "system", p_entity: nullable(null),
        p_entity_id: nullable(null), p_payload: {}, p_dedupe: nullable(null), p_coalesce: false,
      })).error).not.toBeNull();
    });
  });
});
