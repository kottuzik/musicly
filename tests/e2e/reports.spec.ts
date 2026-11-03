import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { loadTestUsers } from "../test-users";
import { login } from "./session";

const users = loadTestUsers();
test.skip(!users, "Run `npm run seed-test-users` first (needs .env for Development).");

const FULL_FLOW_PROJECTS = ["desktop", "mobile"];
const RANGE = "from=2026-01-01&to=2026-03-31";

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.afterAll(async ({}, testInfo) => {
  if (!users || !FULL_FLOW_PROJECTS.includes(testInfo.project.name)) return;
  // Exports leave a log entry; the test run removes its own.
  await service().from("audit_events").delete().eq("action", "export_created").eq("actor_id", users.admin.id);
});

test("an admin reads the report and changes the period", async ({ page }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  await login(page, users!.admin);
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { level: 1, name: "דוחות" })).toBeVisible();
  await expect(page.getByText("שיעורים מבוטלים וימי סגירה אינם נספרים")).toBeVisible();
  await expect(page.getByRole("region", { name: "לפי מורה" })).toBeVisible();
  await expect(page.getByRole("region", { name: "לפי תחום" })).toBeVisible();

  await page.goto(`/admin/reports?${RANGE}`);
  await expect(page.getByLabel("מתאריך")).toHaveValue("2026-01-01");
  await expect(page.getByLabel("עד תאריך")).toHaveValue("2026-03-31");

  // A range over a year is refused with a clear message instead of a broken page.
  await page.goto("/admin/reports?from=2024-01-01&to=2026-03-31");
  await expect(page.getByRole("alert").filter({ hasText: "טווח התאריכים ארוך מדי" })).toBeVisible();
});

test("an admin downloads CSV files; a teacher can export only their own schedule", async ({ page }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  await login(page, users!.admin);

  const students = await page.request.get("/export/students");
  expect(students.status()).toBe(200);
  expect(students.headers()["content-type"]).toContain("text/csv");
  expect(students.headers()["cache-control"]).toBe("no-store");
  expect(students.headers()["content-disposition"]).toContain("attachment");
  const text = await students.text();
  expect(text.startsWith("﻿\"שם\"")).toBe(true);

  for (const kind of ["teachers", "report-teachers", "report-subjects"]) {
    const response = await page.request.get(`/export/${kind}?${RANGE}`);
    expect(response.status(), kind).toBe(200);
  }
  expect((await page.request.get("/export/schedule?from=2026-01-01&to=2026-01-31")).status()).toBe(200);
  expect((await page.request.get("/export/schedule?from=2024-01-01&to=2026-01-31")).status()).toBe(422);
  expect((await page.request.get("/export/students?status=deleted")).status()).toBe(422);
  expect((await page.request.get("/export/nothing")).status()).toBe(404);

  // The button on the students page downloads the same file.
  await page.goto("/admin/students");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "ייצוא ל־CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^תלמידים-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("teachers are refused everything but their own schedule; signed-out callers are sent to log in", async ({ page, browser }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  await login(page, users!.teacher);
  for (const kind of ["students", "teachers", "report-teachers", "report-subjects"]) {
    expect((await page.request.get(`/export/${kind}?${RANGE}`)).status(), kind).toBe(403);
  }
  expect((await page.request.get("/export/schedule?from=2026-01-01&to=2026-01-31")).status()).toBe(200);
  await page.goto("/admin/reports");
  await expect(page).toHaveURL(/\/forbidden/);

  await page.goto("/teacher/calendar");
  await expect(page.getByRole("link", { name: "ייצוא מערכת שעות" })).toBeVisible();
  await expect(page.getByRole("link", { name: "דוחות" })).toHaveCount(0);

  const anonymous = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  // Signed-out callers are sent to the login page and never reach the export.
  const signedOut = await anonymous.request.get("/export/students", { maxRedirects: 0 });
  expect(signedOut.status()).toBe(307);
  expect(signedOut.headers()["content-type"] ?? "").not.toContain("text/csv");
  await anonymous.close();
});

test("an inactive teacher cannot export", async ({ page }, testInfo) => {
  test.skip(!FULL_FLOW_PROJECTS.includes(testInfo.project.name), "full flows run on desktop and mobile");
  await login(page, users!.teacherInactive);
  expect((await page.request.get("/export/schedule?from=2026-01-01&to=2026-01-31")).status()).toBe(403);
});
