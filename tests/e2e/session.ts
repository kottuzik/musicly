import { expect, type Cookie, type Page } from "@playwright/test";
import type { TestUser } from "../test-users";

// Supabase limits password sign-ins per IP, and a full run signs in hundreds of times.
// So each test user signs in through the UI once per worker; later tests reuse the session cookies.
const cookieCache = new Map<string, Cookie[]>();

async function uiLogin(page: Page, user: TestUser) {
  await page.goto("/login");
  await page.getByLabel("אימייל").fill(user.email);
  await page.getByLabel("סיסמה", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "התחברות" }).click();
  // Development is reached over the internet and can stall for several seconds, so allow time.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

export async function login(page: Page, user: TestUser) {
  const cached = cookieCache.get(user.email);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto("/login");
    if (!/\/login/.test(page.url())) return;
    // Session was revoked or expired: fall back to a real sign-in.
    await page.context().clearCookies();
    cookieCache.delete(user.email);
  }
  await uiLogin(page, user);
  cookieCache.set(user.email, await page.context().cookies());
}

// Call after a test signs the user out: sign-out revokes the user's sessions everywhere.
export function forgetSession(user: TestUser) {
  cookieCache.delete(user.email);
}
