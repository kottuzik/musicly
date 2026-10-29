import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";
import { loadTestUsers, type TestUser } from "../test-users";

const users = loadTestUsers();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

function newClient() {
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signedIn(user: TestUser) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

describe.skipIf(!users)("RLS on profiles (Development)", () => {
  let admin: SupabaseClient<Database>;
  let adminInactive: SupabaseClient<Database>;
  let teacher: SupabaseClient<Database>;
  let teacherInactive: SupabaseClient<Database>;
  let noProfile: SupabaseClient<Database>;

  beforeAll(async () => {
    [admin, adminInactive, teacher, teacherInactive, noProfile] = await Promise.all([
      signedIn(users!.admin),
      signedIn(users!.adminInactive),
      signedIn(users!.teacher),
      signedIn(users!.teacherInactive),
      signedIn(users!.noProfile),
    ]);
  });

  it("anonymous visitors cannot read any profile", async () => {
    const { data, error } = await newClient().from("profiles").select("id");
    expect(error ?? data?.length === 0).toBeTruthy();
    expect(data ?? []).toHaveLength(0);
  });

  it("a teacher sees only their own profile", async () => {
    const { data, error } = await teacher.from("profiles").select("id");
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toEqual([users!.teacher.id]);
  });

  it("an inactive teacher still sees only their own profile", async () => {
    const { data } = await teacherInactive.from("profiles").select("id");
    expect(data!.map((r) => r.id)).toEqual([users!.teacherInactive.id]);
  });

  it("an active admin sees other profiles", async () => {
    const { data, error } = await admin.from("profiles").select("id");
    expect(error).toBeNull();
    const ids = data!.map((r) => r.id);
    expect(ids).toContain(users!.teacher.id);
    expect(ids).toContain(users!.admin.id);
  });

  it("an inactive admin is not treated as admin", async () => {
    const { data } = await adminInactive.from("profiles").select("id");
    expect(data!.map((r) => r.id)).toEqual([users!.adminInactive.id]);
    const { data: isAdmin } = await adminInactive.rpc("is_admin");
    expect(isAdmin).toBe(false);
  });

  it("is_admin reflects the database role", async () => {
    expect((await admin.rpc("is_admin")).data).toBe(true);
    expect((await teacher.rpc("is_admin")).data).toBe(false);
  });

  it("a user without a profile sees nothing", async () => {
    const { data } = await noProfile.from("profiles").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("users cannot change their own role or status", async () => {
    const { error } = await teacher
      .from("profiles")
      .update({ role: "super_admin", status: "active" })
      .eq("id", users!.teacher.id);
    expect(error).not.toBeNull();

    const { data } = await teacher.from("profiles").select("role").eq("id", users!.teacher.id).single();
    expect(data!.role).toBe("teacher");
  });

  it("admins cannot write profiles directly from the client either", async () => {
    const { error } = await admin.from("profiles").update({ full_name: "x" }).eq("id", users!.teacher.id);
    expect(error).not.toBeNull();
  });

  it("users cannot create a profile for themselves", async () => {
    const { error } = await noProfile.from("profiles").insert({
      id: users!.noProfile.id,
      full_name: "Self",
      email: users!.noProfile.email,
      role: "admin",
    });
    expect(error).not.toBeNull();
  });

  it("users cannot delete profiles", async () => {
    const { error } = await admin.from("profiles").delete().eq("id", users!.teacher.id);
    expect(error).not.toBeNull();
  });
});
