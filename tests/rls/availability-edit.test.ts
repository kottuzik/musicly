import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-availability-edit-${Date.now()}`;
type Client = SupabaseClient<Database>;

function newClient(apiKey = key): Client {
  return createClient<Database>(url, apiKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signedIn(user: TestUser) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

const nullable = (v: string | null) => v as unknown as string;

// Does not change the school's operating hours: it works inside whatever open day fits.
describe.skipIf(!users)("Editing weekly availability (Development)", () => {
  let service: Client;
  let admin: Client;
  let teacher: Client;
  let teacher2: Client;
  let teacherId = "";
  let lessonTypeId = "";
  let studentId = "";
  let slotId = "";
  let day = 0;
  let date = "";

  const slot = async () =>
    (await service.from("teacher_availability").select("start_time, end_time").eq("id", slotId).single()).data;
  const update = (client: Client, start: string, end: string) =>
    client.rpc("update_availability", { p_availability_id: slotId, p_start: start, p_end: end });

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    [admin, teacher, teacher2] = await Promise.all([signedIn(users!.admin), signedIn(users!.teacher), signedIn(users!.teacher2)]);
    const { data: t } = await service.from("teachers").select("id").eq("profile_id", users!.teacher.id).single();
    teacherId = t!.id;
    const { data: lt } = await service.from("lesson_types").select("id").eq("name", "תחום בדיקה").single();
    lessonTypeId = lt!.id;
    const { data: hours } = await service.from("operating_hours").select("day_of_week, open_time, close_time");
    const open = (hours ?? []).find((h) => h.open_time <= "11:00:00" && h.close_time >= "17:00:00");
    if (!open) throw new Error("No open day covers 11:00-17:00 on Development");
    day = open.day_of_week;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 100);
    while (d.getUTCDay() !== day) d.setUTCDate(d.getUTCDate() + 1);
    date = d.toISOString().slice(0, 10);

    await service.from("availability_requests").delete().eq("teacher_id", teacherId);
    await service.from("teacher_availability").delete().eq("teacher_id", teacherId);
    const { data: added, error } = await teacher.rpc("add_availability", { p_teacher_id: teacherId, p_day: day, p_start: "12:00", p_end: "14:00" });
    if (error) throw error;
    slotId = added;

    const { data: student, error: studentError } = await admin.rpc("save_student", {
      p_id: nullable(null),
      p_full_name: PREFIX,
      p_birth_date: "2010-01-01",
      p_phone: "",
      p_email: "",
      p_parent_name: "",
      p_parent_phone: "",
      p_parent_email: "",
    });
    if (studentError) throw studentError;
    studentId = student;
    await admin.rpc("save_student_subject", {
      p_id: nullable(null),
      p_student_id: studentId,
      p_lesson_type_id: lessonTypeId,
      p_teacher_id: teacherId,
      p_level: "beginner",
      p_background: "",
    });
  });

  afterAll(async () => {
    if (!service) return;
    await service.from("lessons").delete().eq("student_id", studentId);
    await service.from("student_subjects").delete().eq("student_id", studentId);
    await service.from("students").delete().eq("id", studentId);
    await service.from("availability_requests").delete().eq("teacher_id", teacherId);
    await service.from("teacher_availability").delete().eq("teacher_id", teacherId);
  });

  it("a teacher widens their own hours at once", async () => {
    const { error } = await update(teacher, "11:00", "16:00");
    expect(error).toBeNull();
    expect(await slot()).toEqual({ start_time: "11:00:00", end_time: "16:00:00" });
  });

  it("a teacher cannot narrow or move hours without a request", async () => {
    expect((await update(teacher, "11:00", "15:00")).error?.message).toBe("availability_narrowing_needs_request");
    expect((await update(teacher, "12:00", "17:00")).error?.message).toBe("availability_narrowing_needs_request");
    expect(await slot()).toEqual({ start_time: "11:00:00", end_time: "16:00:00" });
  });

  it("another teacher cannot change it", async () => {
    expect((await update(teacher2, "11:00", "17:00")).error?.message).toBe("not_allowed");
  });

  it("an overlap with another slot of the same day is refused", async () => {
    const { data: other } = await admin.rpc("add_availability", { p_teacher_id: teacherId, p_day: day, p_start: "16:00", p_end: "17:00" });
    expect((await update(admin, "11:00", "16:30")).error?.message).toBe("availability_overlap");
    await service.from("teacher_availability").delete().eq("id", other!);
  });

  it("an admin narrows at once, flagging only lessons left outside the new hours", async () => {
    const book = (start: string) =>
      admin.rpc("book_lesson", {
        p_student_id: studentId,
        p_lesson_type_id: lessonTypeId,
        p_teacher_id: teacherId,
        p_date: date,
        p_start_time: start,
        p_duration: 45,
        p_location: "school",
        p_confirm_outside_hours: false,
      });
    const inside = (await book("11:00")).data as { id: string };
    const outside = (await book("14:00")).data as { id: string };

    const { data, error } = await update(admin, "11:00", "13:00");
    expect(error).toBeNull();
    expect(data).toBe(1);
    const { data: lessons } = await service.from("lessons").select("id, requires_attention, attention_reason").in("id", [inside.id, outside.id]);
    expect(lessons?.find((l) => l.id === inside.id)?.requires_attention).toBe(false);
    expect(lessons?.find((l) => l.id === outside.id)).toMatchObject({ requires_attention: true, attention_reason: "availability_removed" });
  });

  it("one range becomes two: directly when nothing is removed, and only an admin otherwise", async () => {
    const ranges = async () =>
      ((await service.from("teacher_availability").select("start_time").eq("teacher_id", teacherId).eq("day_of_week", day).order("start_time")).data ?? []).map(
        (r) => r.start_time.slice(0, 5),
      );
    const { data: added } = await teacher.rpc("add_availability", { p_teacher_id: teacherId, p_day: day, p_start: "15:00", p_end: "16:00" });
    const split = (client: Client, s1: string, e1: string, s2: string, e2: string) =>
      client.rpc("update_availability", { p_availability_id: added!, p_start: s1, p_end: e1, p_second_start: s2, p_second_end: e2 });

    // Removes 15:30-15:45, so a teacher is refused and nothing changes.
    expect((await split(teacher, "15:00", "15:30", "15:45", "16:00")).error?.message).toBe("availability_narrowing_needs_request");
    expect(await ranges()).toEqual(["11:00", "15:00"]);

    // The old hours stay whole inside the first range, so a teacher may do it.
    expect((await split(teacher, "14:45", "16:00", "16:15", "16:45")).error).toBeNull();
    expect(await ranges()).toEqual(["11:00", "14:45", "16:15"]);

    // A second range that overlaps another slot saves neither range.
    expect((await split(admin, "14:45", "15:00", "16:00", "16:30")).error?.message).toBe("availability_overlap");
    const { data: kept } = await service.from("teacher_availability").select("end_time").eq("id", added!).single();
    expect(kept?.end_time).toBe("16:00:00");
    await service.from("teacher_availability").delete().eq("teacher_id", teacherId).eq("start_time", "16:15");

    // An admin may remove hours in the middle.
    expect((await split(admin, "14:45", "15:00", "15:30", "16:00")).error).toBeNull();
    expect(await ranges()).toEqual(["11:00", "14:45", "15:30"]);
    await service.from("teacher_availability").delete().eq("teacher_id", teacherId).neq("id", slotId);
  });

  it("a second range must come after the first", async () => {
    const { error } = await admin.rpc("update_availability", {
      p_availability_id: slotId,
      p_start: "12:00",
      p_end: "13:00",
      p_second_start: "11:00",
      p_second_end: "11:30",
    });
    expect(error?.message).toBe("invalid_time_step");
  });

  it("a slot waiting for removal cannot be edited", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    const { error: requestError } = await teacher.rpc("remove_availability", {
      p_availability_id: slotId,
      p_kind: "remove_weekly",
      p_date: today,
      p_reason: "",
    });
    expect(requestError).toBeNull();
    expect((await update(admin, "11:00", "14:00")).error?.message).toBe("removal_pending");
  });
});
