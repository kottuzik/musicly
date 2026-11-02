import { createClient } from "@supabase/supabase-js";

// Test data is named with an "e2e-<timestamp>" prefix and removed in afterAll. A run that is
// stopped midway never gets there, and its subjects, students and teachers then show up in the
// real screens. Each spec clears what earlier runs left behind (older than an hour, so a run in
// progress is never touched).
export async function removeStaleTestData() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const before = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: students } = await db.from("students").select("id").like("full_name", "e2e-%").lt("created_at", before);
  const studentIds = (students ?? []).map((s) => s.id);
  if (studentIds.length) {
    const { data: lessons } = await db.from("lessons").select("id").in("student_id", studentIds);
    const lessonIds = (lessons ?? []).map((l) => l.id);
    if (lessonIds.length) await db.from("lesson_change_requests").delete().in("lesson_id", lessonIds);
    await db.from("lessons").delete().in("student_id", studentIds);
    await db.from("lesson_series").delete().in("student_id", studentIds);
    await db.from("exception_booking_requests").delete().in("student_id", studentIds);
    await db.from("student_subjects").delete().in("student_id", studentIds);
    await db.from("students").delete().in("id", studentIds);
  }

  const { data: types } = await db.from("lesson_types").select("id").like("name", "e2e-%").lt("created_at", before);
  const typeIds = (types ?? []).map((t) => t.id);
  if (typeIds.length) {
    await db.from("teacher_skills").delete().in("lesson_type_id", typeIds);
    await db.from("lesson_types").delete().in("id", typeIds);
  }

  const { data: teachers } = await db.from("teachers").select("id").like("email", "e2e-%").lt("created_at", before);
  const teacherIds = (teachers ?? []).map((t) => t.id);
  if (teacherIds.length) {
    await db.from("teacher_skills").delete().in("teacher_id", teacherIds);
    await db.from("teachers").delete().in("id", teacherIds);
  }
  await db.from("invitations").delete().like("email", "e2e-%").lt("created_at", before);
  await db.from("school_closures").delete().like("name", "e2e-%").lt("created_at", before);
}
