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

test("each page has its own title, so screen readers announce route changes", async ({ page }) => {
  await login(page, users!.admin);
  await visit(page, "/admin/students");
  await expect(page).toHaveTitle("תלמידים · מוזיקלי");
  await visit(page, "/admin/teachers");
  await expect(page).toHaveTitle("מורים · מוזיקלי");
});

test("closing a dialog returns focus to the button that opened it", async ({ page, browserName }) => {
  await login(page, users!.admin);
  await visit(page, "/admin");
  const opener = page.getByRole("button", { name: "שיעור חדש" });
  const dialog = page.getByRole("dialog");

  // Closed with Esc.
  await opener.focus();
  await page.keyboard.press("Space");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  // Closed with the X button. WebKit does not focus a button on click, so after a mouse
  // opening there is no focused opener to return to; the keyboard case above covers WebKit.
  if (browserName === "webkit") return;
  await opener.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "סגירה" }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("a form with errors moves focus to the first invalid field", async ({ page }) => {
  await login(page, users!.admin);
  await visit(page, "/admin/students");
  await page.getByRole("button", { name: "תלמיד חדש" }).click();
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", { name: "שמירה" });
  const fullName = dialog.getByLabel("שם מלא");

  // Saved empty: the server rejects it, nothing is created.
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(fullName).toHaveAttribute("aria-invalid", "true");
  await expect(fullName).toBeFocused();

  // The same error a second time still moves focus.
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(fullName).toBeFocused();
});

test("the AI assistant button never covers the focused element on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 290, height: 640 });
  await login(page, users!.admin);
  await visit(page, "/admin/settings/hours");
  const launcher = page.getByRole("button", { name: "פתיחת עוזר AI" });
  await expect(launcher).toBeVisible();
  const covered: string[] = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const hit = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const btn = document.querySelector<HTMLElement>('button[aria-label="פתיחת עוזר AI"]');
      if (!el || !btn || el === btn || el === document.body) return null;
      const a = el.getBoundingClientRect();
      const b = btn.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return overlap > 0 ? `${el.tagName} ${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30)}` : null;
    });
    if (hit) covered.push(hit);
  }
  expect(covered).toEqual([]);
});

test("placeholder text has enough contrast (4.5:1)", async ({ page }) => {
  await login(page, users!.admin);
  await visit(page, "/admin/students");
  const ratio = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("input[placeholder]")!;
    const rgb = (c: string) => c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fg = lum(rgb(getComputedStyle(input, "::placeholder").color));
    const bg = lum(rgb(getComputedStyle(input).backgroundColor));
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

test("the border of a field with an error has enough contrast (3:1)", async ({ page }) => {
  await login(page, users!.admin);
  await visit(page, "/admin/students");
  await page.getByRole("button", { name: "תלמיד חדש" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "שמירה" }).click();
  const fullName = dialog.getByLabel("שם מלא");
  await expect(fullName).toHaveAttribute("aria-invalid", "true");
  const ratio = await fullName.evaluate((input) => {
    const rgb = (c: string) => c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    (input as HTMLElement).blur();
    const fg = lum(rgb(getComputedStyle(input).borderTopColor));
    const bg = lum(rgb(getComputedStyle(input.closest("[role=dialog]")!).backgroundColor));
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(3);
});

test("the focus ring stays visible in Windows high contrast (forced colors) mode", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Forced colors emulation is Chromium-only.");
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/login");
  const outline = () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.activeElement!);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor };
    });
  // A text field, then a button: both must draw a real outline (box-shadow is removed in this mode).
  await page.getByLabel("אימייל").focus();
  for (const target of [page.getByLabel("אימייל"), page.getByRole("button", { name: "התחברות" })]) {
    await target.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const o = await outline();
    expect(o.style).not.toBe("none");
    expect(o.width).toBeGreaterThan(0);
    expect(o.color).not.toBe("rgba(0, 0, 0, 0)");
  }
});
