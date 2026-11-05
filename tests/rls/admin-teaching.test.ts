import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-admin-teaching-${Date.now()}`;
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

// A Monday about three months ahead, far from other tests' data.
function baseMonday() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 90);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const D = baseMonday();
const nullable = (v: string | null) => v as unknown as string;

describe.skipIf(!users)("An admin who also teaches (Development)", () => {
  let service: Client;
  let superAdmin: Client;
  let admin: Client;
  let admin2: Client;
  let teacher: Client;
  let lessonTypeId = "";
  let teachingId = "";
  let regularTeacherId = "";
  let savedHours: Hours[] = [];
  const studentIds: string[] = [];

  const book = (client: Client, student: string, teacherId: string, start: string, date = D) =>
    client.rpc("book_lesson", {
      p_student_id: student,
      p_lesson_type_id: lessonTypeId,
      p_teacher_id: teacherId,
      p_date: date,
      p_start_time: start,
      p_duration: 45,
      p_location: "school",
      p_confirm_outside_hours: false,
    });

  const newStudent = async (name: string) => {
    const { data, error } = await admin.rpc("save_student", {
      p_id: nullable(null),
      p_full_name: `${PREFIX} ${name}`,
      p_birth_date: "2010-01-01",
      p_phone: "",
      p_email: "",
      p_parent_name: "",
      p_parent_phone: "",
      p_parent_email: "",
    });
    if (error) throw error;
    studentIds.push(data);
    const { error: subjectError } = await admin.rpc("save_student_subject", {
      p_id: nullable(null),
      p_student_id: data,
      p_lesson_type_id: lessonTypeId,
      p_teacher_id: teachingId,
      p_level: "beginner",
      p_background: "",
    });
    if (subjectError) throw subjectError;
    return data;
  };

  const removeTeachingRows = async () => {
    const { data: rows } = await service
      .from("teachers")
      .select("id")
      .in("profile_id", [users!.admin.id, users!.admin2.id]);
    const ids = (rows ?? []).map((r) => r.id);
    if (!ids.length) return;
    await service.from("lessons").delete().in("teacher_id", ids);
    await service.from("lesson_series").delete().in("teacher_id", ids);
    await service.from("exception_booking_requests").delete().in("teacher_id", ids);
    await service.from("student_subjects").delete().in("regular_teacher_id", ids);
    await service.from("teacher_availability").delete().in("teacher_id", ids);
    await service.from("teacher_skills").delete().in("teacher_id", ids);
    await service.from("teachers").delete().in("id", ids);
  };

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [superAdmin, admin, admin2, teacher] = await Promise.all([
      signedIn(users!.superAdmin),
      signedIn(users!.admin),
      signedIn(users!.admin2),
      signedIn(users!.teacher),
    ]);
    await removeTeachingRows();
    await service.from("profiles").update({ status: "active" }).in("id", [users!.admin.id, users!.admin2.id]);

    const { data: lt, error } = await service.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single();
    if (error) throw error;
    lessonTypeId = lt.id;
    const { data: t } = await service.from("teachers").select("id").eq("profile_id", users!.teacher.id).single();
    regularTeacherId = t!.id;

    const { data: hours } = await service.from("operating_hours").select("*");
    savedHours = hours ?? [];
    const week = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "08:00", close: "20:00" }));
    const { error: hoursError } = await admin.rpc("set_operating_hours", { p_days: week });
    if (hoursError) throw hoursError;
  });

  afterAll(async () => {
    if (!service) return;
    await service.from("profiles").update({ status: "active" }).in("id", [users!.admin.id, users!.admin2.id]);
    await service.from("lessons").delete().in("student_id", studentIds);
    await service.from("lesson_series").delete().in("student_id", studentIds);
    await service.from("exception_booking_requests").delete().in("student_id", studentIds);
    await removeTeachingRows();
    await service.from("student_subjects").delete().in("student_id", studentIds);
    await service.from("students").delete().in("id", studentIds);
    await service.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await service.from("operating_hours").insert(savedHours);
  });

  describe("who can turn teaching on", () => {
    it("before teaching is on, an admin has no teacher identity", async () => {
      const { data, error } = await admin.rpc("current_teacher_id");
      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it("a regular teacher cannot turn it on, and gains no admin rights", async () => {
      const own = await teacher.rpc("enable_admin_teaching", { p_profile_id: users!.teacher.id, p_lesson_type_ids: [lessonTypeId] });
      expect(own.error?.message).toBe("not_allowed");
      const other = await teacher.rpc("enable_admin_teaching", { p_profile_id: users!.admin.id, p_lesson_type_ids: [lessonTypeId] });
      expect(other.error?.message).toBe("not_allowed");
      expect((await teacher.rpc("is_admin")).data).toBe(false);
    });

    it("a regular admin cannot turn it on for another admin", async () => {
      const { error } = await admin2.rpc("enable_admin_teaching", { p_profile_id: users!.admin.id, p_lesson_type_ids: [lessonTypeId] });
      expect(error?.message).toBe("not_allowed");
    });

    it("at least one subject is required", async () => {
      const { error } = await admin.rpc("enable_admin_teaching", { p_profile_id: users!.admin.id, p_lesson_type_ids: [] });
      expect(error?.message).toBe("skills_required");
    });

    it("an admin turns it on for themself, keeping the admin role", async () => {
      const { data, error } = await admin.rpc("enable_admin_teaching", { p_profile_id: users!.admin.id, p_lesson_type_ids: [lessonTypeId] });
      expect(error).toBeNull();
      teachingId = data!;
      expect((await admin.rpc("current_teacher_id")).data).toBe(teachingId);
      const { data: profile } = await service.from("profiles").select("role, status").eq("id", users!.admin.id).single();
      expect(profile).toEqual({ role: "admin", status: "active" });
      expect((await admin.rpc("is_admin")).data).toBe(true);
    });

    it("the super admin can turn it on for another admin", async () => {
      const { data, error } = await superAdmin.rpc("enable_admin_teaching", { p_profile_id: users!.admin2.id, p_lesson_type_ids: [lessonTypeId] });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
    });

    it("no second teachers row is created when turned on again", async () => {
      const { data, error } = await admin.rpc("enable_admin_teaching", { p_profile_id: users!.admin.id, p_lesson_type_ids: [lessonTypeId] });
      expect(error).toBeNull();
      expect(data).toBe(teachingId);
    });

    it("a teaching admin still sees all lessons' data as an admin", async () => {
      const { data } = await admin.from("teachers").select("id").eq("id", regularTeacherId);
      expect(data).toHaveLength(1);
    });
  });

  describe("booking", () => {
    it("inside availability it is a normal lesson, and overlaps are blocked", async () => {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
      const slots = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        teacher_id: teachingId,
        day_of_week: day,
        start_time: "09:00",
        end_time: "12:00",
        valid_from: today,
      }));
      const { error: slotError } = await service.from("teacher_availability").insert(slots);
      expect(slotError).toBeNull();

      const s1 = await newStudent("s1");
      const s2 = await newStudent("s2");
      const { data, error } = await book(admin2, s1, teachingId, "10:00");
      expect(error).toBeNull();
      expect((data as { result: string }).result).toBe("lesson");
      expect((await book(admin2, s2, teachingId, "10:15")).error?.message).toBe("teacher_busy");
    });

    it("their own booking outside availability is approved at once, and stays in the history", async () => {
      const student = studentIds[1];
      const { data, error } = await book(admin, student, teachingId, "14:00");
      expect(error).toBeNull();
      const { id } = data as { id: string };
      const { data: request } = await service
        .from("exception_booking_requests")
        .select("status, lesson_id, decided_by")
        .eq("id", id)
        .single();
      expect(request?.status).toBe("approved");
      expect(request?.decided_by).toBe(users!.admin.id);
      const { data: lesson } = await service.from("lessons").select("status, teacher_id").eq("id", request!.lesson_id!).single();
      expect(lesson).toEqual({ status: "scheduled", teacher_id: teachingId });
    });

    it("their own weekly series outside availability is created at once", async () => {
      const student = await newStudent("s3");
      const { data, error } = await admin.rpc("create_series", {
        p_student_id: student,
        p_lesson_type_id: lessonTypeId,
        p_meetings: [{ day: 3, start: "15:00" }],
        p_start_date: D,
        p_end_date: nullable(null),
        p_location: "school",
        p_confirm_outside_hours: false,
      });
      expect(error).toBeNull();
      const [meeting] = data as { result: string; id: string }[];
      const { data: request } = await service
        .from("exception_booking_requests")
        .select("status, series_id")
        .eq("id", meeting.id)
        .single();
      expect(request?.status).toBe("approved");
      const { count } = await service
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("series_id", request!.series_id!)
        .eq("status", "scheduled");
      expect(count).toBeGreaterThan(0);
    });

    it("another admin's booking outside availability waits for this admin's answer", async () => {
      const student = await newStudent("s4");
      const { data, error } = await book(admin2, student, teachingId, "16:00");
      expect(error).toBeNull();
      const { id } = data as { id: string };
      const { data: request } = await service.from("exception_booking_requests").select("status, version").eq("id", id).single();
      expect(request?.status).toBe("pending");

      const { data: notes } = await service
        .from("notifications")
        .select("type")
        .eq("user_id", users!.admin.id)
        .eq("entity_id", id);
      expect(notes?.map((n) => n.type)).toEqual(["approval_request_new"]);

      // The admin who asked cannot answer for the teacher.
      const wrong = await admin2.rpc("respond_exception_request", { p_id: id, p_version: request!.version, p_approve: true, p_note: "" });
      expect(wrong.error?.message).toBe("not_allowed");

      const { data: answer, error: answerError } = await admin.rpc("respond_exception_request", {
        p_id: id,
        p_version: request!.version,
        p_approve: true,
        p_note: "",
      });
      expect(answerError).toBeNull();
      expect((answer as { result: string }).result).toBe("approved");
    });

    it("a lesson the admin books for themself creates no notification to them", async () => {
      const student = await newStudent("s5");
      const { data } = await book(admin, student, teachingId, "11:00", D);
      const { id } = data as { id: string };
      const { count } = await service
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", users!.admin.id)
        .eq("entity_id", id);
      expect(count).toBe(0);
    });

    it("an admin does not ask for changes to their own lesson: they change it directly", async () => {
      const { data: lesson } = await service.from("lessons").select("id").eq("teacher_id", teachingId).eq("status", "scheduled").limit(1).single();
      const { error } = await admin.rpc("request_lesson_change", {
        p_lesson_id: lesson!.id,
        p_kind: "cancel",
        p_date: nullable(null),
        p_start: nullable(null),
        p_reason: "",
      });
      expect(error?.message).toBe("not_allowed");
    });

    it("the teaching admin can set reminders", async () => {
      const { error } = await admin.rpc("save_reminder_preferences", { p_enabled: true, p_offsets: [60] });
      expect(error).toBeNull();
      const { data } = await admin.from("reminder_preferences").select("enabled, offsets_minutes").single();
      expect(data).toEqual({ enabled: true, offsets_minutes: [60] });
    });
  });

  describe("stopping", () => {
    it("the teacher screens' deletion is refused", async () => {
      const { error } = await admin2.rpc("delete_teacher", { p_id: teachingId });
      expect(error?.message).toBe("admin_teacher_not_deletable");
    });

    it("another regular admin cannot stop their teaching in any way", async () => {
      expect((await admin2.rpc("stop_admin_teaching", { p_profile_id: users!.admin.id })).error?.message).toBe("not_allowed");
      const direct = await admin2.rpc("set_teacher_status", { p_teacher_id: teachingId, p_status: "inactive" });
      expect(direct.error?.message).toBe("not_allowed");
    });

    it("stopping flags the lessons and leaves the admin account active", async () => {
      const { error } = await admin.rpc("stop_admin_teaching", { p_profile_id: users!.admin.id });
      expect(error).toBeNull();
      const { data: profile } = await service.from("profiles").select("status").eq("id", users!.admin.id).single();
      expect(profile?.status).toBe("active");
      const { data: row } = await service.from("teachers").select("status").eq("id", teachingId).single();
      expect(row?.status).toBe("inactive");
      const { data: lessons } = await service
        .from("lessons")
        .select("requires_attention, attention_reason")
        .eq("teacher_id", teachingId)
        .eq("status", "scheduled")
        .gt("start_at", new Date().toISOString());
      expect(lessons?.length).toBeGreaterThan(0);
      expect(lessons?.every((l) => l.requires_attention && l.attention_reason === "teacher_inactive")).toBe(true);
      // Still a working admin.
      expect((await admin.rpc("is_admin")).data).toBe(true);
    });

    it("no new lesson can be booked with them", async () => {
      const { error } = await book(admin2, studentIds[0], teachingId, "11:00", D);
      expect(error?.message).toBeTruthy();
    });

    it("turning it on again keeps the same row, and lessons stay as they were", async () => {
      const { data, error } = await admin.rpc("enable_admin_teaching", { p_profile_id: users!.admin.id, p_lesson_type_ids: [lessonTypeId] });
      expect(error).toBeNull();
      expect(data).toBe(teachingId);
      const { data: row } = await service.from("teachers").select("status").eq("id", teachingId).single();
      expect(row?.status).toBe("active");
    });

    it("deactivating the admin account also stops their teaching and flags lessons", async () => {
      await service.from("lessons").update({ requires_attention: false, attention_reason: null }).eq("teacher_id", teachingId);
      const { error } = await superAdmin.rpc("set_admin_status", { p_profile_id: users!.admin.id, p_status: "inactive" });
      expect(error).toBeNull();
      const { data: row } = await service.from("teachers").select("status").eq("id", teachingId).single();
      expect(row?.status).toBe("inactive");
      const { data: lessons } = await service
        .from("lessons")
        .select("requires_attention")
        .eq("teacher_id", teachingId)
        .eq("status", "scheduled")
        .gt("start_at", new Date().toISOString());
      expect(lessons?.every((l) => l.requires_attention)).toBe(true);
      await superAdmin.rpc("set_admin_status", { p_profile_id: users!.admin.id, p_status: "active" });
    });
  });

  describe("regular teachers keep working as before", () => {
    it("a regular teacher's status still follows their account", async () => {
      const { error } = await superAdmin.rpc("set_teacher_status", { p_teacher_id: regularTeacherId, p_status: "inactive" });
      expect(error).toBeNull();
      const { data } = await service.from("profiles").select("status").eq("id", users!.teacher.id).single();
      expect(data?.status).toBe("inactive");
      const back = await superAdmin.rpc("set_teacher_status", {
        p_teacher_id: regularTeacherId,
        p_status: "active",
        p_availability_mode: "restore",
      });
      expect(back.error).toBeNull();
    });
  });
});
