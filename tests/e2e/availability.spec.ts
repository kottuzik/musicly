import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const RUN = `e2e-${Date.now()}`;
const RUN_STARTED = new Date().toISOString();

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function login(page: Page, user: TestUser) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(user.email);
  await page.getByLabel("סיסמה").fill(user.password);
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// Another signed-in user in their own browser context, with this project's device settings.
async function asUser(browser: Browser, testInfo: TestInfo, user: TestUser) {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } = testInfo.project.use;
  const context = await browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId });
  const page = await context.newPage();
  await login(page, user);
  return page;
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function choose(page: Page, scope: Page | Locator, label: string, option: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

// Next date (at least a week ahead) on the given weekday, as YYYY-MM-DD.
function nextWeekday(day: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() !== day) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const FULL_FLOW_PROJECTS = ["desktop", "mobile"];
let teacherId = "";
let teacherName = "";
let savedHours: Record<string, unknown>[] = [];

async function cleanTeacherData() {
  const db = service();
  await db.from("availability_requests").delete().eq("teacher_id", teacherId);
  await db.from("teacher_availability").delete().eq("teacher_id", teacherId);
}

test.beforeAll(async ({}, testInfo) => {
  if (!users || !FULL_FLOW_PROJECTS.includes(testInfo.project.name)) return;
  const db = service();
  const { data, error } = await db.from("teachers").select("id, full_name").eq("profile_id", users.teacher.id).single();
  if (error) throw error;
  teacherId = data.id;
  teacherName = data.full_name;
  // Operating hours are school-wide: keep them and restore afterwards.
  savedHours = (await db.from("operating_hours").select("*")).data ?? [];
  await cleanTeacherData();
});

test.afterAll(async ({}, testInfo) => {
  if (!users || !FULL_FLOW_PROJECTS.includes(testInfo.project.name)) return;
  const db = service();
  await cleanTeacherData();
  await db.from("school_closures").delete().like("name", `${RUN}%`);
  await db.from("school_closures").delete().eq("source", "holiday").eq("created_by", users.admin.id).gte("created_at", RUN_STARTED);
  await db.from("operating_hours").delete().gte("day_of_week", 0);
  if (savedHours.length) await db.from("operating_hours").insert(savedHours);
});

test.describe("availability", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
    test.setTimeout(120_000);
  });

  test("hours, teacher availability, live request queue and decisions", async ({ page, browser }, testInfo) => {
    // 1. An admin sets different hours for Sunday and Tuesday; other days closed.
    const admin = await asUser(browser, testInfo, users!.admin);
    await admin.goto("/admin/settings/hours");
    for (const day of ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]) {
      const box = admin.getByRole("checkbox", { name: day });
      if (["ראשון", "שלישי"].includes(day)) await box.check();
      else await box.uncheck();
    }
    await choose(admin, admin, "שעת פתיחה ביום ראשון", "10:00");
    await choose(admin, admin, "שעת סגירה ביום ראשון", "18:00");
    await choose(admin, admin, "שעת פתיחה ביום שלישי", "12:00");
    await choose(admin, admin, "שעת סגירה ביום שלישי", "20:00");
    await admin.getByRole("button", { name: "שמירה" }).click();
    await expect(admin.getByText("שעות הפעילות נשמרו.")).toBeVisible();
    await admin.reload();
    await expect(admin.getByRole("combobox", { name: "שעת סגירה ביום שלישי" })).toHaveText(/20:00/);
    await expect(admin.getByRole("checkbox", { name: "שני" })).not.toBeChecked();
    await expectNoHorizontalScroll(admin);

    // 2. The teacher adds a slot inside the hours: active at once; times outside are not offered.
    await login(page, users!.teacher);
    await page.goto("/teacher/availability");
    await page.getByRole("button", { name: "הוספת טווח שעות" }).click();
    let dialog = page.getByRole("dialog");
    await choose(page, dialog, "יום", "ראשון (10:00–18:00)");
    await dialog.getByRole("combobox", { name: "משעה" }).click();
    await expect(page.getByRole("option", { name: "09:45", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "10:00", exact: true }).click();
    await choose(page, dialog, "עד שעה", "12:00");
    await dialog.getByRole("button", { name: "הוספה" }).click();
    await expect(dialog).toBeHidden();
    const slot = page.getByRole("listitem").filter({ hasText: "10:00–12:00" }).last();
    await expect(slot).toContainText("פעיל");
    await expectNoHorizontalScroll(page);

    // 3. Two admins watch the shared queue; the teacher's request appears for both without reload.
    const admin2 = await asUser(browser, testInfo, users!.admin2);
    await admin.goto("/admin/requests");
    await admin2.goto("/admin/requests");
    await expect(admin.getByText("אין בקשות ממתינות.").or(admin.getByRole("table"))).toBeVisible();

    await slot.getByRole("button", { name: /הסרת הזמינות/ }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("קבועה — החל מתאריך").check();
    await dialog.getByLabel("סיבה (לא חובה)").fill("מעבר לימי שלישי");
    await dialog.getByRole("button", { name: "שליחת בקשה" }).click();
    await expect(dialog).toBeHidden();
    await expect(slot).toContainText("ממתין להסרה");

    for (const p of [admin, admin2]) {
      await expect(p.getByRole("row").filter({ hasText: teacherName }).filter({ hasText: "הסרה קבועה" })).toBeVisible({ timeout: 15_000 });
    }

    // 4. Admin 1 approves; admin 2's queue and the teacher's page update without reload.
    const row = admin.getByRole("row").filter({ hasText: teacherName }).filter({ hasText: "הסרה קבועה" });
    await row.getByRole("button", { name: "אישור" }).click();
    dialog = admin.getByRole("dialog");
    await expect(dialog).toContainText("אין שיעורים מושפעים");
    await dialog.getByRole("button", { name: "אישור" }).click();
    await expect(dialog).toBeHidden();
    await expect(admin2.getByRole("row").filter({ hasText: teacherName }).filter({ hasText: "הסרה קבועה" })).toHaveCount(0, { timeout: 15_000 });
    // Removal from today means the slot disappears; the request shows as approved.
    await expect(page.getByRole("row").filter({ hasText: "הסרה קבועה" })).toContainText("אושרה", { timeout: 15_000 });
    await expect(page.getByText("10:00–12:00", { exact: true })).toHaveCount(0);

    // 5. An absence with hours stays pending until an admin rejects it with a note.
    await page.getByRole("button", { name: "דיווח היעדרות" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("שעות ביום אחד").check();
    await choose(page, dialog, "משעה", "13:00");
    await choose(page, dialog, "עד שעה", "15:00");
    await dialog.getByRole("button", { name: "שליחת בקשה" }).click();
    await expect(dialog).toBeHidden();
    const absence = page.getByRole("row").filter({ hasText: "היעדרות" });
    await expect(absence).toContainText("ממתינה");
    await expect(page.getByText("אין היעדרויות מאושרות.")).toBeVisible();

    const absenceRow = admin2.getByRole("row").filter({ hasText: teacherName }).filter({ hasText: "היעדרות" });
    await absenceRow.getByRole("button", { name: "דחייה" }).click({ timeout: 15_000 });
    dialog = admin2.getByRole("dialog");
    await dialog.getByLabel("הערה למורה (לא חובה)").fill("אין מחליף באותו יום");
    await dialog.getByRole("button", { name: "דחייה" }).click();
    await expect(dialog).toBeHidden();
    await expect(absence).toContainText("נדחתה", { timeout: 15_000 });
    await expect(absence).toContainText("אין מחליף באותו יום");

    // The handled tab keeps the history.
    await admin2.getByRole("link", { name: "טופלו" }).click();
    await expect(admin2.getByRole("row").filter({ hasText: teacherName }).filter({ hasText: "נדחתה" }).first()).toBeVisible();
    await expectNoHorizontalScroll(admin2);

    await admin.context().close();
    await admin2.context().close();
  });

  // Regression: fields kept after a server-side validation error, errors cleared on change,
  // absence hours limited to the day's operating hours (set by the previous test: Sunday 10:00–18:00).
  test("absence dialog keeps values after an error and offers only the day's hours", async ({ page }) => {
    const sunday = nextWeekday(0);
    await login(page, users!.teacher);
    await page.goto("/teacher/availability");
    await page.getByRole("button", { name: "דיווח היעדרות" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByRole("button", { name: "שליחת בקשה" }).click();
    await expect(dialog.getByText("יש לבחור ימים שלמים או שעות")).toBeVisible();
    await dialog.getByLabel("שעות ביום אחד").check();
    await expect(dialog.getByText("יש לבחור ימים שלמים או שעות")).toHaveCount(0);

    await dialog.getByLabel("תאריך", { exact: true }).fill(sunday);
    await dialog.getByRole("combobox", { name: "משעה" }).click();
    await expect(page.getByRole("option", { name: "09:45", exact: true })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "17:45", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "18:00", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "11:00", exact: true }).click();
    await dialog.getByRole("combobox", { name: "עד שעה" }).click();
    await expect(page.getByRole("option", { name: "11:00", exact: true })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "18:00", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await dialog.getByLabel("סיבה (לא חובה)").fill("בדיקת שמירת ערכים");

    // Missing end time: the server rejects; everything chosen so far stays.
    await dialog.getByRole("button", { name: "שליחת בקשה" }).click();
    await expect(dialog.getByText("יש לבחור שעת סיום")).toBeVisible();
    await expect(dialog.getByLabel("שעות ביום אחד")).toBeChecked();
    await expect(dialog.getByLabel("תאריך", { exact: true })).toHaveValue(sunday);
    await expect(dialog.getByRole("combobox", { name: "משעה" })).toHaveText(/11:00/);
    await expect(dialog.getByLabel("סיבה (לא חובה)")).toHaveValue("בדיקת שמירת ערכים");
    await choose(page, dialog, "עד שעה", "12:00");
    await expect(dialog.getByText("יש לבחור שעת סיום")).toHaveCount(0);

    // Whole days with the end before the start: same, and the error goes once the date is fixed.
    await dialog.getByLabel("ימים שלמים").check();
    await dialog.getByLabel("מתאריך").fill(nextWeekday(3));
    await dialog.getByLabel("עד תאריך").fill(nextWeekday(1));
    await dialog.getByRole("button", { name: "שליחת בקשה" }).click();
    const endError = dialog.getByText("תאריך הסיום צריך להיות אחרי תאריך ההתחלה");
    await expect(endError).toBeVisible();
    await expect(dialog.getByLabel("ימים שלמים")).toBeChecked();
    await expect(dialog.getByLabel("מתאריך")).toHaveValue(nextWeekday(3));
    await dialog.getByLabel("עד תאריך").fill(nextWeekday(4));
    await expect(endError).toHaveCount(0);
    await dialog.getByRole("button", { name: "ביטול" }).click();

    // The requests heading sits on a card, not on the decorative background.
    const cardBackground = await page
      .getByRole("heading", { name: "הבקשות שלי" })
      .evaluate((h) => getComputedStyle(h.closest("section")!.parentElement!).backgroundColor);
    expect(cardBackground).toBe("rgb(255, 255, 255)");
    // Regression: the requests table must not widen the page on a phone.
    await expectNoHorizontalScroll(page);
  });

  test("admin picks a holiday and adds a custom closure; the teacher sees it", async ({ page, browser }, testInfo) => {
    const name = `${RUN}-${testInfo.project.name} יום ספורט`;
    await login(page, users!.admin);
    await page.goto("/admin/settings/closures");

    // Holidays are suggestions; picking one makes it a closure day.
    const holidays = page.getByRole("region", { name: "חגים בשנה הקרובה" }).or(page.locator("section").filter({ hasText: "חגים בשנה הקרובה" }));
    const candidate = holidays.getByRole("row").filter({ has: page.getByRole("button", { name: "הגדרה כיום סגירה" }) }).first();
    const holidayName = (await candidate.getByRole("cell").first().innerText()).trim();
    await candidate.getByRole("button", { name: "הגדרה כיום סגירה" }).click();
    await expect(holidays.getByRole("row").filter({ hasText: holidayName }).first()).toContainText("יום סגירה ✓");

    await page.getByRole("button", { name: "יום סגירה מיוחד" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("שם").fill(name);
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog).toBeHidden();
    const closureRow = page.getByRole("row").filter({ hasText: name });
    await expect(closureRow).toContainText("מיוחד");
    await expectNoHorizontalScroll(page);

    const teacher = await asUser(browser, testInfo, users!.teacher);
    await teacher.goto("/teacher/availability");
    await expect(teacher.getByText(name)).toBeVisible();

    // Cancelling keeps it in history and removes it from the teacher's list.
    await closureRow.getByRole("button", { name: "ביטול" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ביטול יום הסגירה" }).click();
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
    await page.getByRole("link", { name: "הצגת ימי סגירה שבוטלו" }).click();
    await expect(page.getByRole("row").filter({ hasText: name })).toContainText("בוטל");
    await expect(teacher.getByText(name)).toHaveCount(0, { timeout: 15_000 });
    await teacher.context().close();
  });

  test("teachers cannot reach admin screens; the admin sees the teacher's availability tab", async ({ page }) => {
    await login(page, users!.teacher);
    await page.goto("/admin/requests");
    await expect(page).toHaveURL(/\/forbidden/);
    await page.goto("/admin/settings/hours");
    await expect(page).toHaveURL(/\/forbidden/);

    await page.context().clearCookies();
    await login(page, users!.admin);
    await page.goto(`/admin/teachers/${teacherId}?tab=availability`);
    await expect(page.getByRole("heading", { name: "זמינות שבועית" })).toBeVisible();
    await expect(page.getByRole("button", { name: "הוספת היעדרות" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
