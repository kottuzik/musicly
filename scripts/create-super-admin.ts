// Creates the first Super Admin in the Development project (no password yet).
// Usage: npm run create-super-admin -- --email you@example.com --name "Full Name"
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

const { values } = parseArgs({
  options: { email: { type: "string" }, name: { type: "string" } },
});
const email = values.email?.trim().toLowerCase() ?? "";
const fullName = values.name?.trim() ?? "";
if (!email || !fullName) {
  console.error('Usage: npm run create-super-admin -- --email <email> --name "<full name>"');
  process.exit(1);
}

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const admin = createClient(url, requireEnv("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { count, error: countError, status } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin");
  if (countError) {
    throw new Error(`Could not read profiles (HTTP ${status}, ${countError.code || countError.message || "no details"})`);
  }
  if ((count ?? 0) > 0) {
    console.error("A Super Admin already exists. Further admins are managed inside the app.");
    process.exit(1);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error(`Could not create auth user: ${createError?.message}`);

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    email,
    role: "super_admin",
    status: "active",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(`Could not create profile: ${profileError.message}`);
  }

  // The password link is requested from the app ("שכחת סיסמה?") so it opens in the same browser,
  // which the default Supabase email flow (PKCE) requires.
  console.log("Super Admin created. Set a password via 'שכחת סיסמה?' on the login page.");
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
