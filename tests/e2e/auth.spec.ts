import { expect, test, type Page } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

async function login(page: Page, user: TestUser, path = "/login") {
  await page.goto(path);
  await page.getByLabel("אימייל").fill(user.email);
  await page.getByLabel("סיסמה").fill(user.password);
  await page.getByRole("button", { name: "התחברות" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test("login page is Hebrew RTL and loads the logo", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "he");
  await expect(page.getByRole("heading", { name: "ברוכים הבאים" })).toBeVisible();
  const logo = page.getByAltText("לוגו בית הספר למוזיקה");
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // No horizontal scrolling at any viewport.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("shows validation and wrong-credentials errors", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page.getByText("יש להזין כתובת אימייל")).toBeVisible();

  await page.getByLabel("אימייל").fill(users!.teacher.email);
  await page.getByLabel("סיסמה").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "האימייל או הסיסמה שגויים" })).toBeVisible();
});

test("admin signs in, reaches the admin home, and signs out", async ({ page }) => {
  await login(page, users!.admin);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "סקירה כללית" })).toBeVisible();
  await expect(page.getByText("שלום, מנהל בדיקה")).toBeVisible();

  await logout(page);
  await expect(page.getByText("התנתקת מהמערכת.")).toBeVisible();
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
});

test("teacher reaches the teacher home and is blocked from the admin area", async ({ page }) => {
  await login(page, users!.teacher);
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByRole("heading", { name: "הלוח שלי" })).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole("heading", { name: "אין לך הרשאה לצפות בדף זה" })).toBeVisible();
  await expect(page.getByText("סקירה כללית")).toHaveCount(0);
});

test("admin is blocked from the teacher area", async ({ page }) => {
  await login(page, users!.admin);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/forbidden$/);
});

test("inactive teacher can sign in with a read-only notice", async ({ page }) => {
  await login(page, users!.teacherInactive);
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByText("החשבון שלך אינו פעיל. ניתן לצפות בהיסטוריית השיעורים בלבד.")).toBeVisible();
});

test("inactive admin and users without a role cannot enter", async ({ page }) => {
  await login(page, users!.adminInactive);
  await expect(page).toHaveURL(/\/account-unavailable$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/account-unavailable$/);
  await page.getByRole("button", { name: "יציאה" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, users!.noProfile);
  await expect(page).toHaveURL(/\/account-unavailable$/);
});

test("deep link returns to the requested page after login", async ({ page }) => {
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/login\?next=%2Fteacher/);
  await page.getByLabel("אימייל").fill(users!.teacher.email);
  await page.getByLabel("סיסמה").fill(users!.teacher.password);
  await page.getByRole("button", { name: "התחברות" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
});

test("forgot password always shows the same neutral message", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "שכחת סיסמה?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel("אימייל").fill("nobody-here@example.test");
  await page.getByRole("button", { name: "שליחת קישור לאיפוס" }).click();
  await expect(page.getByText("אם הכתובת רשומה במערכת, נשלח אליה קישור לאיפוס הסיסמה", { exact: false })).toBeVisible();
});

test("reset password without a valid link asks for a new one", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByText("הקישור לאיפוס הסיסמה פג או אינו תקין", { exact: false })).toBeVisible();
  await page.goto("/auth/confirm?token_hash=bogus&type=recovery&next=/reset-password");
  await expect(page).toHaveURL(/\/forgot-password\?error=link/);
});

test("navigation works at this viewport", async ({ page }, testInfo) => {
  await login(page, users!.admin);
  await expect(page).toHaveURL(/\/admin$/);
  const isDesktop = testInfo.project.name === "desktop";
  if (isDesktop) {
    await expect(page.getByRole("complementary").getByRole("link", { name: "בית" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "פתיחת תפריט" })).toBeHidden();
  } else {
    await page.getByRole("button", { name: "פתיחת תפריט" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("link", { name: "בית" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("pages are not indexable", async ({ page, request }) => {
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /");
  const response = await page.goto("/login");
  expect(response!.headers()["x-robots-tag"]).toContain("noindex");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("keyboard users can sign in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("אימייל").focus();
  await page.keyboard.type(users!.teacher.email);
  await page.keyboard.press("Tab");
  await page.keyboard.type(users!.teacher.password);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/teacher$/);
});
