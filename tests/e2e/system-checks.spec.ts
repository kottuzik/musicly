import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loadTestUsers, type TestUser } from "../test-users";
import { login } from "./session";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");
// These tests walk many screens against the cloud database, so one test needs more than the default 30 s.
test.setTimeout(150_000);

// A page that finishes loading while the previous one is still settling can abort the navigation; retry once.
async function visit(page: Page, path: string) {
  try {
    return await page.goto(path);
  } catch (error) {
    if (!/ERR_ABORTED|interrupted by another navigation/.test(String(error))) throw error;
    await page.waitForLoadState("load");
    return page.goto(path);
  }
}

// Every screen reachable from the role's menu must open without an error page and have one main heading.
async function menuHrefs(page: Page): Promise<string[]> {
  const hrefs = await page
    .locator("nav a[href^='/']")
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
  return [...new Set(hrefs)];
}

async function walkMenu(page: Page, user: TestUser) {
  await login(page, user);
  await page.goto("/");
  const hrefs = await menuHrefs(page);
  expect(hrefs.length).toBeGreaterThan(4);
  for (const href of hrefs) {
    const response = await visit(page, href);
    expect(response?.status(), href).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 }).first(), href).toBeVisible();
    await expect(page.getByText("משהו השתבש"), href).toHaveCount(0);
    // No horizontal page scroll at any size: content must fit the screen.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${href} overflows horizontally`).toBeLessThanOrEqual(1);
  }
}

test("admin: every menu item opens a working screen", async ({ page }) => {
  await walkMenu(page, users!.admin);
});

test("teacher: every menu item opens a working screen", async ({ page }) => {
  await walkMenu(page, users!.teacher);
});

test("unknown address shows the Hebrew not-found page", async ({ page }) => {
  await login(page, users!.admin);
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "הדף שחיפשת לא נמצא" })).toBeVisible();
  await expect(page.getByRole("link", { name: "חזרה לדף הבית" })).toBeVisible();
});

test("a teacher cannot open admin screens", async ({ page }) => {
  await login(page, users!.teacher);
  for (const path of ["/admin", "/admin/users", "/admin/reports", "/admin/settings"]) {
    await page.goto(path);
    await expect(page, path).not.toHaveURL(new RegExp(`${path}$`));
  }
});

// Automatic accessibility scan (WCAG A/AA) of the main screens, per role.
const SCANNED = {
  admin: ["/admin", "/admin/calendar", "/admin/students", "/admin/teachers", "/admin/requests", "/admin/reports", "/notifications", "/admin/settings", "/profile"],
  teacher: ["/teacher", "/teacher/calendar", "/teacher/requests", "/teacher/students", "/teacher/availability"],
} as const;

for (const [role, paths] of Object.entries(SCANNED)) {
  test(`accessibility scan: ${role} screens have no serious violations`, async ({ page }) => {
    await login(page, users![role as "admin" | "teacher"]);
    const problems: string[] = [];
    for (const path of paths) {
      await visit(page, path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of result.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
        problems.push(`${path} — ${v.id}: ${v.nodes.length} element(s), e.g. ${v.nodes[0]?.html.slice(0, 160)}`);
      }
    }
    expect(problems).toEqual([]);
  });
}

test("login page is accessible", async ({ page }) => {
  await page.goto("/login");
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});
