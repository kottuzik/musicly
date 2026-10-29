// Creates or refreshes automated-test users in the Development project.
// Credentials are written to tests/.test-users.json (git-ignored) and never printed.
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

type Role = "super_admin" | "admin" | "teacher";
type Status = "active" | "inactive";

const TEST_USERS: { key: string; email: string; fullName: string; role: Role; status: Status }[] = [
  { key: "superAdmin", email: "test-super-admin@example.test", fullName: "מנהל ראשי בדיקה", role: "super_admin", status: "active" },
  { key: "admin", email: "test-admin@example.test", fullName: "מנהל בדיקה", role: "admin", status: "active" },
  { key: "admin2", email: "test-admin2@example.test", fullName: "מנהל בדיקה שני", role: "admin", status: "active" },
  { key: "adminInactive", email: "test-admin-inactive@example.test", fullName: "מנהל לא פעיל", role: "admin", status: "inactive" },
  { key: "teacher", email: "test-teacher@example.test", fullName: "מורה בדיקה", role: "teacher", status: "active" },
  { key: "teacherInactive", email: "test-teacher-inactive@example.test", fullName: "מורה לא פעיל", role: "teacher", status: "inactive" },
  { key: "noProfile", email: "test-no-profile@example.test", fullName: "", role: "teacher", status: "active" },
];

const admin = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserId(email: string): Promise<string | null> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

const TEST_LESSON_TYPE = "תחום בדיקה";

// Teacher records (with one lesson type) for the test teacher accounts, so RLS on teachers can be tested.
async function seedTeacherRecords(output: Record<string, { id: string }>) {
  const { data: existing, error: findError } = await admin
    .from("lesson_types")
    .select("id")
    .eq("name", TEST_LESSON_TYPE)
    .maybeSingle();
  if (findError) throw findError;
  let lessonTypeId = existing?.id;
  if (!lessonTypeId) {
    const { data, error } = await admin
      .from("lesson_types")
      .insert({ name: TEST_LESSON_TYPE, default_duration_minutes: 45, color: "#6B46C1" })
      .select("id")
      .single();
    if (error) throw error;
    lessonTypeId = data.id;
  }

  for (const user of TEST_USERS.filter((u) => u.role === "teacher" && u.key !== "noProfile")) {
    const { data, error } = await admin
      .from("teachers")
      .upsert(
        { profile_id: output[user.key].id, full_name: user.fullName, email: user.email, status: user.status },
        { onConflict: "email" },
      )
      .select("id")
      .single();
    if (error) throw error;
    const { error: skillError } = await admin
      .from("teacher_skills")
      .upsert({ teacher_id: data.id, lesson_type_id: lessonTypeId }, { ignoreDuplicates: true });
    if (skillError) throw skillError;
  }
}

async function main() {
  const output: Record<string, { id: string; email: string; password: string }> = {};

  for (const user of TEST_USERS) {
    const password = randomBytes(18).toString("base64url");
    let id = await findUserId(user.email);
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email: user.email, password, email_confirm: true });
      if (error || !data.user) throw error ?? new Error("createUser failed");
      id = data.user.id;
    }

    // "noProfile" simulates an auth account that was never given a role.
    if (user.key !== "noProfile") {
      const { error } = await admin.from("profiles").upsert({
        id,
        full_name: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      });
      if (error) throw error;
    }

    output[user.key] = { id, email: user.email, password };
  }

  await seedTeacherRecords(output);

  mkdirSync("tests", { recursive: true });
  writeFileSync("tests/.test-users.json", JSON.stringify(output, null, 2));
  console.log(`Seeded ${TEST_USERS.length} test users (credentials saved to tests/.test-users.json).`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
