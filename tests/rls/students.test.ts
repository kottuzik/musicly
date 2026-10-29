import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const PREFIX = `rls-${Date.now()}`;

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

// Date string N days from today (UTC date is close enough: tests use offsets of several days).
function daysFromToday(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe.skipIf(!users)("RLS and RPCs for students (Development)", () => {
  let service: Client;
  let admin: Client;
  let teacher: Client;
  let teacher2: Client;
  let teacherInactive: Client;
  let anon: Client;
  const lessonTypes: Record<"a" | "b" | "c", string> = { a: "", b: "", c: "" };
  const teacherIds: Record<"teacher" | "teacher2" | "teacherInactive", string> = { teacher: "", teacher2: "", teacherInactive: "" };
  let studentId: string;
  let otherStudentId: string;
  let subjectA: string;
  let subjectB: string;

  const saveStudent = (client: Client, name: string, id: string | null = null) =>
    client.rpc("save_student", {
      p_id: id as unknown as string,
      p_full_name: name,
      p_birth_date: "2014-03-01",
      p_phone: "050-1111111",
      p_email: "Student@Example.test",
      p_parent_name: "הורה בדיקה",
      p_parent_phone: "050-2222222",
      p_parent_email: "parent@example.test",
    });

  const saveSubject = (
    client: Client,
    args: { id?: string | null; student: string; lessonType: string; teacherId: string; level?: "beginner" | "intermediate" | "advanced" },
  ) =>
    client.rpc("save_student_subject", {
      p_id: (args.id ?? null) as unknown as string,
      p_student_id: args.student,
      p_lesson_type_id: args.lessonType,
      p_teacher_id: args.teacherId,
      p_level: args.level ?? "beginner",
      p_background: "רקע",
    });

  beforeAll(async () => {
    service = newClient(process.env.SUPABASE_SECRET_KEY!);
    anon = newClient();
    [admin, teacher, teacher2, teacherInactive] = await Promise.all([
      signedIn(users!.admin),
      signedIn(users!.teacher),
      signedIn(users!.teacher2),
      signedIn(users!.teacherInactive),
    ]);

    for (const k of ["a", "b", "c"] as const) {
      const { data, error } = await service
        .from("lesson_types")
        .insert({ name: `${PREFIX} ${k}`, default_duration_minutes: 45, color: "#38BDF8" })
        .select("id")
        .single();
      if (error) throw error;
      lessonTypes[k] = data.id;
    }
    for (const k of ["teacher", "teacher2", "teacherInactive"] as const) {
      const { data, error } = await service.from("teachers").select("id").eq("profile_id", users![k].id).single();
      if (error) throw error;
      teacherIds[k] = data.id;
    }
    // teacher teaches a + c, teacher2 teaches b, the inactive teacher teaches a.
    const { error } = await service.from("teacher_skills").insert([
      { teacher_id: teacherIds.teacher, lesson_type_id: lessonTypes.a },
      { teacher_id: teacherIds.teacher, lesson_type_id: lessonTypes.c },
      { teacher_id: teacherIds.teacher2, lesson_type_id: lessonTypes.b },
      { teacher_id: teacherIds.teacherInactive, lesson_type_id: lessonTypes.a },
    ]);
    if (error) throw error;
  });

  afterAll(async () => {
    if (!service) return;
    await service.from("students").delete().like("full_name", `${PREFIX}%`);
    const ids = Object.values(lessonTypes).filter(Boolean);
    await service.from("teacher_skills").delete().in("lesson_type_id", ids);
    await service.from("lesson_types").delete().in("id", ids);
  });

  describe("admin", () => {
    it("creates a student with contact details", async () => {
      const { data, error } = await saveStudent(admin, `${PREFIX} תלמיד`);
      expect(error).toBeNull();
      studentId = data!;
      const other = await saveStudent(admin, `${PREFIX} תלמיד אחר`);
      otherStudentId = other.data!;

      const { data: contacts } = await admin.from("student_contacts").select("email, parent_name").eq("student_id", studentId).single();
      expect(contacts).toEqual({ email: "student@example.test", parent_name: "הורה בדיקה" });
    });

    it("rejects a birth date in the future", async () => {
      const { error } = await admin.rpc("save_student", {
        p_id: null as unknown as string,
        p_full_name: `${PREFIX} עתידי`,
        p_birth_date: daysFromToday(5),
        p_phone: "",
        p_email: "",
        p_parent_name: "",
        p_parent_phone: "",
        p_parent_email: "",
      });
      expect(error?.message).toBe("birth_date_future");
    });

    it("enrolls a student in two subjects with different teachers and separate professional info", async () => {
      const a = await saveSubject(admin, { student: studentId, lessonType: lessonTypes.a, teacherId: teacherIds.teacher, level: "beginner" });
      expect(a.error).toBeNull();
      subjectA = a.data!;
      const b = await saveSubject(admin, { student: studentId, lessonType: lessonTypes.b, teacherId: teacherIds.teacher2, level: "advanced" });
      expect(b.error).toBeNull();
      subjectB = b.data!;

      const { data } = await admin.from("student_subjects").select("id, level, regular_teacher_id").eq("student_id", studentId);
      expect(data).toHaveLength(2);
      expect(data!.find((s) => s.id === subjectB)?.level).toBe("advanced");
    });

    it("rejects a teacher who does not teach the subject", async () => {
      const { error } = await saveSubject(admin, { student: otherStudentId, lessonType: lessonTypes.b, teacherId: teacherIds.teacher });
      expect(error?.message).toBe("teacher_not_qualified");
    });

    it("rejects an inactive teacher as a new regular teacher", async () => {
      const { error } = await saveSubject(admin, { student: otherStudentId, lessonType: lessonTypes.a, teacherId: teacherIds.teacherInactive });
      expect(error?.message).toBe("teacher_inactive");
    });

    it("rejects enrolling twice in the same subject", async () => {
      const { error } = await saveSubject(admin, { student: studentId, lessonType: lessonTypes.a, teacherId: teacherIds.teacher });
      expect(error?.message).toBe("subject_taken");
    });

    it("requires an explicit notify/auto choice with a return date", async () => {
      const withoutMode = await admin.rpc("set_student_status", {
        p_id: otherStudentId,
        p_status: "inactive",
        p_return_date: daysFromToday(30),
        p_return_mode: null as unknown as "notify",
      });
      expect(withoutMode.error?.message).toBe("return_mode_required");

      const past = await admin.rpc("set_student_status", {
        p_id: otherStudentId,
        p_status: "inactive",
        p_return_date: daysFromToday(-3),
        p_return_mode: "notify",
      });
      expect(past.error?.message).toBe("return_date_past");

      const ok = await admin.rpc("set_student_status", {
        p_id: otherStudentId,
        p_status: "inactive",
        p_return_date: daysFromToday(30),
        p_return_mode: "auto",
      });
      expect(ok.error).toBeNull();
      const { data } = await admin.from("students").select("status, return_mode").eq("id", otherStudentId).single();
      expect(data).toEqual({ status: "inactive", return_mode: "auto" });
    });

    it("the database itself rejects a return date without a choice", async () => {
      const { error } = await service
        .from("students")
        .update({ expected_return_date: daysFromToday(30), return_mode: null })
        .eq("id", otherStudentId);
      expect(error?.code).toBe("23514");
    });

    it("making a student active clears the return date", async () => {
      const { error } = await admin.rpc("set_student_status", {
        p_id: otherStudentId,
        p_status: "active",
        p_return_date: null as unknown as string,
        p_return_mode: null as unknown as "notify",
      });
      expect(error).toBeNull();
      const { data } = await admin.from("students").select("status, expected_return_date, return_mode").eq("id", otherStudentId).single();
      expect(data).toEqual({ status: "active", expected_return_date: null, return_mode: null });
    });

    it("cannot remove a subject from a teacher who teaches it to a student", async () => {
      const { data: t } = await admin.from("teachers").select("full_name, email, phone").eq("id", teacherIds.teacher).single();
      const { error } = await admin.rpc("save_teacher", {
        p_id: teacherIds.teacher,
        p_full_name: t!.full_name,
        p_email: t!.email,
        p_phone: t!.phone ?? "",
        p_lesson_type_ids: [lessonTypes.c],
      });
      expect(error?.message).toBe("skill_in_use");
    });

    it("cannot delete a lesson type students are enrolled in", async () => {
      await service.from("teacher_skills").delete().eq("lesson_type_id", lessonTypes.b);
      const { error } = await admin.from("lesson_types").delete().eq("id", lessonTypes.b);
      expect(error?.code).toBe("23503");
      await service.from("teacher_skills").insert({ teacher_id: teacherIds.teacher2, lesson_type_id: lessonTypes.b });
    });
  });

  describe("teacher", () => {
    it("sees only their own students, with all their subjects", async () => {
      const { data: students } = await teacher.from("students").select("id").like("full_name", `${PREFIX}%`);
      expect(students?.map((s) => s.id)).toEqual([studentId]);

      const { data: subjects } = await teacher.from("student_subjects").select("id").eq("student_id", studentId);
      expect(subjects?.map((s) => s.id).sort()).toEqual([subjectA, subjectB].sort());
    });

    it("cannot read any contact details", async () => {
      const { data } = await teacher.from("student_contacts").select("*");
      expect(data).toEqual([]);
    });

    it("cannot read a student who is not theirs", async () => {
      const { data } = await teacher.from("students").select("id").eq("id", otherStudentId);
      expect(data).toEqual([]);
      const { data: subjects } = await teacher.from("student_subjects").select("id").eq("student_id", otherStudentId);
      expect(subjects).toEqual([]);
    });

    it("updates professional info only in the subject they teach", async () => {
      const own = await teacher.rpc("update_professional_info", { p_id: subjectA, p_level: "intermediate", p_background: "התקדם יפה" });
      expect(own.error).toBeNull();
      const other = await teacher.rpc("update_professional_info", { p_id: subjectB, p_level: "beginner", p_background: "" });
      expect(other.error?.message).toBe("not_allowed");

      const { data } = await admin.from("student_subjects").select("level").eq("id", subjectB).single();
      expect(data?.level).toBe("advanced");
    });

    it("cannot call admin student actions", async () => {
      expect((await saveStudent(teacher, `${PREFIX} מורה יוצר`)).error?.message).toBe("not_allowed");
      expect((await saveStudent(teacher, `${PREFIX} שינוי`, studentId)).error?.message).toBe("not_allowed");
      expect(
        (await saveSubject(teacher, { id: subjectA, student: studentId, lessonType: lessonTypes.a, teacherId: teacherIds.teacher })).error?.message,
      ).toBe("not_allowed");
      expect((await teacher.rpc("remove_student_subject", { p_id: subjectB })).error?.message).toBe("not_allowed");
      expect(
        (
          await teacher.rpc("set_student_status", {
            p_id: studentId,
            p_status: "inactive",
            p_return_date: null as unknown as string,
            p_return_mode: null as unknown as "notify",
          })
        ).error?.message,
      ).toBe("not_allowed");
    });

    it("cannot write the student tables directly", async () => {
      const update = await teacher.from("student_subjects").update({ level: "advanced" }).eq("id", subjectB).select();
      expect(update.error ?? update.data).toBeTruthy();
      expect(update.data ?? []).toEqual([]);
      const insert = await teacher.from("students").insert({ full_name: `${PREFIX} ישיר`, birth_date: "2010-01-01" });
      expect(insert.error).not.toBeNull();
      const contacts = await teacher.from("student_contacts").update({ phone: "1" }).eq("student_id", studentId).select();
      expect(contacts.data ?? []).toEqual([]);
    });

    it("can read the other teacher's name but not their contact details", async () => {
      const { data } = await teacher.rpc("list_teacher_names");
      const row = data?.find((t) => t.id === teacherIds.teacher2);
      expect(row).toEqual({ id: teacherIds.teacher2, full_name: expect.any(String) });
      const { data: teachers } = await teacher.from("teachers").select("id").eq("id", teacherIds.teacher2);
      expect(teachers).toEqual([]);
    });

    it("the second teacher sees the same student but cannot edit the first teacher's subject", async () => {
      const { data } = await teacher2.from("students").select("id").eq("id", studentId);
      expect(data).toHaveLength(1);
      const { error } = await teacher2.rpc("update_professional_info", { p_id: subjectA, p_level: "advanced", p_background: "" });
      expect(error?.message).toBe("not_allowed");
    });
  });

  describe("inactive teacher and anonymous", () => {
    it("an inactive teacher sees no students and cannot edit", async () => {
      // Existing enrollments stay when a teacher becomes inactive.
      const { data: inserted } = await service
        .from("student_subjects")
        .insert({ student_id: otherStudentId, lesson_type_id: lessonTypes.a, regular_teacher_id: teacherIds.teacherInactive, level: "beginner" })
        .select("id")
        .single();
      const { data } = await teacherInactive.from("students").select("id").like("full_name", `${PREFIX}%`);
      expect(data).toEqual([]);
      const { error } = await teacherInactive.rpc("update_professional_info", { p_id: inserted!.id, p_level: "advanced", p_background: "" });
      expect(error?.message).toBe("not_allowed");
    });

    it("an admin may keep an inactive teacher on an existing enrollment", async () => {
      const { data: row } = await admin
        .from("student_subjects")
        .select("id")
        .eq("student_id", otherStudentId)
        .eq("lesson_type_id", lessonTypes.a)
        .single();
      const { error } = await saveSubject(admin, {
        id: row!.id,
        student: otherStudentId,
        lessonType: lessonTypes.a,
        teacherId: teacherIds.teacherInactive,
        level: "intermediate",
      });
      expect(error).toBeNull();
    });

    it("anonymous users cannot read students", async () => {
      for (const table of ["students", "student_contacts", "student_subjects"] as const) {
        const { data, error } = await anon.from(table).select("*").limit(1);
        expect(error ?? data?.length === 0).toBeTruthy();
      }
    });
  });
});
