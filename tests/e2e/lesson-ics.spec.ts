import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestUsers } from "../test-users";
import { login } from "./session";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const FULL_FLOW_PROJECTS = ["desktop", "mobile"];
const RUN = `e2e-ics-${Date.now()}`;
const TEST_LESSON_TYPE = "תחום בדיקה";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let studentId = "";
let activeLessonId = "";
let cancelledLessonId = "";

// A date far ahead, so it never meets other tests' lessons; each device project uses its own day.
function farDate(offset: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 300 + offset);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(async ({}, testInfo) => {
  if (!users || !FULL_FLOW_PROJECTS.includes(testInfo.project.name)) return;
  const db = service();
  // Leftovers from an interrupted earlier run would collide with the same dates.
  const { data: old } = await db.from("students").select("id").like("full_name", "e2e-ics-%");
  const oldIds = (old ?? []).map((o) => o.id);
  if (oldIds.length) {
    await db.from("lessons").delete().in("student_id", oldIds);
    await db.from("student_subjects").delete().in("student_id", oldIds);
    await db.from("students").delete().in("id", oldIds);
  }
  const offset = FULL_FLOW_PROJECTS.indexOf(testInfo.project.name) * 2;
  const { data: t } = await db.from("teachers").select("id").eq("profile_id", users.teacher.id).single();
  const { data: lt } = await db.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single();
  const { data: s } = await db.from("students").insert({ full_name: `${RUN} תלמיד`, birth_date: "2010-05-05" }).select("id").single();
  studentId = s!.id;
  await db
    .from("student_subjects")
    .insert({ student_id: studentId, lesson_type_id: lt!.id, regular_teacher_id: t!.id, level: "beginner" });

  const base = { student_id: studentId, teacher_id: t!.id, lesson_type_id: lt!.id, location: "school" as const, outside_hours: true };
  const day1 = farDate(offset);
  const day2 = farDate(offset + 1);
  const { data: a, error: aError } = await db
    .from("lessons")
    .insert({ ...base, occurrence_date: day1, start_at: `${day1}T10:00:00Z`, end_at: `${day1}T10:45:00Z` })
    .select("id")
    .single();
  if (aError) throw new Error(aError.message);
  activeLessonId = a!.id;
  const { data: c } = await db
    .from("lessons")
    .insert({
      ...base,
      occurrence_date: day2,
      start_at: `${day2}T10:00:00Z`,
      end_at: `${day2}T10:45:00Z`,
      status: "cancelled",
      cancel_source: "admin",
      cancelled_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  cancelledLessonId = c!.id;
});

test.afterAll(async ({}, testInfo) => {
  if (!users || !FULL_FLOW_PROJECTS.includes(testInfo.project.name) || !studentId) return;
  const db = service();
  await db.from("lessons").delete().eq("student_id", studentId);
  await db.from("student_subjects").delete().eq("student_id", studentId);
  await db.from("students").delete().eq("id", studentId);
});

test.describe("add a lesson to the device calendar", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  });

  test("the lesson's teacher downloads a calendar file", async ({ page }) => {
    await login(page, users!.teacher);
    const res = await page.request.get(`/export/lesson/${activeLessonId}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    expect(res.headers()["cache-control"]).toContain("no-store");
    const body = await res.text();
    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain(`${RUN} תלמיד`);
    expect(body).toContain(`UID:lesson-${activeLessonId}@musicly`);
  });

  test("an admin downloads any lesson", async ({ page }) => {
    await login(page, users!.admin);
    const res = await page.request.get(`/export/lesson/${activeLessonId}`);
    expect(res.status()).toBe(200);
  });

  test("another teacher cannot get it", async ({ page }) => {
    await login(page, users!.teacher2);
    const res = await page.request.get(`/export/lesson/${activeLessonId}`);
    expect(res.status()).toBe(404);
  });

  test("not signed in, cancelled and bad ids are refused", async ({ page, request }) => {
    // Signed-out visitors are sent to the login page by the proxy; the file is never served.
    const anonymous = await request.get(`/export/lesson/${activeLessonId}`, { maxRedirects: 0 });
    expect(anonymous.status()).toBe(307);
    expect(anonymous.headers()["location"]).toContain("/login");
    await login(page, users!.admin);
    expect((await page.request.get(`/export/lesson/${cancelledLessonId}`)).status()).toBe(409);
    expect((await page.request.get("/export/lesson/not-an-id")).status()).toBe(404);
    expect((await page.request.get("/export/lesson/00000000-0000-4000-8000-000000000000")).status()).toBe(404);
  });

  test("the lesson panel shows the button only for a live upcoming lesson", async ({ page }) => {
    await login(page, users!.teacher);
    const day = (await service().from("lessons").select("occurrence_date").eq("id", activeLessonId).single()).data!.occurrence_date;
    await page.goto(`/teacher/calendar?view=day&date=${day}`);
    await page.getByRole("button", { name: new RegExp(`${RUN} תלמיד`) }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "הוספה ללוח השנה" })).toBeVisible();
    await expect(dialog).toContainText("הקובץ לא יתעדכן");
  });
});
