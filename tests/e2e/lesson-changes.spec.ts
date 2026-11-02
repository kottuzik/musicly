import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";
import { login } from "./session";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const RUN = `e2e-changes-${Date.now()}`;
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

async function choose(page: Page, scope: Page | ReturnType<Page["getByRole"]>, label: string, option: string | RegExp) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

// Each device project and each test gets its own four-week block of Mondays, so nothing collides.
function monday(projectName: string, testNumber: number, weekOffset = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 28 + 7 * (20 * Math.max(FULL_FLOW_PROJECTS.indexOf(projectName), 0) + 4 * testNumber + weekOffset));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const display = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function localToUtc(date: string, time: string) {
  for (const offset of ["+02:00", "+03:00"]) {
    const instant = new Date(`${date}T${time}:00${offset}`);
    const shown = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(instant);
    if (shown === time) return instant;
  }
  throw new Error("bad time");
}

let teacherId = "";
let teacher2Id = "";
let lessonTypeId = "";
let savedHours: Record<string, unknown>[] = [];
const studentIds: string[] = [];

test.describe("changing, cancelling and restoring lessons", () => {
  test.beforeAll(async () => {
    if (!users) return;
    const db = service();
    const { data: t } = await db.from("teachers").select("id").eq("profile_id", users.teacher.id).single();
    teacherId = t!.id;
    const { data: t2 } = await db.from("teachers").select("id").eq("profile_id", users.teacher2.id).single();
    teacher2Id = t2!.id;
    const { data: lt } = await db.from("lesson_types").select("id").eq("name", TEST_LESSON_TYPE).single();
    lessonTypeId = lt!.id;
    // The substitute must teach the subject.
    await db.from("teacher_skills").upsert({ teacher_id: teacher2Id, lesson_type_id: lessonTypeId });

    const { data: hours } = await db.from("operating_hours").select("day_of_week, open_time, close_time, updated_by");
    savedHours = hours ?? [];
    await db.from("operating_hours").delete().gte("day_of_week", 0);
    await db.from("operating_hours").insert([0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, open_time: "08:00", close_time: "20:00" })));

    await db.from("teacher_availability").delete().in("teacher_id", [teacherId, teacher2Id]);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
    await db.from("teacher_availability").insert(
      [teacherId, teacher2Id].flatMap((id) =>
        [0, 1, 2, 3, 4, 5, 6].map((d) => ({ teacher_id: id, day_of_week: d, start_time: "09:00", end_time: "18:00", valid_from: today })),
      ),
    );
  });

  test.afterAll(async () => {
    if (!users) return;
    const db = service();
    if (studentIds.length) {
      const { data: lessons } = await db.from("lessons").select("id").in("student_id", studentIds);
      const { data: series } = await db.from("lesson_series").select("id").in("student_id", studentIds);
      const ids = [...(lessons ?? []).map((l) => l.id), ...(series ?? []).map((s) => s.id), ...studentIds];
      await db.from("audit_events").delete().in("entity_id", ids);
      await db.from("lesson_change_requests").delete().in("lesson_id", (lessons ?? []).map((l) => l.id));
      await db.from("lessons").delete().in("student_id", studentIds);
      await db.from("lesson_series").delete().in("student_id", studentIds);
      await db.from("exception_booking_requests").delete().in("student_id", studentIds);
      await db.from("student_subjects").delete().in("student_id", studentIds);
      await db.from("students").delete().in("id", studentIds);
    }
    await db.from("teacher_absences").delete().in("teacher_id", [teacherId, teacher2Id]);
    await db.from("availability_requests").delete().in("teacher_id", [teacherId, teacher2Id]);
    await db.from("teacher_availability").delete().in("teacher_id", [teacherId, teacher2Id]);
    await db.from("operating_hours").delete().gte("day_of_week", 0);
    if (savedHours.length) await db.from("operating_hours").insert(savedHours);
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

  async function newLesson(student: string, date: string, start: string, teacher = teacherId) {
    const db = service();
    const startAt = localToUtc(date, start);
    const { data } = await db
      .from("lessons")
      .insert({
        occurrence_date: date, student_id: student, lesson_type_id: lessonTypeId, teacher_id: teacher,
        start_at: startAt.toISOString(), end_at: new Date(startAt.getTime() + 45 * 60000).toISOString(), location: "school",
      })
      .select("id")
      .single();
    return data!.id;
  }

  const block = (page: Page, student: string) => page.getByRole("button", { name: new RegExp(student) });

  test("admin changes a lesson (time and Zoom); the teacher's calendar updates without a refresh", async ({ page, browser }, testInfo) => {
    const name = `${RUN}-${testInfo.project.name} תלמיד א`;
    const date = monday(testInfo.project.name, 0);
    await newLesson(await newStudent(name), date, "10:00");

    const teacherPage = await asUser(browser, testInfo, users!.teacher);
    await teacherPage.goto(`/teacher/calendar?view=day&date=${date}`);
    await expect(block(teacherPage, name)).toContainText("10:00");

    await login(page, users!.admin);
    await page.goto(`/admin/calendar?view=day&date=${date}`);
    await block(page, name).click();
    await page.getByRole("button", { name: "שינוי", exact: true }).click();
    const dialog = page.getByRole("dialog").last();
    await choose(page, dialog, "שעת התחלה", "11:00");
    await dialog.getByLabel("בזום").check();
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText("השיעור עודכן.")).toBeVisible();

    // The teacher's open calendar shows the new time and the Zoom mark on its own.
    await expect(block(teacherPage, name)).toContainText("11:00", { timeout: 15_000 });
    await expect(block(teacherPage, name)).toContainText("בזום");
    await teacherPage.context().close();
  });

  test("admin changes a series from one meeting on; a clashing meeting stays flagged and shows on the home page", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const name = `${RUN}-${testInfo.project.name} תלמיד ב`;
    const other = `${RUN}-${testInfo.project.name} תלמיד ג`;
    const first = monday(testInfo.project.name, 1);
    const student = await newStudent(name);
    const db = service();
    const { data: series } = await db
      .from("lesson_series")
      .insert({
        student_id: student, lesson_type_id: lessonTypeId, teacher_id: teacherId, day_of_week: 1, start_time: "10:00",
        duration_minutes: 45, location: "school", start_date: first, end_date: monday(testInfo.project.name, 1, 3), generated_until: addDays(first, -1),
      })
      .select("id")
      .single();
    await db.rpc("generate_series_occurrences", { p_series_id: series!.id, p_until: monday(testInfo.project.name, 1, 3) });
    // Someone else holds the new time (11:00) in the third week.
    await newLesson(await newStudent(other), monday(testInfo.project.name, 1, 2), "11:00");

    await login(page, users!.admin);
    await page.goto(`/admin/calendar?view=day&date=${first}`);
    await block(page, name).click();
    await page.getByRole("button", { name: "שינוי", exact: true }).click();
    const dialog = page.getByRole("dialog").last();
    await dialog.getByText("המפגש הזה וכל הבאים").click();
    await choose(page, dialog, "שעת התחלה", "11:00");
    await dialog.getByRole("button", { name: "בדיקת השינוי" }).click();
    await expect(dialog.getByText("לפני השמירה")).toBeVisible();
    await expect(dialog.getByText(/יישארו במועד המקורי ויסומנו/)).toBeVisible();
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog.getByText(/נשארו במועד המקורי ומסומנים/)).toBeVisible();

    await page.goto("/admin");
    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    await expect(page.getByText("התנגשות בשינוי סדרה").first()).toBeVisible();
  });

  test("admin cancels a lesson (it leaves the calendar, shows with the filter) and restores it at another time", async ({ page }, testInfo) => {
    const name = `${RUN}-${testInfo.project.name} תלמיד ד`;
    const date = monday(testInfo.project.name, 2);
    const id = await newLesson(await newStudent(name), date, "10:00");

    await login(page, users!.admin);
    await page.goto(`/admin/calendar?view=day&date=${date}`);
    await block(page, name).click();
    await page.getByRole("button", { name: "ביטול שיעור" }).click();
    const confirm = page.getByRole("dialog").last();
    await confirm.getByLabel("סיבה (לא חובה)").fill("בדיקה");
    await confirm.getByRole("button", { name: "בטל שיעור" }).click();
    await expect.poll(async () => (await service().from("lessons").select("status").eq("id", id).single()).data?.status).toBe("cancelled");

    await page.goto(`/admin/calendar?view=day&date=${date}`);
    await expect(block(page, name)).toHaveCount(0);
    await page.goto(`/admin/calendar?view=day&date=${date}&cancelled=1`);
    await block(page, name).click();
    await expect(page.getByRole("dialog")).toContainText("בוטל בידי מנהל — בדיקה");
    await page.getByRole("button", { name: "שחזור השיעור" }).click();
    const dialog = page.getByRole("dialog").last();
    await dialog.getByText("במועד אחר").click();
    await choose(page, dialog, "שעת התחלה", "14:00");
    await dialog.getByRole("button", { name: "שחזור השיעור" }).click();
    await expect(dialog.getByText("השיעור שוחזר.")).toBeVisible();

    const restored = (await service().from("lessons").select("status, start_at").eq("id", id).single()).data!;
    expect(restored.status).toBe("scheduled");
    expect(new Date(restored.start_at).getTime()).toBe(localToUtc(date, "14:00").getTime());
  });

  test("a teacher asks to cancel a lesson; an admin approves and the teacher sees the answer", async ({ page, browser }, testInfo) => {
    const name = `${RUN}-${testInfo.project.name} תלמיד ה`;
    const date = monday(testInfo.project.name, 3);
    const id = await newLesson(await newStudent(name), date, "10:00");

    const teacherPage = await asUser(browser, testInfo, users!.teacher);
    await teacherPage.goto(`/teacher/calendar?view=day&date=${date}`);
    await block(teacherPage, name).click();
    await teacherPage.getByRole("button", { name: "בקשת שינוי או ביטול" }).click();
    const request = teacherPage.getByRole("dialog").last();
    await request.getByLabel("סיבה (לא חובה)").fill("נסיעה");
    await request.getByRole("button", { name: "שליחת הבקשה" }).click();
    await expect(request.getByText("הבקשה נשלחה למנהל.")).toBeVisible();

    await login(page, users!.admin);
    await page.goto("/admin/requests?section=changes");
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("נסיעה");
    await row.getByRole("button", { name: "אישור הביטול" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "אשר ביטול" }).click();
    await expect.poll(async () => (await service().from("lessons").select("status").eq("id", id).single()).data?.status).toBe("cancelled");

    await teacherPage.goto("/teacher/requests");
    await expect(teacherPage.getByRole("row").filter({ hasText: name })).toContainText("אושרה");
    await teacherPage.context().close();
  });

  test("approving a teacher's absence with a substitute moves the lesson to them", async ({ page }, testInfo) => {
    const name = `${RUN}-${testInfo.project.name} תלמיד ו`;
    const date = monday(testInfo.project.name, 4);
    const id = await newLesson(await newStudent(name), date, "10:00");
    const { data: absence } = await service()
      .from("availability_requests")
      .insert({ teacher_id: teacherId, kind: "absence", start_date: date, end_date: date, reason: "מחלה", requested_by: users!.teacher.id })
      .select("id")
      .single();

    await login(page, users!.admin);
    await page.goto("/admin/requests");
    const row = page.getByRole("row").filter({ hasText: display(date) });
    await row.getByRole("button", { name: "אישור" }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog.getByText(/מה לעשות עם כל אחד/)).toBeVisible();
    await expect(dialog.getByText(new RegExp(name))).toBeVisible();
    await choose(page, dialog, "החלטה", "מורה מחליף באותה שעה");
    await choose(page, dialog, "מורה מחליף", /מורה בדיקה שני/);
    await dialog.getByRole("button", { name: "אישור" }).last().click();
    // The approved request leaves the pending list, so the dialog goes with it; check the outcome itself.
    await expect
      .poll(async () => (await service().from("lessons").select("teacher_id").eq("id", id).single()).data?.teacher_id)
      .toBe(teacher2Id);
    expect((await service().from("availability_requests").select("status").eq("id", absence!.id).single()).data?.status).toBe("approved");
  });

  test("deactivating a student warns about the lessons it cancels, then cancels them", async ({ page }, testInfo) => {
    const name = `${RUN}-${testInfo.project.name} תלמיד ז`;
    const date = monday(testInfo.project.name, 4, 1);
    const student = await newStudent(name);
    const id = await newLesson(student, date, "12:00");

    await login(page, users!.admin);
    await page.goto(`/admin/students/${student}`);
    await page.getByRole("button", { name: "הפוך ללא פעיל" }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog.getByText(/שיעור עתידי אחד/)).toBeVisible();
    await dialog.getByRole("button", { name: "הפוך ללא פעיל" }).click();
    await expect.poll(async () => (await service().from("lessons").select("status, cancel_source").eq("id", id).single()).data).toEqual({
      status: "cancelled",
      cancel_source: "student_inactive",
    });
  });
});
