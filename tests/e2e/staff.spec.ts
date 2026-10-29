import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const RUN = `e2e-${Date.now()}`;

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

// Opens a registration link in a fresh browser (no session) and creates the account.
async function registerFromLink(browser: Browser, link: string, password: string) {
  const token = new URL(link).searchParams.get("token")!;
  const context = await browser.newContext({ locale: "he-IL" });
  const page = await context.newPage();
  await page.goto(`/register?token=${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { name: "הצטרפות למערכת" })).toBeVisible();
  // The role is never chosen by the person registering.
  await expect(page.getByText(/תפקיד/)).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByLabel("סיסמה", { exact: true }).fill(password);
  await page.getByLabel("אימות סיסמה").fill(password);
  await page.getByRole("button", { name: "יצירת חשבון" }).click();
  return { context, page, token };
}

test.afterAll(async () => {
  if (!users) return;
  const db = service();
  for (let pageNo = 1; pageNo < 20; pageNo++) {
    const { data } = await db.auth.admin.listUsers({ page: pageNo, perPage: 200 });
    for (const u of data.users.filter((u) => u.email?.startsWith(RUN))) await db.auth.admin.deleteUser(u.id);
    if (data.users.length < 200) break;
  }
  await db.from("invitations").delete().like("email", `${RUN}%`);
  await db.from("teachers").delete().like("email", `${RUN}%`);
  await db.from("lesson_types").delete().like("name", `${RUN}%`);
});

test.describe("staff management", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!["desktop", "mobile"].includes(testInfo.project.name), "Full flows run on desktop and mobile.");
  });

  test("admin sets up lesson types and a teacher, who registers as a teacher only", async ({ page, browser }, testInfo) => {
    const tag = `${RUN}-${testInfo.project.name}`;
    const piano = `${tag} פסנתר`;
    const guitar = `${tag} גיטרה`;
    await login(page, users!.admin);

    // Lesson types.
    await page.goto("/admin/settings/lesson-types");
    for (const name of [piano, guitar]) {
      await page.getByRole("button", { name: "תחום חדש" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("שם התחום").fill(name);
      await dialog.getByLabel("משך שיעור ברירת מחדל (דקות)").fill("45");
      await dialog.getByRole("button", { name: "שמירה" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
    }
    await expectNoHorizontalScroll(page);

    // Teacher with two lesson types.
    const email = `${tag}-teacher@example.test`;
    await page.goto("/admin/teachers");
    await page.getByRole("button", { name: "מורה חדש" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("שם מלא").fill("מורה E2E");
    await dialog.getByLabel("אימייל").fill(email);
    await dialog.getByLabel("טלפון (לא חובה)").fill("050-1111111");
    await dialog.getByLabel(piano).check();
    await dialog.getByLabel(guitar).check();
    await dialog.getByRole("button", { name: "שמירה" }).click();
    await expect(page).toHaveURL(/\/admin\/teachers\/[0-9a-f-]+\?notice=created/);
    await expect(page.getByText("המורה נוסף.", { exact: false })).toBeVisible();
    await expect(page.getByText(piano)).toBeVisible();
    await expect(page.getByText(guitar)).toBeVisible();

    // A lesson type that is taught cannot be deleted.
    const detailsUrl = page.url();
    await page.goto("/admin/settings/lesson-types");
    await page.getByRole("row").filter({ hasText: piano }).getByRole("button", { name: "מחיקה" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "מחק" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("לא ניתן למחוק");
    await page.keyboard.press("Escape");

    // Search and filter find the teacher.
    await page.goto(`/admin/teachers?q=${encodeURIComponent("מורה E2E")}`);
    await expect(page.getByRole("link", { name: "מורה E2E" }).first()).toBeVisible();
    // The list opens below the field (measured before opening: the open list hides the rest of the page).
    const subjectField = page.getByRole("combobox", { name: "תחום" });
    const fieldBox = (await subjectField.boundingBox())!;
    await subjectField.click();
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    expect((await list.boundingBox())!.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height);
    await page.getByRole("option", { name: guitar }).click();
    await page.getByRole("button", { name: "סינון" }).click();
    await expect(page.getByRole("link", { name: "מורה E2E" })).toHaveCount(1);
    await expectNoHorizontalScroll(page);

    // Registration link.
    await page.goto(detailsUrl.replace(/\?.*/, ""));
    await page.getByRole("button", { name: "צור קישור הרשמה" }).click();
    const linkDialog = page.getByRole("dialog");
    await expect(linkDialog.getByRole("heading", { name: "קישור הרשמה נוצר" })).toBeVisible();
    await expect(linkDialog.getByRole("link", { name: "פתח במייל" })).toHaveAttribute("href", /^mailto:/);
    const link = await linkDialog.getByLabel("קישור הרשמה אישי").inputValue();
    expect(link).toContain("/register?token=");

    const password = `Pw-${Date.now()}-x9`;
    const registered = await registerFromLink(browser, link, password);
    await expect(registered.page).toHaveURL(/\/teacher$/);
    await registered.page.goto("/admin/teachers");
    await expect(registered.page).toHaveURL(/\/forbidden/);
    await registered.context.close();

    // The same link cannot be used again.
    const again = await browser.newContext({ locale: "he-IL" });
    const againPage = await again.newPage();
    await againPage.goto(`/register?token=${encodeURIComponent(registered.token)}`);
    await expect(againPage.getByText("הקישור אינו תקף או שפג תוקפו", { exact: false })).toBeVisible();
    await again.close();

    // The admin now sees the teacher as registered.
    await page.reload();
    await expect(page.getByText("רשום במערכת").first()).toBeVisible();
  });

  test("a regular admin can only view users", async ({ page }) => {
    await login(page, users!.admin);
    await page.goto("/admin/users");
    await expect(page.getByText("צפייה בלבד", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "מנהל חדש" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "העברת תפקיד מנהל ראשי" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "הסרה" })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test("the Super Admin invites an admin who registers as an admin", async ({ page, browser }, testInfo) => {
    const email = `${RUN}-${testInfo.project.name}-admin@example.test`;
    await login(page, users!.superAdmin);
    await page.goto("/admin/users");
    await page.getByRole("button", { name: "מנהל חדש" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("שם מלא").fill("מנהל E2E");
    await dialog.getByLabel("אימייל").fill(email);
    await dialog.getByRole("button", { name: "צור קישור הרשמה" }).click();
    const link = await page.getByRole("dialog").getByLabel("קישור הרשמה אישי").inputValue();
    await page.getByRole("dialog").getByRole("button", { name: "סגירה" }).first().click();
    await expect(page.getByRole("row").filter({ hasText: email })).toContainText("ממתין להרשמה");

    const registered = await registerFromLink(browser, link, `Pw-${Date.now()}-x9`);
    await expect(registered.page).toHaveURL(/\/admin$/);
    await registered.context.close();

    // The Super Admin can deactivate the new admin.
    await page.reload();
    const row = page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: "הסרה" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "הסר מנהל" }).click();
    await expect(row).toContainText("לא פעיל");
  });

  test("profile: edit details and change password validation", async ({ page }) => {
    await login(page, users!.admin2);
    await page.goto("/profile");
    await page.getByLabel("שם מלא").fill("מנהל בדיקה שני מעודכן");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText("הפרטים נשמרו.")).toBeVisible();
    await expect(page.getByRole("banner")).toContainText("מנהל בדיקה שני מעודכן");
    await page.getByLabel("שם מלא").fill("מנהל בדיקה שני");
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.getByText("הפרטים נשמרו.")).toBeVisible();

    await page.getByRole("link", { name: "שינוי סיסמה" }).click();
    await page.getByLabel("סיסמה נוכחית").fill("wrong-password-123");
    await page.getByLabel("סיסמה חדשה", { exact: true }).fill("another-pass-123");
    await page.getByLabel("אימות סיסמה חדשה").fill("another-pass-123");
    await page.getByRole("button", { name: "עדכון סיסמה" }).click();
    await expect(page.getByText("הסיסמה הנוכחית שגויה")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test("teachers see only their own navigation", async ({ page }, testInfo) => {
  await login(page, users!.teacher);
  if (testInfo.project.name !== "desktop") await page.getByRole("button", { name: "פתיחת תפריט" }).click();
  const nav = page.getByRole("navigation", { name: "ניווט ראשי" }).last();
  await expect(nav.getByRole("link", { name: "פרופיל" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "מורים" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "משתמשים" })).toHaveCount(0);
});

test("an invalid registration link shows a clear message", async ({ page }) => {
  await page.goto("/register?token=not-a-real-token");
  await expect(page.getByText("הקישור אינו תקף או שפג תוקפו", { exact: false })).toBeVisible();
  await expect(page.getByLabel("סיסמה", { exact: true })).toHaveCount(0);
});
