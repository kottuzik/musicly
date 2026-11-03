import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestUsers } from "../test-users";
import { login } from "./session";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const RUN = `e2e-del-${Date.now()}`;
const PASSWORD = "Test-pass-12345!";
const FULL_FLOW_PROJECTS = ["desktop", "mobile"];

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.afterAll(async ({}, testInfo) => {
  if (!users || !FULL_FLOW_PROJECTS.includes(testInfo.project.name)) return;
  test.setTimeout(60_000);
  const db = service();
  await db.from("students").delete().like("full_name", `${RUN}%`);
  const { data: teachers } = await db.from("teachers").select("id, profile_id").like("full_name", `${RUN}%`);
  for (const t of teachers ?? []) {
    await db.from("teacher_skills").delete().eq("teacher_id", t.id);
    await db.from("teachers").delete().eq("id", t.id);
    if (t.profile_id) await db.auth.admin.deleteUser(t.profile_id);
  }
});

test("an admin deletes a student, finds them under 'recently deleted' and restores them", async ({ page }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  const db = service();
  const name = `${RUN} תלמיד`;
  const { data: student } = await db.from("students").insert({ full_name: name, birth_date: "2012-01-01" }).select("id").single();

  await login(page, users!.admin);
  await page.goto(`/admin/students/${student!.id}`);
  await page.getByRole("button", { name: "מחיקת תלמיד" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("אפשר לשחזר אותו במשך 30 יום");
  await dialog.getByRole("button", { name: "מחק תלמיד" }).click();

  await expect(page).toHaveURL(/\/admin\/students/);
  await expect(page.getByText("נמחק. אפשר לשחזר")).toBeVisible();
  await page.goto(`/admin/students?q=${encodeURIComponent(RUN)}`);
  await expect(page.getByRole("link", { name })).toHaveCount(0);
  await page.goto(`/admin/students/${student!.id}`);
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toHaveCount(0);

  await page.goto("/admin/students?view=deleted");
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("נותרו");
  await row.getByRole("button", { name: "שחזור" }).click();
  const restore = page.getByRole("dialog");
  // No status is preselected: confirming without a choice is refused.
  await restore.getByRole("button", { name: "שחזור" }).click();
  await expect(restore).toContainText("יש לבחור את הסטטוס");
  await restore.getByLabel("לא פעיל").check();
  await restore.getByRole("button", { name: "שחזור" }).click();
  await expect(restore).toBeHidden();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);

  await page.goto(`/admin/students/${student!.id}`);
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
});

test("a deleted teacher cannot sign in, and restoring needs an availability choice", async ({ page, browser }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  const db = service();
  const email = `${RUN}-teacher@example.test`;
  const name = `${RUN} מורה`;
  const { data: u } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  await db.from("profiles").insert({ id: u.user!.id, full_name: name, email, role: "teacher", status: "active" });
  const { data: teacher } = await db.from("teachers").insert({ full_name: name, email, profile_id: u.user!.id }).select("id").single();

  await login(page, users!.admin);
  await page.goto(`/admin/teachers/${teacher!.id}`);
  await page.getByRole("button", { name: "מחיקת מורה" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "מחק מורה" }).click();
  await expect(page).toHaveURL(/\/admin\/teachers/);
  await expect(page.getByRole("link", { name })).toHaveCount(0);

  // The deleted teacher signs in, but gets no access.
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto("/login");
  await other.getByLabel("אימייל").fill(email);
  await other.getByLabel("סיסמה", { exact: true }).fill(PASSWORD);
  await other.getByRole("button", { name: "התחברות" }).click();
  await expect(other).toHaveURL(/account-unavailable/);
  await context.close();

  await page.goto("/admin/teachers?view=deleted");
  const row = page.getByRole("row", { name: new RegExp(name) });
  await row.getByRole("button", { name: "שחזור" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("פעיל", { exact: true }).check();
  await expect(dialog.getByText("מה לעשות עם הזמינות השבועית")).toBeVisible();
  await dialog.getByRole("button", { name: "שחזור" }).click();
  await expect(dialog).toContainText("יש לבחור מה לעשות עם הזמינות");
  await dialog.getByLabel("לבקש מהמורה להגדיר זמינות חדשה").check();
  await dialog.getByRole("button", { name: "שחזור" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);
  await page.goto(`/admin/teachers/${teacher!.id}`);
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible();
});
