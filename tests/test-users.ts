import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env", quiet: true });

export type TestUser = { id: string; email: string; password: string };
export type TestUsers = Record<"admin" | "adminInactive" | "teacher" | "teacherInactive" | "noProfile", TestUser>;

const FILE = "tests/.test-users.json";

// Test credentials created by `npm run seed-test-users` (Development only).
export function loadTestUsers(): TestUsers | null {
  if (!existsSync(FILE) || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  return JSON.parse(readFileSync(FILE, "utf8")) as TestUsers;
}
