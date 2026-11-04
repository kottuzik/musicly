import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type TestInfo } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";
import { login } from "./session";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const RUN = `e2e-ntf-${Date.now()}`;
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

// A school-local date far enough ahead that nothing else of the suite uses it.
function futureDay(projectName: string, testNumber: number) {
  const offset = 40 + 6 * Math.max(FULL_FLOW_PROJECTS.indexOf(projectName), 0) + testNumber;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() + offset * 86_400_000));
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

test.describe("notifications", () => {
  test.beforeAll(async () => {
    if (!users) return;
    const db = service();
    const { data: t } = await db.from("teachers").select("id").eq("profile_id", users.teacher.id).single();
    teacherId = t!.id;
    const { data: lt } = await db.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single();
    lessonTypeId = lt!.id;
    await db.from("notification_preferences").delete().in("user_id", [users.teacher.id, users.admin.id]);
    await db.from("reminder_preferences").delete().eq("teacher_id", teacherId);
  });

  test.afterAll(async () => {
    if (!users) return;
    const db = service();
    if (studentIds.length) {
      const { data: lessons } = await db.from("lessons").select("id").in("student_id", studentIds);
      const ids = (lessons ?? []).map((l) => l.id);
      if (ids.length) {
        await db.from("lesson_change_requests").delete().in("lesson_id", ids);
        await db.from("audit_events").delete().in("entity_id", ids);
      }
      await db.from("lessons").delete().in("student_id", studentIds);
      await db.from("student_subjects").delete().in("student_id", studentIds);
      await db.from("students").delete().in("id", studentIds);
    }
    await db.from("notification_preferences").delete().in("user_id", [users.teacher.id, users.admin.id]);
    await db.from("reminder_preferences").delete().eq("teacher_id", teacherId);
  });

  async function newLesson(name: string, date: string, start: string) {
    const db = service();
    const { data: s } = await db.from("students").insert({ full_name: name, birth_date: "2010-05-05" }).select("id").single();
    studentIds.push(s!.id);
    await db.from("student_subjects").insert({ student_id: s!.id, lesson_type_id: lessonTypeId, regular_teacher_id: teacherId, level: "beginner" });
    const startAt = localToUtc(date, start);
    const { data } = await db
      .from("lessons")
      .insert({
        occurrence_date: date, student_id: s!.id, lesson_type_id: lessonTypeId, teacher_id: teacherId,
        start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 45 * 60000).toISOString(), location: "school",
      })
      .select("id")
      .single();
    return data!.id;
  }

  test("every role sees the bell and the notification center, without sideways scrolling", async ({ page }) => {
    await login(page, users!.admin);
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: /^התראות/ }).first()).toBeVisible();
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "התראות", level: 1 })).toBeVisible();
    for (const tab of ["פעילות", "הודעות מערכת", "ארכיון"]) {
      // A tab with something unread also says so in its name.
      await expect(page.getByRole("link", { name: new RegExp(`^${tab}( \\(יש הודעות שלא נקראו\\))?$`) })).toBeVisible();
    }
    await page.getByRole("link", { name: "ארכיון", exact: true }).click();
    await expect(page).toHaveURL(/tab=archive/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("a new request reaches the admin live; it can be read, archived and brought back, never deleted", async ({ page, browser }, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
    test.setTimeout(90_000);
    const name = `${RUN}-${testInfo.project.name} תלמיד`;
    const lessonId = await newLesson(name, futureDay(testInfo.project.name, 0), "10:00");

    await login(page, users!.admin);
    await page.goto("/notifications?tab=activity");
    await expect(page.getByRole("heading", { name: "התראות", level: 1 })).toBeVisible();

    // The teacher's request is created; the open page updates by itself.
    await service().from("lesson_change_requests").insert({
      lesson_id: lessonId, teacher_id: teacherId, kind: "cancel", requested_by: users!.teacher.id,
    });
    const item = page.getByRole("listitem").filter({ hasText: name }).first();
    await expect(item).toBeVisible({ timeout: 25_000 });
    await expect(item.getByText("מורה ביקש לשנות או לבטל שיעור")).toBeVisible();
    await expect(item.getByText("לא נקראה", { exact: false })).toBeVisible();
    await expect(item.getByRole("button", { name: /מחי?ק/ })).toHaveCount(0);

    await item.getByRole("button", { name: "סימון כנקרא" }).click();
    await expect(item.getByText("לא נקראה", { exact: false })).toHaveCount(0, { timeout: 15_000 });

    await item.getByRole("button", { name: "העברה לארכיון" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0, { timeout: 15_000 });

    await page.goto("/notifications?tab=archive");
    const archived = page.getByRole("listitem").filter({ hasText: name }).first();
    await expect(archived).toBeVisible();
    await archived.getByRole("button", { name: "החזרה מהארכיון" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0, { timeout: 15_000 });

    await page.goto("/notifications?tab=activity");
    await expect(page.getByRole("listitem").filter({ hasText: name }).first()).toBeVisible();

    // The teacher got the "new lesson" notice for this lesson, but not the admins' notice of the request.
    const teacherPage = await asUser(browser, testInfo, users!.teacher);
    await teacherPage.goto("/notifications?tab=activity");
    await expect(teacherPage.getByRole("heading", { name: "התראות", level: 1 })).toBeVisible();
    await expect(teacherPage.getByRole("listitem").filter({ hasText: name }).first()).toBeVisible();
    await expect(teacherPage.getByRole("listitem").filter({ hasText: name }).filter({ hasText: "מורה ביקש לשנות או לבטל שיעור" })).toHaveCount(0);
    await teacherPage.context().close();
  });

  test("an admin answers a request right from its notification", async ({ page }, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
    test.setTimeout(90_000);
    const name = `${RUN}-${testInfo.project.name} תלמיד תשובה`;
    const lessonId = await newLesson(name, futureDay(testInfo.project.name, 2), "12:00");
    const { data: request } = await service()
      .from("lesson_change_requests")
      .insert({ lesson_id: lessonId, teacher_id: teacherId, kind: "cancel", requested_by: users!.teacher.id })
      .select("id")
      .single();

    await login(page, users!.admin);
    await page.goto("/notifications?tab=activity");
    const item = page.getByRole("listitem").filter({ hasText: name }).filter({ hasText: "מורה ביקש" }).first();
    await expect(item).toBeVisible({ timeout: 25_000 });
    await expect(item.getByRole("button", { name: "אישור הביטול" })).toBeVisible();

    await item.getByRole("button", { name: "דחייה" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "דחה בקשה" }).click();
    await expect
      .poll(async () => (await service().from("lesson_change_requests").select("status").eq("id", request!.id).single()).data?.status, {
        timeout: 20_000,
      })
      .toBe("rejected");
    // Answered: the buttons are gone from the notification.
    await expect(item.getByRole("button", { name: "דחייה" })).toHaveCount(0, { timeout: 20_000 });
    await expect(item.getByRole("button", { name: "אישור הביטול" })).toHaveCount(0);

    // The admin is offered to archive the notification of the request that was just answered.
    await expect(page.getByText("הבקשה טופלה. להעביר את ההתראה שלה לארכיון?")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "העברה לארכיון" }).first().click();
    await expect(page.getByText("הבקשה טופלה. להעביר את ההתראה שלה לארכיון?")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("listitem").filter({ hasText: name }).filter({ hasText: "מורה ביקש" })).toHaveCount(0);
  });

  test("turning a request down from its notification can suggest another time", async ({ page }, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
    test.setTimeout(90_000);
    const name = `${RUN}-${testInfo.project.name} תלמיד הצעה`;
    const lessonId = await newLesson(name, futureDay(testInfo.project.name, 3), "13:00");
    const { data: request } = await service()
      .from("lesson_change_requests")
      .insert({ lesson_id: lessonId, teacher_id: teacherId, kind: "change", requested_by: users!.teacher.id })
      .select("id")
      .single();
    const suggested = futureDay(testInfo.project.name, 4);

    await login(page, users!.admin);
    await page.goto("/notifications?tab=activity");
    const item = page.getByRole("listitem").filter({ hasText: name }).filter({ hasText: "מורה ביקש" }).first();
    await expect(item).toBeVisible({ timeout: 25_000 });
    // A change is approved by choosing the time, so the button is just "אשר".
    await expect(item.getByRole("button", { name: "אשר", exact: true })).toBeVisible();

    await item.getByRole("button", { name: "דחייה" }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog.getByRole("radio", { name: "לדחות את הבקשה" })).toBeChecked();
    await dialog.getByRole("radio", { name: "להציע מועד אחר" }).check();
    // A date without a time is refused.
    await dialog.getByLabel("תאריך מוצע").fill(suggested);
    await dialog.getByRole("button", { name: "דחה והצע מועד" }).click();
    await expect(dialog.getByText("יש לבחור תאריך ושעה")).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("combobox", { name: "שעה מוצעת" }).click();
    await page.getByRole("option", { name: "17:00", exact: true }).click();
    await dialog.getByRole("button", { name: "דחה והצע מועד" }).click();

    await expect
      .poll(async () => (await service().from("lesson_change_requests").select("status, counter_date, counter_start_time").eq("id", request!.id).single()).data, {
        timeout: 20_000,
      })
      .toEqual({ status: "rejected", counter_date: suggested, counter_start_time: "17:00:00" });
    await expect(item.getByRole("button", { name: "דחייה" })).toHaveCount(0, { timeout: 20_000 });
  });

  test("a teacher chooses how to be notified and when to be reminded", async ({ browser }, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
    test.setTimeout(90_000);
    const page = await asUser(browser, testInfo, users!.teacher);
    await page.goto("/profile?tab=preferences");
    await expect(page.getByRole("heading", { name: "התראות", level: 2 })).toBeVisible();
    await expect(page.getByRole("radio", { name: "בתוך המערכת בלבד" })).toBeChecked();
    // Reminders start off.
    await expect(page.getByLabel("לשלוח לי תזכורות לפני שיעורים")).not.toBeChecked();

    await page.getByRole("radio", { name: "בתוך המערכת וגם באימייל" }).check();
    await page.getByRole("button", { name: "שמירה" }).first().click();
    await expect(page.getByText("ההעדפה נשמרה.")).toBeVisible({ timeout: 15_000 });

    // Turning reminders on without a time is refused.
    await page.getByLabel("לשלוח לי תזכורות לפני שיעורים").check();
    await page.getByRole("button", { name: "שמירה" }).last().click();
    await expect(page.getByText("כדי להפעיל תזכורות יש לבחור לפחות מועד אחד.")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("checkbox", { name: "שעה לפני" }).check();
    await page.getByRole("checkbox", { name: "24 שעות לפני" }).check();
    await page.getByLabel("זמן אחר לפני השיעור").fill("45");
    await page.getByRole("combobox", { name: "יחידה" }).click();
    await page.getByRole("option", { name: "דקות" }).click();
    await page.getByRole("button", { name: "שמירה" }).last().click();
    await expect(page.getByText("העדפות התזכורות נשמרו.")).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByRole("radio", { name: "בתוך המערכת וגם באימייל" })).toBeChecked();
    await expect(page.getByLabel("לשלוח לי תזכורות לפני שיעורים")).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "שעה לפני" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "24 שעות לפני" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "שעתיים לפני" })).not.toBeChecked();
    await expect(page.getByLabel("זמן אחר לפני השיעור")).toHaveValue("45");

    const { data } = await service().from("reminder_preferences").select("enabled, offsets_minutes").eq("teacher_id", teacherId).single();
    expect(data).toEqual({ enabled: true, offsets_minutes: [1440, 60, 45] });
    await page.context().close();

    // An admin has the channel choice but no reminders.
    const adminPage = await asUser(browser, testInfo, users!.admin);
    await adminPage.goto("/profile?tab=preferences");
    await expect(adminPage.getByRole("heading", { name: "התראות", level: 2 })).toBeVisible();
    await expect(adminPage.getByText("תזכורות לשיעורים")).toHaveCount(0);
    await adminPage.context().close();
  });

  test("a teacher changes the reminder of one lesson", async ({ browser }, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
    test.setTimeout(90_000);
    const name = `${RUN}-${testInfo.project.name} תלמיד תזכורת`;
    const date = futureDay(testInfo.project.name, 1);
    const lessonId = await newLesson(name, date, "11:00");

    const page = await asUser(browser, testInfo, users!.teacher);
    await page.goto(`/teacher/calendar?view=day&date=${date}`);
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "תזכורת לשיעור" }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog.getByRole("radio", { name: "לפי ההעדפה הכללית" })).toBeChecked({ timeout: 15_000 });

    await dialog.getByRole("radio", { name: "בלי תזכורת לשיעור הזה" }).check();
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText("התזכורת לשיעור נשמרה.")).toBeVisible({ timeout: 15_000 });
    const off = await service().from("lesson_reminder_overrides").select("mode").eq("lesson_id", lessonId).single();
    expect(off.data?.mode).toBe("off");

    await dialog.getByRole("radio", { name: "מועדים מיוחדים לשיעור הזה" }).check();
    // At least one time is needed.
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText("יש לבחור לפחות מועד אחד.")).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("checkbox", { name: "שעתיים לפני" }).check();
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText("התזכורת לשיעור נשמרה.")).toBeVisible({ timeout: 15_000 });
    const custom = await service().from("lesson_reminder_overrides").select("mode, offsets_minutes").eq("lesson_id", lessonId).single();
    expect(custom.data).toEqual({ mode: "custom", offsets_minutes: [120] });

    await dialog.getByRole("radio", { name: "לפי ההעדפה הכללית" }).check();
    await dialog.getByRole("button", { name: "שמירה" }).click();
    // The earlier success message is still on screen, so wait for the database instead.
    await expect
      .poll(async () => (await service().from("lesson_reminder_overrides").select("lesson_id").eq("lesson_id", lessonId)).data?.length, {
        timeout: 15_000,
      })
      .toBe(0);
    await page.context().close();
  });
});
