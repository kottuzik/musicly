import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestUsers } from "../test-users";
import { login } from "./session";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const FULL_FLOW_PROJECTS = ["desktop", "mobile"];

test.afterAll(async ({}, testInfo) => {
  if (!users || !FULL_FLOW_PROJECTS.includes(testInfo.project.name)) return;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await db.from("ai_usage").delete().eq("user_id", users.admin.id);
});

test("an admin asks the assistant a question and gets an answer", async ({ page }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  await login(page, users!.admin);
  await page.goto("/admin");
  // The assistant is a floating widget: closed until the button is pressed.
  await expect(page.getByRole("dialog", { name: "עוזר AI" })).toHaveCount(0);
  await page.getByRole("button", { name: "פתיחת עוזר AI" }).click();
  const panel = page.getByRole("dialog", { name: "עוזר AI" });
  await expect(panel).toBeVisible();
  await expect(page.getByText("השיחה אינה נשמרת")).toBeVisible();
  // Keyboard users land in the question box.
  await expect(page.getByLabel("שאל שאלה...")).toBeFocused();

  await page.getByLabel("שאל שאלה...").fill("אילו מורים יש בבית הספר?");
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByRole("list", { name: "השיחה" })).toContainText("תשובת בדיקה מהעוזר", { timeout: 20_000 });

  // The page stays usable on a phone: nothing is wider than the screen.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  await page.getByRole("button", { name: "שיחה חדשה" }).click();
  await expect(page.getByText("במה אפשר לעזור")).toBeVisible();

  // It can fill the screen, shrink back and be closed; the conversation survives a page change.
  await page.getByLabel("שאל שאלה...").fill("שאלה נוספת");
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByRole("list", { name: "השיחה" })).toContainText("תשובת בדיקה מהעוזר", { timeout: 20_000 });
  await page.getByRole("button", { name: "הרחבה למסך מלא" }).click();
  const box = await panel.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
  await page.getByRole("button", { name: "הקטנת החלון" }).click();
  if (testInfo.project.name === "desktop") {
    // A client-side page change keeps the widget (and the conversation) as it was.
    await page.getByRole("link", { name: "דוחות" }).click();
    await expect(page).toHaveURL(/\/admin\/reports/);
    await expect(page.getByRole("list", { name: "השיחה" })).toContainText("תשובת בדיקה מהעוזר", { timeout: 20_000 });
  }
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  // Closing returns focus to the button that opened it.
  await expect(page.getByRole("button", { name: "פתיחת עוזר AI" })).toBeFocused();
});

test("when the AI service fails the assistant says so and the rest of the system keeps working", async ({ page }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  await login(page, users!.admin);
  await page.goto("/admin");
  await page.getByRole("button", { name: "פתיחת עוזר AI" }).click();
  await page.getByLabel("שאל שאלה...").fill("בדיקת שגיאה");
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "העוזר אינו זמין כרגע" })).toBeVisible();

  await page.getByLabel("שאל שאלה...").fill("תשובה ריקה בבקשה");
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "לא הצלחתי לנסח תשובה" })).toBeVisible();

  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { level: 1, name: "דוחות" })).toBeVisible();
});

test("a teacher never reaches the assistant", async ({ page }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  await login(page, users!.teacher);
  await page.goto("/teacher");
  await expect(page.getByRole("button", { name: "פתיחת עוזר AI" })).toHaveCount(0);
  const response = await page.request.post("/api/assistant", { data: { messages: [{ role: "user", content: "שלום" }] } });
  expect(response.status()).toBe(403);
  expect(await response.text()).not.toContain("תשובת בדיקה");
});

test("signed-out callers and malformed questions are refused", async ({ page, browser }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  const anonymous = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const signedOut = await anonymous.request.post("/api/assistant", { data: { messages: [{ role: "user", content: "שלום" }] }, maxRedirects: 0 });
  expect(signedOut.status()).toBe(307);
  await anonymous.close();

  await login(page, users!.admin);
  const tooLong = await page.request.post("/api/assistant", { data: { messages: [{ role: "user", content: "א".repeat(1001) }] } });
  expect(tooLong.status()).toBe(422);
  const empty = await page.request.post("/api/assistant", { data: { messages: [] } });
  expect(empty.status()).toBe(422);
  const endsWithAssistant = await page.request.post("/api/assistant", {
    data: { messages: [{ role: "user", content: "שלום" }, { role: "assistant", content: "היי" }] },
  });
  expect(endsWithAssistant.status()).toBe(422);
});
