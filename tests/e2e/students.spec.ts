import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const RUN = `e2e-${Date.now()}`;
const PARENT_PHONE = "050-9876543";

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

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function choose(page: Page, scope: Page | Locator, label: string, option: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

// Lesson types for this run: the test teacher teaches A, the second test teacher teaches B.
const lessonTypes = { a: { id: "", name: `${RUN} פסנתר` }, b: { id: "", name: `${RUN} גיטרה` } };
const teacherNames = { teacher: "", teacher2: "" };
let foreignStudentId = "";

// Student flows run on desktop and mobile only; other projects skip the database setup too.
const FULL_FLOW_PROJECTS = ["desktop", "mobile"];

test.beforeAll(async ({}, testInfo) => {
  if (!users || !FULL_FLOW_PROJECTS.includes(testInfo.project.name)) return;
  test.setTimeout(60_000);
  const db = service();
  for (const k of ["a", "b"] as const) {
    const { data, error } = await db
      .from("lesson_types")
      .insert({ name: lessonTypes[k].name, default_duration_minutes: 45, color: "#38BDF8" })
      .select("id")
      .single();
    if (error) throw error;
    lessonTypes[k].id = data.id;
  }
  const ids: Record<string, string> = {};
  for (const k of ["teacher", "teacher2"] as const) {
    const { data, error } = await db.from("teachers").select("id, full_name").eq("profile_id", users[k].id).single();
    if (error) throw error;
    ids[k] = data.id;
    teacherNames[k] = data.full_name;
  }
  await db.from("teacher_skills").insert([
    { teacher_id: ids.teacher, lesson_type_id: lessonTypes.a.id },
    { teacher_id: ids.teacher2, lesson_type_id: lessonTypes.b.id },
  ]);

  // A student who belongs only to the second teacher.
  const { data: student } = await db.from("students").insert({ full_name: `${RUN} תלמיד זר`, birth_date: "2012-01-01" }).select("id").single();
  foreignStudentId = student!.id;
  await db.from("student_subjects").insert({
    student_id: foreignStudentId,
    lesson_type_id: lessonTypes.b.id,
    regular_teacher_id: ids.teacher2,
    level: "beginner",
  });
});

test.afterAll(async ({}, testInfo) => {
  if (!users || !FULL_FLOW_PROJECTS.includes(testInfo.project.name)) return;
  test.setTimeout(60_000);
  const db = service();
  await db.from("students").delete().like("full_name", `${RUN}%`);
  const ids = [lessonTypes.a.id, lessonTypes.b.id].filter(Boolean);
  await db.from("teacher_skills").delete().in("lesson_type_id", ids);
  await db.from("lesson_types").delete().in("id", ids);
});

test.describe("students", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "Full flows run on desktop and mobile.");
  });

  test("admin manages a student; the teacher sees professional info only", async ({ page, browser }, testInfo) => {
    const name = `${RUN}-${testInfo.project.name} נועה`;
    await login(page, users!.admin);

    // 1. A minor: the parent section appears and the age is computed.
    await page.goto("/admin/students");
    await page.getByRole("button", { name: "תלמיד חדש" }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("שם מלא").fill(name);
    await expect(dialog.getByText("פרטי הורה")).toHaveCount(0);
    await dialog.getByLabel("תאריך לידה").fill("2015-03-15");
    await expect(dialog.getByText("גיל: 11")).toBeVisible();
    await dialog.getByLabel("טלפון ההורה").fill(PARENT_PHONE);
    await dialog.getByLabel("שם ההורה").fill("אמא של נועה");
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(page).toHaveURL(/\/admin\/students\/[0-9a-f-]+\?tab=subjects/);
    const studentUrl = page.url().replace(/\?.*/, "");
    const studentId = studentUrl.split("/").pop()!;

    // 2. Two subjects, two teachers, separate levels and background.
    await page.getByRole("button", { name: "הוספת תחום" }).click();
    dialog = page.getByRole("dialog");
    await choose(page, dialog, "תחום לימוד", lessonTypes.a.name);
    // Only teachers of the chosen subject are offered.
    await dialog.getByRole("combobox", { name: "מורה קבוע" }).click();
    await expect(page.getByRole("option", { name: teacherNames.teacher2, exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: teacherNames.teacher, exact: true }).click();
    await dialog.getByLabel("מתחיל").check();
    await dialog.getByLabel("רקע מקצועי (לא חובה)").fill("לומדת שנה ראשונה");
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "הוספת תחום" }).click();
    dialog = page.getByRole("dialog");
    await choose(page, dialog, "תחום לימוד", lessonTypes.b.name);
    await choose(page, dialog, "מורה קבוע", teacherNames.teacher2);
    await dialog.getByLabel("מתקדם").check();
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(dialog).toBeHidden();

    const subjects = page.getByRole("listitem");
    await expect(subjects.filter({ hasText: lessonTypes.a.name })).toContainText("מתחיל");
    await expect(subjects.filter({ hasText: lessonTypes.a.name })).toContainText(teacherNames.teacher);
    await expect(subjects.filter({ hasText: lessonTypes.b.name })).toContainText("מתקדם");
    await expect(subjects.filter({ hasText: lessonTypes.b.name })).toContainText(teacherNames.teacher2);
    await expectNoHorizontalScroll(page);

    // 3. Search + combined filters (subject, level and teacher must match the same enrollment).
    await page.goto(`/admin/students?q=${encodeURIComponent(name)}&subject=${lessonTypes.a.id}&level=beginner`);
    await expect(page.getByRole("link", { name })).toBeVisible();
    await page.goto(`/admin/students?q=${encodeURIComponent(name)}&subject=${lessonTypes.a.id}&level=advanced`);
    await expect(page.getByText("לא נמצאו תלמידים התואמים לחיפוש.")).toBeVisible();
    await page.goto(`/admin/students?q=${encodeURIComponent(name)}`);
    await choose(page, page, "מורה", teacherNames.teacher2);
    await page.getByRole("button", { name: "סינון" }).click();
    await expect(page.getByRole("link", { name })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: name })).toContainText(PARENT_PHONE);
    await expectNoHorizontalScroll(page);

    // 4. Inactive with a return date: the notify/auto choice is required and not preselected.
    await page.goto(studentUrl);
    await page.getByRole("button", { name: "הפוך ללא פעיל" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("תאריך חזרה משוער (לא חובה)").fill("2027-09-01");
    await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "הפוך ללא פעיל" }).click();
    await expect(dialog.getByText("יש לבחור מה יקרה בתאריך החזרה")).toBeVisible();
    await dialog.getByLabel(/התראה למנהלים/).check();
    await dialog.getByRole("button", { name: "הפוך ללא פעיל" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("01/09/2027")).toBeVisible();
    await expect(page.getByText("התראה למנהלים").first()).toBeVisible();

    // 5. The teacher: sees the student, no contact details, edits only their own subject.
    const context = await browser.newContext({ ...testInfo.project.use, locale: "he-IL" });
    const teacherPage = await context.newPage();
    await login(teacherPage, users!.teacher);
    await teacherPage.goto(`/teacher/students?q=${encodeURIComponent(name)}`);
    await teacherPage.getByRole("link", { name }).click();
    await expect(teacherPage).toHaveURL(new RegExp(`/teacher/students/${studentId}$`));
    await expect(teacherPage.getByText(PARENT_PHONE)).toHaveCount(0);
    await expect(teacherPage.getByText("אמא של נועה")).toHaveCount(0);
    await expect(teacherPage.getByText(lessonTypes.b.name)).toBeVisible();
    const own = teacherPage.getByRole("listitem").filter({ hasText: lessonTypes.a.name });
    const other = teacherPage.getByRole("listitem").filter({ hasText: lessonTypes.b.name });
    await expect(other.getByRole("button")).toHaveCount(0);
    await own.getByRole("button", { name: /עריכת מידע מקצועי/ }).click();
    const proDialog = teacherPage.getByRole("dialog");
    await proDialog.getByLabel("בינוני").check();
    await proDialog.getByLabel("רקע מקצועי (לא חובה)").fill("התקדמה מאוד");
    await proDialog.getByRole("button", { name: "שמירה" }).click();
    await expect(proDialog).toBeHidden();
    await expect(own).toContainText("בינוני");
    await expect(own).toContainText("התקדמה מאוד");
    await expectNoHorizontalScroll(teacherPage);

    // 6. Not their student → not found; the admin area is forbidden.
    const response = await teacherPage.goto(`/teacher/students/${foreignStudentId}`);
    expect(response?.status()).toBe(404);
    await teacherPage.goto("/admin/students");
    await expect(teacherPage).toHaveURL(/\/forbidden/);
    await context.close();
  });

  test("an inactive teacher has no access to students", async ({ page }) => {
    await login(page, users!.teacherInactive);
    await expect(page.getByRole("link", { name: "התלמידים שלי" })).toHaveCount(0);
    await page.goto("/teacher/students");
    await expect(page).toHaveURL(/\/teacher$/);
  });
});
