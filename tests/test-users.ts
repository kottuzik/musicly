import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env", quiet: true });

export type TestUser = { id: string; email: string; password: string };
export type TestUsers = Record<"superAdmin" | "admin" | "admin2" | "adminInactive" | "teacher" | "teacher2" | "teacherInactive" | "noProfile", TestUser>;

const FILE = "tests/.test-users.json";

// Test credentials created by `npm run seed-test-users` (Development only).
export function loadTestUsers(): TestUsers | null {
  // Tests create and delete data, so they never run against the Production project.
  if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("culqeemdrhuvzweessra")) return null;
  if (!existsSync(FILE) || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return JSON.parse(readFileSync(FILE, "utf8")) as TestUsers;
}
