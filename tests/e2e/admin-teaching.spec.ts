import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";
import { login } from "./session";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const RUN = `e2e-admin-teaching-${Date.now()}`;
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

async function choose(page: Page, scope: Page | Locator, label: string, option: string | RegExp) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

function lessonDate(projectName: string) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21 + 7 * Math.max(FULL_FLOW_PROJECTS.indexOf(projectName), 0));
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

let lessonTypeId = "";
let savedHours: Record<string, unknown>[] = [];
const studentIds: string[] = [];

async function removeTeachingRow() {
  const db = service();
  const { data: rows } = await db.from("teachers").select("id").eq("profile_id", users!.admin.id);
  const ids = (rows ?? []).map((r) => r.id);
  if (!ids.length) return;
  await db.from("lessons").delete().in("teacher_id", ids);
  await db.from("lesson_series").delete().in("teacher_id", ids);
  await db.from("exception_booking_requests").delete().in("teacher_id", ids);
  await db.from("student_subjects").delete().in("regular_teacher_id", ids);
  await db.from("teacher_availability").delete().in("teacher_id", ids);
  await db.from("teacher_skills").delete().in("teacher_id", ids);
  await db.from("teachers").delete().in("id", ids);
}

test.describe("an admin who also teaches", () => {
  test.beforeAll(async () => {
    if (!users) return;
    const db = service();
    await removeTeachingRow();
    const { data: lt } = await db.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single();
    lessonTypeId = lt!.id;
    const { data: hours } = await db.from("operating_hours").select("day_of_week, open_time, close_time, updated_by");
    savedHours = hours ?? [];
    await db.from("operating_hours").delete().gte("day_of_week", 0);
    await db
      .from("operating_hours")
      .insert([0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, open_time: "08:00", close_time: "20:00" })));
  });

  test.afterAll(async () => {
    if (!users) return;
    const db = service();
    await removeTeachingRow();
    if (studentIds.length) {
      await db.from("lessons").delete().in("student_id", studentIds);
      await db.from("exception_booking_requests").delete().in("student_id", studentIds);
      await db.from("student_subjects").delete().in("student_id", studentIds);
      await db.from("students").delete().in("id", studentIds);
    }
    await db.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await db.from("operating_hours").insert(savedHours);
  });

  test.beforeEach(async ({}, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
    await removeTeachingRow();
  });

  async function enrolledStudent(name: string, teacherId: string) {
    const db = service();
    const { data: s } = await db.from("students").insert({ full_name: name, birth_date: "2010-05-05" }).select("id").single();
    studentIds.push(s!.id);
    await db
      .from("student_subjects")
      .insert({ student_id: s!.id, lesson_type_id: lessonTypeId, regular_teacher_id: teacherId, level: "beginner" });
    return s!.id;
  }

  async function turnOn(page: Page) {
    await page.goto("/profile");
    await page.getByRole("checkbox", { name: TEST_LESSON_TYPE, exact: true }).check();
    await page.getByRole("button", { name: "הפעלת הוראה" }).click();
    await expect(page.getByText("ההוראה פעילה")).toBeVisible({ timeout: 20_000 });
    const { data } = await service().from("teachers").select("id").eq("profile_id", users!.admin.id).single();
    return data!.id as string;
  }

  test("turning teaching on from the profile opens the teaching screen, and stopping keeps the account", async ({ page }) => {
    await login(page, users!.admin);
    await page.goto("/admin/my-teaching");
    await expect(page).toHaveURL(/\/profile/);

    const teacherId = await turnOn(page);
    await page.goto("/admin/my-teaching");
    await expect(page.getByRole("heading", { name: "ההוראה שלי", level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Availability is added here, and takes effect at once.
    await page.getByRole("button", { name: "הוספת טווח שעות" }).click();
    const dialog = page.getByRole("dialog");
    await choose(page, dialog, "יום", /^שלישי/);
    await choose(page, dialog, "משעה", "09:00");
    await choose(page, dialog, "עד שעה", "12:00");
    await dialog.getByRole("button", { name: "הוספה" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole("listitem").filter({ hasText: "09:00–12:00" }).last()).toContainText("פעיל");

    // In the teachers list, with the admin label and without deletion.
    await page.goto("/admin/teachers");
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: /.+/ }) }).filter({ hasText: "גם מנהל/ת" });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("button", { name: "מחיקה" })).toHaveCount(0);
    await page.goto(`/admin/teachers/${teacherId}`);
    await expect(page.getByRole("button", { name: "מחיקת מורה" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "הפוך ללא פעיל" })).toHaveCount(0);

    // Stopping: the admin keeps working, and the screen goes away.
    await page.goto("/profile");
    await page.getByRole("button", { name: "הפסקת הוראה" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "הפסק הוראה" }).click();
    await expect(page.getByText("ההוראה פעילה")).toHaveCount(0, { timeout: 20_000 });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "סקירה כללית" })).toBeVisible();
    await page.goto("/admin/my-teaching");
    await expect(page).toHaveURL(/\/profile/);
  });

  test("their own booking outside availability is set at once; another admin's waits for their answer", async ({ page, browser }, testInfo) => {
    // A long flow with two signed-in admins, over the internet to Development.
    test.setTimeout(120_000);
    await login(page, users!.admin);
    const teacherId = await turnOn(page);
    const db = service();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    await db
      .from("teacher_availability")
      .insert([0, 1, 2, 3, 4, 5, 6].map((d) => ({ teacher_id: teacherId, day_of_week: d, start_time: "09:00", end_time: "12:00", valid_from: today })));

    const date = lessonDate(testInfo.project.name);
    const own = `${RUN}-${testInfo.project.name} שלי`;
    await enrolledStudent(own, teacherId);

    await page.goto("/admin/calendar");
    await page.getByRole("button", { name: "שיעור חדש" }).click();
    let dialog = page.getByRole("dialog");
    await choose(page, dialog, "תלמיד", own);
    await dialog.getByLabel("תאריך", { exact: true }).fill(date);
    await expect(dialog.getByText("זה שיבוץ שלך: מועד מחוץ לזמינות שלך ייקבע מיד.")).toBeVisible();
    await choose(page, dialog, "שעת התחלה", "14:00");
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText("השיעור נקבע.")).toBeVisible();
    await dialog.getByRole("button", { name: "סיום" }).click();

    // A reminder can be set on their own lesson, and the lesson opens from the filtered calendar.
    await page.goto(`/admin/calendar?view=day&date=${date}&teacher=${teacherId}`);
    await page.getByRole("button", { name: new RegExp(own) }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "תזכורת לשיעור" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "בקשת שינוי או ביטול" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Another admin asks for a time outside this admin's availability.
    const other = `${RUN}-${testInfo.project.name} אחר`;
    await enrolledStudent(other, teacherId);
    const admin2 = await asUser(browser, testInfo, users!.admin2);
    await admin2.goto("/admin/calendar");
    await admin2.getByRole("button", { name: "שיעור חדש" }).click();
    const dialog2 = admin2.getByRole("dialog");
    await choose(admin2, dialog2, "תלמיד", other);
    await dialog2.getByLabel("תאריך", { exact: true }).fill(date);
    await choose(admin2, dialog2, "שעת התחלה", "16:00");
    await dialog2.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog2.getByText("נשלחה למורה בקשת אישור")).toBeVisible();
    await admin2.context().close();

    await page.goto("/admin/my-teaching");
    const requestRow = page.getByRole("row").filter({ hasText: other });
    await requestRow.getByRole("button", { name: "אישור" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "אישור" }).click();
    await expect(page.getByRole("row").filter({ hasText: other })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("ממתינות לתשובתי (0)")).toBeVisible();

    const { data: lesson } = await db.from("lessons").select("status").eq("teacher_id", teacherId).eq("status", "scheduled");
    expect(lesson?.length).toBe(2);
  });

  test("a teaching admin sets reminders; an admin who does not teach has no such option", async ({ page }) => {
    await login(page, users!.admin);
    await page.goto("/profile?tab=preferences");
    await expect(page.getByRole("heading", { name: "תזכורות לשיעורים" })).toHaveCount(0);

    await turnOn(page);
    await page.goto("/profile?tab=preferences");
    await expect(page.getByRole("heading", { name: "תזכורות לשיעורים" })).toBeVisible();
    await page.getByRole("checkbox", { name: "לשלוח לי תזכורות לפני שיעורים" }).check();
    await page.getByRole("checkbox", { name: "שעה לפני" }).check();
    await page.getByRole("button", { name: "שמירה" }).last().click();
    await expect(page.getByText("העדפות התזכורות נשמרו.")).toBeVisible();
  });

  test("the super admin turns teaching on for another admin from the users screen", async ({ page }) => {
    await login(page, users!.superAdmin);
    await page.goto("/admin/users");
    const row = page.getByRole("row").filter({ hasText: users!.admin.email });
    await row.getByRole("button", { name: "הפעלת הוראה" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: TEST_LESSON_TYPE, exact: true }).check();
    await dialog.getByRole("button", { name: "הפעלת הוראה" }).click();
    await expect(row.getByText("גם מלמד/ת")).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "הפסקת הוראה" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "הפסק הוראה" }).click();
    await expect(row.getByText("גם מלמד/ת")).toHaveCount(0, { timeout: 20_000 });
  });

  test("a regular admin has no teaching controls for other admins", async ({ page }) => {
    await login(page, users!.admin2);
    await page.goto("/admin/users");
    await expect(page.getByRole("button", { name: "הפעלת הוראה" })).toHaveCount(0);
  });
});
