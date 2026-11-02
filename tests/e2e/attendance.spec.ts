import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";
import { login } from "./session";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const RUN = `e2e-att-${Date.now()}`;
const TEST_LESSON_TYPE = "תחום בדיקה";
const FULL_FLOW_PROJECTS = ["desktop", "mobile"];

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function asUser(browser: Browser, testInfo: TestInfo, user: TestUser) {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId });
  const page = await context.newPage();
  await login(page, user);
  return page;
}

// A school-local date in the last 30 days; each device project and test gets its own day.
function pastDay(projectName: string, testNumber: number) {
  const offset = 2 + 8 * Math.max(FULL_FLOW_PROJECTS.indexOf(projectName), 0) + testNumber;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() - offset * 86_400_000));
}

function localToUtc(date: string, time: string) {
  for (const offset of ["+02:00", "+03:00"]) {
    const instant = new Date(`${date}T${time}:00${offset}`);
    const shown = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(instant);
    if (shown === time) return instant;
  }
  throw new Error("bad time");
}

let teacherId = "";
let lessonTypeId = "";
const studentIds: string[] = [];

test.describe("attendance", () => {
  test.beforeAll(async () => {
    if (!users) return;
    const db = service();
    const { data: t } = await db.from("teachers").select("id").eq("profile_id", users.teacher.id).single();
    teacherId = t!.id;
    const { data: lt } = await db.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single();
    lessonTypeId = lt!.id;
  });

  test.afterAll(async () => {
    if (!users || !studentIds.length) return;
    const db = service();
    const { data: lessons } = await db.from("lessons").select("id").in("student_id", studentIds);
    await db.from("audit_events").delete().in("entity_id", (lessons ?? []).map((l) => l.id));
    await db.from("lessons").delete().in("student_id", studentIds);
    await db.from("student_subjects").delete().in("student_id", studentIds);
    await db.from("students").delete().in("id", studentIds);
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
  });

  async function newStudent(name: string) {
    const db = service();
    const { data: s } = await db.from("students").insert({ full_name: name, birth_date: "2010-05-05" }).select("id").single();
    studentIds.push(s!.id);
    await db.from("student_subjects").insert({ student_id: s!.id, lesson_type_id: lessonTypeId, regular_teacher_id: teacherId, level: "beginner" });
    return s!.id;
  }

  async function newLesson(student: string, date: string, start: string) {
    const startAt = localToUtc(date, start);
    const { data } = await service()
      .from("lessons")
      .insert({
        occurrence_date: date, student_id: student, lesson_type_id: lessonTypeId, teacher_id: teacherId,
        start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 45 * 60000).toISOString(), location: "school",
      })
      .select("id")
      .single();
    return data!.id;
  }

  const block = (page: Page, student: string) => page.getByRole("button", { name: new RegExp(student) });

  test("a teacher reports attendance; the admin corrects it and sees the history", async ({ page, browser }, testInfo) => {
    test.setTimeout(90_000);
    const name = `${RUN}-${testInfo.project.name} תלמיד א`;
    const date = pastDay(testInfo.project.name, 0);
    const lessonId = await newLesson(await newStudent(name), date, "10:00");

    const teacherPage = await asUser(browser, testInfo, users!.teacher);
    await teacherPage.goto(`/teacher/calendar?view=day&date=${date}`);
    await block(teacherPage, name).click();
    await teacherPage.getByRole("button", { name: "דיווח נוכחות" }).click();
    const dialog = teacherPage.getByRole("dialog").last();
    await dialog.getByRole("radio", { name: "התקיים" }).check();
    await dialog.getByLabel("הערה (לא חובה)").fill("שיעור טוב");
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(teacherPage.getByRole("dialog").getByText("שיעור טוב")).toBeVisible({ timeout: 15_000 });
    await teacherPage.context().close();

    await login(page, users!.admin);
    await page.goto(`/admin/calendar?view=day&date=${date}`);
    await block(page, name).click();
    await page.getByRole("button", { name: "תיקון נוכחות" }).click();
    const fix = page.getByRole("dialog").last();
    await fix.getByRole("radio", { name: "התלמיד לא הגיע" }).check();
    await fix.getByRole("button", { name: "שמירה" }).click();

    const details = page.getByRole("dialog").first();
    await expect(details.getByText("התלמיד לא הגיע").first()).toBeVisible();
    await expect(details.getByText("דווחה נוכחות: התקיים")).toBeVisible({ timeout: 15_000 });
    await expect(details.getByText("הנוכחות תוקנה: התקיים ← התלמיד לא הגיע")).toBeVisible({ timeout: 15_000 });

    // The activity page lists both entries.
    await page.goto("/admin/activity?kind=attendance");
    await expect(page.getByText(name).first()).toBeVisible();
    expect(lessonId).toBeTruthy();
  });

  test("cancelling a lesson marked as held asks for confirmation and stops it counting", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const name = `${RUN}-${testInfo.project.name} תלמיד ב`;
    const date = pastDay(testInfo.project.name, 1);
    const lessonId = await newLesson(await newStudent(name), date, "11:00");
    await service().from("attendance").insert({ lesson_id: lessonId, status: "held" });

    await login(page, users!.admin);
    await page.goto(`/admin/calendar?view=day&date=${date}`);
    await block(page, name).click();
    await page.getByRole("button", { name: "ביטול שיעור" }).click();
    const confirm = page.getByRole("dialog").last();
    await expect(confirm.getByText(/סומן כ„התקיים”/)).toBeVisible();
    await confirm.getByRole("button", { name: "בטל שיעור" }).click();

    await expect(page.getByRole("dialog").first().getByText("בוטל בידי מנהל")).toBeVisible();
    const { data } = await service().from("attendance").select("lesson_id").eq("lesson_id", lessonId);
    expect(data ?? []).toEqual([]);
    const { data: log } = await service().from("audit_events").select("action").eq("entity_id", lessonId);
    expect((log ?? []).map((e) => e.action)).toContain("held_lesson_cancelled");
  });

  test("the student's history tab shows attendance by month and lets the teacher report from the home page list", async ({ page, browser }, testInfo) => {
    test.setTimeout(90_000);
    const name = `${RUN}-${testInfo.project.name} תלמיד ג`;
    const date = pastDay(testInfo.project.name, 2);
    const student = await newStudent(name);
    const lessonId = await newLesson(student, date, "12:00");

    // The admin sees "not reported" in the history tab and on the home page.
    await login(page, users!.admin);
    await page.goto(`/admin/students/${student}?tab=history&month=${date.slice(0, 7)}`);
    await expect(page.getByText("לא דווח")).toBeVisible();

    // The teacher reports from the "waiting for a report" card on their home page.
    const teacherPage = await asUser(browser, testInfo, users!.teacher);
    await teacherPage.goto("/teacher");
    const card = teacherPage.getByRole("listitem").filter({ hasText: name });
    await card.getByRole("button", { name: "דיווח נוכחות" }).click();
    const dialog = teacherPage.getByRole("dialog").last();
    await dialog.getByRole("radio", { name: "המורה לא הגיע" }).check();
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(teacherPage.getByRole("listitem").filter({ hasText: name })).toHaveCount(0, { timeout: 15_000 });
    await teacherPage.context().close();

    // The history tab picks it up without a manual refresh.
    await expect(page.getByText("המורה לא הגיע").last()).toBeVisible({ timeout: 15_000 });
    expect(lessonId).toBeTruthy();
  });
});
