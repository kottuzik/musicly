import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-del-${Date.now()}`;
const TEST_LESSON_TYPE = "תחום בדיקה";
const PASSWORD = "Test-pass-12345!";
// Unique strings that must never survive a purge.
const PHONE = `050${String(Date.now()).slice(-7)}`;
const EMAIL = `${PREFIX}-student@example.test`;
const NOTE = `${PREFIX}-secret-note`;

type Client = SupabaseClient<Database>;

function newClient(apiKey = key): Client {
  return createClient<Database>(url, apiKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signedIn(user: { email: string; password: string }) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

const nullable = <T,>(v: T | null) => v as unknown as T;
const at = (daysFromNow: number, hour = 10) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};
const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);
const AGED = new Date(Date.now() - 86_400_000).toISOString();

describe.skipIf(!users)("Soft delete, purge and history deletion (Development)", () => {
  let service: Client;
  let admin: Client;
  let superAdmin: Client;
  let teacher: Client;
  let lessonTypeId: string;
  let regularTeacherId = "";
  const studentIds: string[] = [];
  const teacherIds: string[] = [];
  const authIds: string[] = [];
  const created: TestUser[] = [];
  let dayCounter = 0;

  async function newStudent(name: string, teacherId = regularTeacherId) {
    const { data, error } = await admin.rpc("save_student", {
      p_id: nullable<string>(null), p_full_name: `${PREFIX} ${name}`, p_birth_date: "2010-01-01", p_phone: PHONE,
      p_email: EMAIL, p_parent_name: "הורה", p_parent_phone: PHONE, p_parent_email: EMAIL,
    });
    if (error) throw error;
    studentIds.push(data);
    const { error: subjectError } = await admin.rpc("save_student_subject", {
      p_id: nullable<string>(null), p_student_id: data, p_lesson_type_id: lessonTypeId,
      p_teacher_id: teacherId, p_level: "beginner", p_background: "רקע מקצועי",
    });
    if (subjectError) throw subjectError;
    return data;
  }

  // A teacher with a real sign-in account, created directly (as the invitation flow would).
  async function newTeacher(name: string) {
    const email = `${PREFIX}-t${authIds.length}@example.test`;
    const { data: u, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (error || !u.user) throw error ?? new Error("createUser failed");
    authIds.push(u.user.id);
    await service.from("profiles").insert({ id: u.user.id, full_name: `${PREFIX} ${name}`, email, role: "teacher", status: "active" });
    const { data: t, error: tError } = await service
      .from("teachers")
      .insert({ full_name: `${PREFIX} ${name}`, email, phone: PHONE, profile_id: u.user.id })
      .select("id")
      .single();
    if (tError) throw tError;
    teacherIds.push(t.id);
    await service.from("teacher_skills").insert({ teacher_id: t.id, lesson_type_id: lessonTypeId });
    created.push({ id: u.user.id, email, password: PASSWORD });
    return { id: t.id, profileId: u.user.id, email };
  }

  // Inserts a lesson directly: these tests are about deletion, not about booking rules.
  async function newLesson(student: string, teacherId: string, daysFromNow: number, status: "scheduled" | "cancelled" = "scheduled") {
    dayCounter += 1;
    const start = at(daysFromNow, 8 + (dayCounter % 10));
    const { data, error } = await service
      .from("lessons")
      .insert({
        student_id: student, teacher_id: teacherId, lesson_type_id: lessonTypeId, status, location: "school",
        start_at: start.toISOString(), end_at: addMinutes(start, 45).toISOString(),
        occurrence_date: start.toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const student = async (id: string) => (await service.from("students").select("*").eq("id", id).maybeSingle()).data;
  const teacherRow = async (id: string) => (await service.from("teachers").select("*").eq("id", id).maybeSingle()).data;
  const lesson = async (id: string) => (await service.from("lessons").select("*").eq("id", id).maybeSingle()).data;
  const age = (table: "students" | "teachers", id: string) => service.from(table).update({ purge_after: AGED }).eq("id", id);

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [admin, superAdmin, teacher] = await Promise.all([signedIn(users!.admin), signedIn(users!.superAdmin), signedIn(users!.teacher)]);
    const { data: lt, error } = await service.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single();
    if (error) throw error;
    lessonTypeId = lt.id;
    const { data: t } = await service.from("teachers").select("id").eq("profile_id", users!.teacher.id).single();
    regularTeacherId = t!.id;
    // The plain admin starts without the right to delete student history.
    await superAdmin.rpc("set_admin_permissions", { p_profile_id: users!.admin.id, p_delete_student_history: false });
  });

  afterAll(async () => {
    if (!service) return;
    await superAdmin.rpc("set_admin_permissions", { p_profile_id: users!.admin.id, p_delete_student_history: false });
    const { data: lessons } = await service.from("lessons").select("id").or(`student_id.in.(${studentIds.join(",") || "00000000-0000-0000-0000-000000000000"}),teacher_id.in.(${teacherIds.join(",") || "00000000-0000-0000-0000-000000000000"})`);
    const ids = (lessons ?? []).map((l) => l.id);
    if (ids.length) {
      await service.from("lesson_change_requests").delete().in("lesson_id", ids);
      await service.from("notifications").delete().in("entity_id", ids);
      await service.from("audit_events").delete().in("entity_id", ids);
      await service.from("lessons").delete().in("id", ids);
    }
    await service.from("audit_events").delete().in("entity_id", [...studentIds, ...teacherIds]);
    await service.from("notifications").delete().in("entity_id", [...studentIds, ...teacherIds]);
    await service.from("exception_booking_requests").delete().in("student_id", studentIds);
    await service.from("student_subjects").delete().in("student_id", studentIds);
    await service.from("students").delete().in("id", studentIds);
    await service.from("student_subjects").delete().in("regular_teacher_id", teacherIds);
    await service.from("teacher_availability").delete().in("teacher_id", teacherIds);
    await service.from("teacher_skills").delete().in("teacher_id", teacherIds);
    await service.from("email_outbox").delete().like("to_email", `${PREFIX}%`);
    await service.from("teachers").delete().in("id", teacherIds);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });

  it("deleting a student hides them, cancels future lessons and keeps the past", async () => {
    const id = await newStudent("מחיקה");
    const past = await newLesson(id, regularTeacherId, -9);
    const future = await newLesson(id, regularTeacherId, 9);
    expect((await teacher.from("students").select("id").eq("id", id)).data).toHaveLength(1);

    expect((await teacher.rpc("delete_student", { p_id: id })).error?.message).toBe("not_allowed");
    expect((await admin.rpc("delete_student", { p_id: id })).error).toBeNull();

    const row = await student(id);
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.status).toBe("inactive");
    expect((await lesson(future))?.status).toBe("cancelled");
    expect((await lesson(past))?.status).toBe("scheduled");
    // The regular teacher no longer sees the student at all.
    expect((await teacher.from("students").select("id").eq("id", id)).data).toHaveLength(0);

    const list = await admin.rpc("list_deleted_people", { p_kind: "student" });
    const entry = list.data?.find((p) => p.id === id);
    expect(entry).toMatchObject({ purged: false });
    expect(entry?.days_left).toBeGreaterThanOrEqual(29);
    expect((await teacher.rpc("list_deleted_people", { p_kind: "student" })).error?.message).toBe("not_allowed");

    // A deleted student cannot be edited or booked.
    const edit = await admin.rpc("save_student", {
      p_id: id, p_full_name: `${PREFIX} חדש`, p_birth_date: "2010-01-01", p_phone: "", p_email: "",
      p_parent_name: "", p_parent_phone: "", p_parent_email: "",
    });
    expect(edit.error?.message).toBe("person_deleted");
    const second = await admin.rpc("delete_student", { p_id: id });
    expect(second.error?.message).toBe("person_deleted");
    const booked = await service.from("lessons").insert({
      student_id: id, teacher_id: regularTeacherId, lesson_type_id: lessonTypeId, location: "school",
      start_at: at(20).toISOString(), end_at: addMinutes(at(20), 45).toISOString(), occurrence_date: at(20).toISOString().slice(0, 10),
    });
    expect(booked.error?.message).toBe("person_deleted");
  });

  it("restoring within 30 days brings the student back with the chosen status and no lessons", async () => {
    const id = await newStudent("שחזור");
    const future = await newLesson(id, regularTeacherId, 10);
    await admin.rpc("delete_student", { p_id: id });

    expect((await teacher.rpc("restore_student", { p_id: id, p_status: "active" })).error?.message).toBe("not_allowed");
    expect((await admin.rpc("restore_student", { p_id: id, p_status: "active" })).error).toBeNull();

    const row = await student(id);
    expect(row).toMatchObject({ deleted_at: null, purge_after: null, status: "active" });
    expect((await lesson(future))?.status).toBe("cancelled");
    expect((await teacher.from("students").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await admin.rpc("restore_student", { p_id: id, p_status: "active" })).error?.message).toBe("not_found");
  });

  it("restoring after 30 days is refused", async () => {
    const id = await newStudent("חלון");
    await admin.rpc("delete_student", { p_id: id });
    expect((await age("students", id)).error).toBeNull();
    expect((await admin.rpc("restore_student", { p_id: id, p_status: "inactive" })).error?.message).toBe("restore_window_closed");
  });

  it("the purge removes contact details and notes but keeps the name, lessons and attendance", async () => {
    const id = await newStudent("טיהור");
    const lessonId = await newLesson(id, regularTeacherId, -8);
    await service.from("attendance").insert({ lesson_id: lessonId, status: "held", note: NOTE });
    await admin.rpc("delete_student", { p_id: id });
    await age("students", id);

    // Not purgeable by a user, and the history cannot be deleted before the purge.
    expect((await admin.rpc("purge_student" as never, { p_id: id } as never)).error).not.toBeNull();
    await superAdmin.rpc("set_admin_permissions", { p_profile_id: users!.superAdmin.id, p_delete_student_history: false });
    expect((await superAdmin.rpc("delete_student_history", { p_id: id })).error?.message).toBe("not_purged");

    expect((await service.rpc("purge_soft_deleted_records")).error).toBeNull();

    const row = await student(id);
    expect(row).toMatchObject({ birth_date: null, status: "inactive" });
    expect(row?.anonymized_at).not.toBeNull();
    expect(row?.full_name).toBe(`${PREFIX} טיהור`);
    expect((await service.from("student_contacts").select("student_id").eq("student_id", id)).data).toHaveLength(0);
    expect((await service.from("student_subjects").select("id").eq("student_id", id)).data).toHaveLength(0);
    expect((await lesson(lessonId))?.status).toBe("scheduled");
    const attendance = (await service.from("attendance").select("*").eq("lesson_id", lessonId).single()).data;
    expect(attendance).toMatchObject({ status: "held", note: null });

    const listed = (await admin.rpc("list_deleted_people", { p_kind: "student" })).data?.find((p) => p.id === id);
    expect(listed).toMatchObject({ purged: true, lessons: 1 });
    // The teacher's history still shows the lesson with the student's name.
    const history = await teacher.rpc("list_history_lessons", {
      p_student_id: id, p_teacher_id: nullable<string>(null), p_from: at(-30).toISOString(), p_to: at(1).toISOString(),
    });
    expect(history.data?.[0]?.student_name).toBe(`${PREFIX} טיהור`);

    // Nothing that identifies the contact details is left anywhere we keep logs.
    for (const [table, column] of [["audit_events", "new_values"], ["audit_events", "old_values"], ["notifications", "payload"], ["email_outbox", "payload"], ["job_runs", "summary"]] as const) {
      const { data } = await service.from(table).select(column).limit(2000);
      const text = JSON.stringify(data ?? []);
      expect(text, `${table}.${column}`).not.toContain(PHONE);
      expect(text, `${table}.${column}`).not.toContain(EMAIL);
      expect(text, `${table}.${column}`).not.toContain(NOTE);
    }
  });

  it("deleting a student's history needs permission and removes only that student's records", async () => {
    const id = await newStudent("היסטוריה");
    const other = await newStudent("אחר");
    const lessonId = await newLesson(id, regularTeacherId, -7);
    const otherLesson = await newLesson(other, regularTeacherId, -7);
    await service.from("attendance").insert({ lesson_id: lessonId, status: "held" });
    await admin.rpc("delete_student", { p_id: id });
    await age("students", id);
    await service.rpc("purge_soft_deleted_records");

    // A plain admin without the permission, and a teacher, are refused by the database itself.
    expect((await admin.rpc("delete_student_history", { p_id: id })).error?.message).toBe("not_allowed");
    expect((await teacher.rpc("delete_student_history", { p_id: id })).error?.message).toBe("not_allowed");
    expect(await lesson(lessonId)).not.toBeNull();

    // A plain admin cannot give themselves the permission.
    expect((await admin.rpc("set_admin_permissions", { p_profile_id: users!.admin.id, p_delete_student_history: true })).error).not.toBeNull();

    // Granted by the super admin, the admin may.
    expect((await superAdmin.rpc("set_admin_permissions", { p_profile_id: users!.admin.id, p_delete_student_history: true })).error).toBeNull();
    const done = await admin.rpc("delete_student_history", { p_id: id });
    expect(done.error).toBeNull();
    expect(done.data).toBe(1);
    expect(await lesson(lessonId)).toBeNull();
    expect(await student(id)).toBeNull();
    expect((await service.from("attendance").select("lesson_id").eq("lesson_id", lessonId)).data).toHaveLength(0);
    expect(await lesson(otherLesson)).not.toBeNull();
    expect(await student(other)).not.toBeNull();
    await superAdmin.rpc("set_admin_permissions", { p_profile_id: users!.admin.id, p_delete_student_history: false });
  });

  it("the super admin may delete student history without any extra permission", async () => {
    const id = await newStudent("מנהל ראשי");
    await newLesson(id, regularTeacherId, -6);
    await admin.rpc("delete_student", { p_id: id });
    await age("students", id);
    await service.rpc("purge_soft_deleted_records");
    expect((await superAdmin.rpc("delete_student_history", { p_id: id })).error).toBeNull();
    expect(await student(id)).toBeNull();
  });

  it("deleting a teacher blocks their account, flags their lessons and can be restored", async () => {
    const t = await newTeacher("מחיקה");
    const s = await newStudent("של מורה", t.id);
    const future = await newLesson(s, t.id, 11);
    const past = await newLesson(s, t.id, -5);
    await service.from("teacher_availability").insert({
      teacher_id: t.id, day_of_week: 2, start_time: "10:00", end_time: "12:00", valid_from: at(0).toISOString().slice(0, 10),
    });
    const signed = await signedIn(created[created.length - 1]);
    // Active, the teacher can read their history.
    const range = { p_student_id: nullable<string>(null), p_teacher_id: nullable<string>(null), p_from: at(-30).toISOString(), p_to: at(30).toISOString() };
    expect((await signed.rpc("list_history_lessons", range)).error).toBeNull();

    expect((await teacher.rpc("delete_teacher", { p_id: t.id })).error?.message).toBe("not_allowed");
    expect((await admin.rpc("delete_teacher", { p_id: t.id })).error).toBeNull();

    const row = await teacherRow(t.id);
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.status).toBe("inactive");
    expect((await lesson(future))).toMatchObject({ status: "scheduled", requires_attention: true, attention_reason: "teacher_inactive" });
    expect((await lesson(past))?.status).toBe("scheduled");

    // The account is locked out of everything; the profile row only says it was deleted.
    expect((await signed.rpc("list_history_lessons", range)).error?.message).toBe("not_allowed");
    expect((await signed.from("lessons").select("id")).data ?? []).toHaveLength(0);
    expect((await signed.from("profiles").select("deleted_at").eq("id", t.profileId).single()).data?.deleted_at).not.toBeNull();

    // No new work can be pointed at them.
    const edit = await admin.rpc("save_teacher", {
      p_id: t.id, p_full_name: `${PREFIX} חדש`, p_email: t.email, p_phone: "", p_lesson_type_ids: [lessonTypeId],
    });
    expect(edit.error?.message).toBe("person_deleted");
    expect((await service.from("teacher_skills").insert({ teacher_id: t.id, lesson_type_id: lessonTypeId })).error?.message).toBe("person_deleted");

    expect((await admin.rpc("list_deleted_people", { p_kind: "teacher" })).data?.find((p) => p.id === t.id)).toMatchObject({ purged: false });

    // Restoring needs a status, and for "active" a decision about the availability.
    expect((await admin.rpc("restore_teacher", { p_id: t.id, p_status: "active", p_availability_mode: nullable<string>(null) })).error?.message).toBe(
      "availability_mode_required",
    );
    expect((await admin.rpc("restore_teacher", { p_id: t.id, p_status: "active", p_availability_mode: "fresh" })).error).toBeNull();
    expect(await teacherRow(t.id)).toMatchObject({ deleted_at: null, status: "active" });
    expect((await service.from("teacher_availability").select("id").eq("teacher_id", t.id)).data).toHaveLength(0);
    const asked = await service.from("notifications").select("type").eq("user_id", t.profileId).eq("type", "availability_needed");
    expect(asked.data).toHaveLength(1);
    // The account works again.
    expect((await signedIn(created[created.length - 1]).then((c) => c.rpc("list_history_lessons", range))).error).toBeNull();
  });

  it("reactivating an inactive teacher requires choosing what happens to the availability", async () => {
    const t = await newTeacher("הפעלה");
    await admin.rpc("set_teacher_status", { p_teacher_id: t.id, p_status: "inactive" });
    expect((await admin.rpc("set_teacher_status", { p_teacher_id: t.id, p_status: "active" })).error?.message).toBe("availability_mode_required");
    expect((await admin.rpc("set_teacher_status", { p_teacher_id: t.id, p_status: "active", p_availability_mode: "bogus" })).error?.message).toBe(
      "availability_mode_required",
    );
    expect((await admin.rpc("set_teacher_status", { p_teacher_id: t.id, p_status: "active", p_availability_mode: "restore" })).error).toBeNull();
    expect((await teacherRow(t.id))?.status).toBe("active");
  });

  it("restoring a teacher as inactive keeps the account closed for work but open for history", async () => {
    const t = await newTeacher("לא פעיל");
    const s = await newStudent("היסטוריית לא פעיל", t.id);
    const past = await newLesson(s, t.id, -4);
    const future = await newLesson(s, t.id, 12);
    await admin.rpc("delete_teacher", { p_id: t.id });
    expect((await admin.rpc("restore_teacher", { p_id: t.id, p_status: "inactive", p_availability_mode: nullable<string>(null) })).error).toBeNull();

    const signed = await signedIn(created[created.length - 1]);
    const history = await signed.rpc("list_history_lessons", {
      p_student_id: nullable<string>(null), p_teacher_id: nullable<string>(null), p_from: at(-30).toISOString(), p_to: at(30).toISOString(),
    });
    expect(history.error).toBeNull();
    // Only lessons that already ended; never the upcoming one.
    expect(history.data?.map((l) => l.id)).toEqual([past]);
    expect(history.data?.map((l) => l.id)).not.toContain(future);
    // Direct reads of the lessons table and writes stay closed.
    expect((await signed.from("lessons").select("id")).data ?? []).toHaveLength(0);
    expect((await signed.rpc("set_attendance", { p_lesson_id: past, p_version: 1, p_status: "held", p_note: "" } as never)).error).not.toBeNull();
    expect((await signed.rpc("list_unreported_lessons", { p_limit: 5 })).data ?? []).toHaveLength(0);
  });

  it("the teacher purge removes the account and contact details but keeps the name and lessons", async () => {
    const t = await newTeacher("טיהור");
    const s = await newStudent("של מורה שטוהר", t.id);
    const past = await newLesson(s, t.id, -3);
    const future = await newLesson(s, t.id, 13);
    await service.from("email_outbox").insert({ to_email: t.email, kind: "test", dedupe_key: `${PREFIX}-${t.id}` });
    await service.from("teacher_availability").insert({
      teacher_id: t.id, day_of_week: 3, start_time: "10:00", end_time: "12:00", valid_from: at(0).toISOString().slice(0, 10),
    });
    await admin.rpc("delete_teacher", { p_id: t.id });
    await age("teachers", t.id);
    expect((await service.rpc("purge_soft_deleted_records")).error).toBeNull();

    const row = await teacherRow(t.id);
    expect(row).toMatchObject({ email: null, phone: null, profile_id: null });
    expect(row?.anonymized_at).not.toBeNull();
    expect(row?.full_name).toBe(`${PREFIX} טיהור`);
    expect((await service.auth.admin.getUserById(t.profileId)).data.user).toBeNull();
    expect((await service.from("profiles").select("id").eq("id", t.profileId)).data).toHaveLength(0);
    expect((await service.from("teacher_skills").select("teacher_id").eq("teacher_id", t.id)).data).toHaveLength(0);
    expect((await service.from("teacher_availability").select("id").eq("teacher_id", t.id)).data).toHaveLength(0);
    expect((await service.from("email_outbox").select("id").eq("to_email", t.email)).data).toHaveLength(0);
    expect((await lesson(past))).not.toBeNull();
    // The upcoming lesson is still there and still needs handling.
    expect(await lesson(future)).toMatchObject({ status: "scheduled", requires_attention: true });

    // History deletion waits for the upcoming lesson to be handled.
    expect((await admin.rpc("delete_teacher_history", { p_id: t.id })).error?.message).toBe("has_future_lessons");
    await service.from("lessons").update({ status: "cancelled" }).eq("id", future);

    const done = await admin.rpc("delete_teacher_history", { p_id: t.id });
    expect(done.error).toBeNull();
    expect(done.data).toBe(2);
    // The lessons remain for the student, without the teacher's name.
    expect(await lesson(past)).not.toBeNull();
    expect((await teacherRow(t.id))?.full_name).toBe("מורה שנמחק");
    const history = await admin.rpc("list_history_lessons", {
      p_student_id: s, p_teacher_id: nullable<string>(null), p_from: at(-30).toISOString(), p_to: at(30).toISOString(),
    });
    expect(history.data?.every((l) => l.teacher_name === "מורה שנמחק")).toBe(true);
    expect(JSON.stringify(history.data)).not.toContain(`${PREFIX} טיהור`);
  });

  it("a teacher cannot delete or purge anything", async () => {
    const id = await newStudent("הרשאות");
    expect((await teacher.rpc("delete_student", { p_id: id })).error?.message).toBe("not_allowed");
    expect((await teacher.rpc("delete_teacher", { p_id: regularTeacherId })).error?.message).toBe("not_allowed");
    expect((await teacher.rpc("delete_teacher_history", { p_id: regularTeacherId })).error?.message).toBe("not_allowed");
    expect((await teacher.rpc("purge_soft_deleted_records" as never)).error).not.toBeNull();
    expect((await admin.rpc("purge_soft_deleted_records" as never)).error).not.toBeNull();
    expect((await newClient().rpc("delete_student", { p_id: id })).error).not.toBeNull();
  });
});
