import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const RUN = `e2e-lessons-${Date.now()}`;
const TEST_LESSON_TYPE = "תחום בדיקה";
const FULL_FLOW_PROJECTS = ["desktop", "mobile"];

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function login(page: Page, user: TestUser) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(user.email);
  await page.getByLabel("סיסמה", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function asUser(browser: Browser, testInfo: TestInfo, user: TestUser) {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId });
  const page = await context.newPage();
  await login(page, user);
  return page;
}

async function choose(page: Page, scope: Page | Locator, label: string, option: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

// A Tuesday a few weeks ahead; each device project gets its own week so runs do not collide.
function lessonDate(projectName: string) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14 + 7 * Math.max(FULL_FLOW_PROJECTS.indexOf(projectName), 0));
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

let teacherId = "";
let lessonTypeId = "";
let savedHours: Record<string, unknown>[] = [];
const studentIds: string[] = [];

test.describe("lessons and calendar", () => {
  test.beforeAll(async () => {
    if (!users) return;
    const db = service();
    const { data: t } = await db.from("teachers").select("id").eq("profile_id", users.teacher.id).single();
    teacherId = t!.id;
    const { data: lt } = await db.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single();
    lessonTypeId = lt!.id;

    const { data: hours } = await db.from("operating_hours").select("day_of_week, open_time, close_time, updated_by");
    savedHours = hours ?? [];
    await db.from("operating_hours").delete().gte("day_of_week", 0);
    await db
      .from("operating_hours")
      .insert([0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, open_time: "08:00", close_time: "20:00" })));

    await db.from("teacher_availability").delete().eq("teacher_id", teacherId);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    await db
      .from("teacher_availability")
      .insert([0, 1, 2, 3, 4, 5, 6].map((d) => ({ teacher_id: teacherId, day_of_week: d, start_time: "09:00", end_time: "18:00", valid_from: today })));
  });

  test.afterAll(async () => {
    if (!users) return;
    const db = service();
    if (studentIds.length) {
      await db.from("lessons").delete().in("student_id", studentIds);
      await db.from("lesson_series").delete().in("student_id", studentIds);
      await db.from("exception_booking_requests").delete().in("student_id", studentIds);
      await db.from("student_subjects").delete().in("student_id", studentIds);
      await db.from("students").delete().in("id", studentIds);
    }
    await db.from("teacher_availability").delete().eq("teacher_id", teacherId);
    const { data: types } = await db.from("lesson_types").select("id").like("name", `${RUN}%`);
    const typeIds = (types ?? []).map((t) => t.id);
    if (typeIds.length) {
      await db.from("teacher_skills").delete().in("lesson_type_id", typeIds);
      await db.from("lesson_types").delete().in("id", typeIds);
    }
    await db.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await db.from("operating_hours").insert(savedHours);
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
  });

  // An active student enrolled in the test subject with the test teacher.
  async function newStudent(name: string) {
    const db = service();
    const { data: s } = await db.from("students").insert({ full_name: name, birth_date: "2010-05-05" }).select("id").single();
    studentIds.push(s!.id);
    await db
      .from("student_subjects")
      .insert({ student_id: s!.id, lesson_type_id: lessonTypeId, regular_teacher_id: teacherId, level: "beginner" });
    return s!.id;
  }

  async function openNewLesson(page: Page) {
    await page.goto("/admin/calendar");
    await page.getByRole("button", { name: "שיעור חדש" }).click();
    return page.getByRole("dialog");
  }

  test("admin books a Zoom lesson; it shows in both calendars and overlaps are refused", async ({ page, browser }, testInfo) => {
    const student = `${RUN}-${testInfo.project.name} תלמיד א`;
    await newStudent(student);
    const date = lessonDate(testInfo.project.name);
    await login(page, users!.admin);

    let dialog = await openNewLesson(page);
    await choose(page, dialog, "תלמיד", student);
    await expect(dialog.getByRole("combobox", { name: "מורה", exact: true })).toContainText("מורה בדיקה");
    await expect(dialog.getByLabel("משך (דקות)")).toHaveValue("45");
    await dialog.getByLabel("תאריך", { exact: true }).fill(date);
    await choose(page, dialog, "שעת התחלה", "10:00");
    await dialog.getByLabel("בזום").check();
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText("השיעור נקבע.")).toBeVisible();
    await dialog.getByRole("button", { name: "סיום" }).click();

    await page.goto(`/admin/calendar?view=day&date=${date}`);
    const block = page.getByRole("button", { name: new RegExp(`${student}.*בזום`) });
    await expect(block).toBeVisible();
    await block.click();
    await expect(page.getByRole("dialog")).toContainText("בזום");
    await expect(page.getByRole("dialog")).toContainText("שיעור בודד");
    await page.keyboard.press("Escape");

    // The same time again: refused with a clear message.
    dialog = await openNewLesson(page);
    await choose(page, dialog, "תלמיד", student);
    await dialog.getByLabel("תאריך", { exact: true }).fill(date);
    await choose(page, dialog, "שעת התחלה", "10:15");
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByRole("alert").first()).toContainText("כבר משובץ");
    await page.keyboard.press("Escape");

    // The teacher sees it in their own calendar (day view too).
    const teacherPage = await asUser(browser, testInfo, users!.teacher);
    await teacherPage.goto(`/teacher/calendar?view=day&date=${date}`);
    await expect(teacherPage.getByRole("button", { name: new RegExp(`${student}.*בזום`) })).toBeVisible();
    await teacherPage.context().close();
  });

  test("admin creates a weekly series after checking its dates", async ({ page }, testInfo) => {
    const student = `${RUN}-${testInfo.project.name} תלמיד ב`;
    await newStudent(student);
    const date = lessonDate(testInfo.project.name);
    await login(page, users!.admin);

    const dialog = await openNewLesson(page);
    await dialog.getByRole("radio", { name: "סדרת שיעורים" }).click();
    await choose(page, dialog, "תלמיד", student);
    await dialog.getByLabel("תאריך התחלה").fill(date);
    await choose(page, dialog, "יום — מפגש 1", "שלישי");
    await choose(page, dialog, "שעה — מפגש 1", "12:00");
    await dialog.getByRole("button", { name: "בדיקת מועדים" }).click();
    await expect(dialog.getByText(/ייווצרו \d+ מפגשים/)).toBeVisible();
    await dialog.getByRole("button", { name: "יצירת הסדרה" }).click();
    await expect(dialog.getByText(/הסדרה נוצרה עם \d+ מפגשים/)).toBeVisible();
    await dialog.getByRole("button", { name: "סיום" }).click();
    await expect(dialog).toBeHidden();

    // A week later the series continues.
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    await page.goto(`/admin/calendar?view=day&date=${next.toISOString().slice(0, 10)}`);
    await expect(page.getByRole("button", { name: new RegExp(student) })).toBeVisible();
  });

  test("outside the teacher's availability: a request the teacher approves; the admin calendar updates live", async ({ page, browser }, testInfo) => {
    const student = `${RUN}-${testInfo.project.name} תלמיד ג`;
    await newStudent(student);
    const date = lessonDate(testInfo.project.name);
    await login(page, users!.admin);

    const dialog = await openNewLesson(page);
    await choose(page, dialog, "תלמיד", student);
    await dialog.getByLabel("תאריך", { exact: true }).fill(date);
    await choose(page, dialog, "שעת התחלה", "18:30");
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText("נשלחה למורה בקשת אישור")).toBeVisible();
    await dialog.getByRole("button", { name: "סיום" }).click();

    // No lesson yet: the request holds no time.
    await page.goto(`/admin/calendar?view=day&date=${date}`);
    await expect(page.getByRole("button", { name: new RegExp(student) })).toHaveCount(0);

    const teacherPage = await asUser(browser, testInfo, users!.teacher);
    await teacherPage.goto("/teacher/requests");
    const row = teacherPage.getByRole("row").filter({ hasText: student });
    await row.getByRole("button", { name: "אישור" }).click();
    await teacherPage.getByRole("dialog").getByRole("button", { name: "אישור" }).click();
    await expect(teacherPage.getByRole("row").filter({ hasText: student })).toContainText("אושר");

    // The admin's open calendar shows the lesson without a reload.
    await expect(page.getByRole("button", { name: new RegExp(student) })).toBeVisible({ timeout: 15_000 });
    await teacherPage.context().close();
  });

  test("password fields have a show/hide button", async ({ page }) => {
    await page.goto("/login");
    const input = page.getByLabel("סיסמה", { exact: true });
    await input.fill("secret-123");
    await expect(input).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "הצגת הסיסמה" }).click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "הצגת הסיסמה" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a new lesson type can be added from the teacher dialog, and removed from all teachers when deleted", async ({ page }, testInfo) => {
    const name = `${RUN}-${testInfo.project.name} כינור`;
    await login(page, users!.admin);
    await page.goto("/admin/teachers");
    await page.getByRole("button", { name: "מורה חדש" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "הוספת תחום חדש" }).click();
    await dialog.getByLabel("שם התחום").fill(name);
    await dialog.getByLabel("משך שיעור (דקות)").fill("30");
    await dialog.getByRole("button", { name: "הוספת התחום" }).click();
    await expect(dialog.getByLabel(name)).toBeChecked({ timeout: 15_000 });
    await page.keyboard.press("Escape");

    // Assign it to the test teacher, then delete it with explicit confirmation.
    const db = service();
    const { data: lt } = await db.from("lesson_types").select("id").eq("name", name).single();
    await db.from("teacher_skills").insert({ teacher_id: teacherId, lesson_type_id: lt!.id });
    await page.goto("/admin/settings/lesson-types");
    await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: "מחיקה" }).click();
    const del = page.getByRole("dialog");
    await expect(del.getByRole("listitem").filter({ hasText: "מורה בדיקה" })).toBeVisible();
    await del.getByLabel("הסרת התחום מכל המורים ומחיקתו").check();
    await del.getByRole("button", { name: "מחיקה" }).click();
    // Rows are hidden from the accessibility tree while the dialog is open, so wait for it to close.
    await expect(del).toBeHidden();
    await expect(page.getByText(name)).toHaveCount(0);
    const { count } = await db.from("teacher_skills").select("*", { count: "exact", head: true }).eq("lesson_type_id", lt!.id);
    expect(count).toBe(0);
  });
});
