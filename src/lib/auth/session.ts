import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasAppAccess, type Profile, type Role } from "@/lib/auth/roles";

// Reads the signed-in user's profile from the database (RLS: own row only).
// Never trusts role data sent by the client.
export const getCurrentProfile = cache(async (): Promise<{ userId: string | null; profile: Profile | null }> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;
  if (!userId) return { userId: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, status, deleted_at")
    .eq("id", userId)
    .maybeSingle();

  return { userId, profile };
});

export async function requireProfile(): Promise<Profile> {
  const { userId, profile } = await getCurrentProfile();
  if (!userId) redirect("/login");
  if (!profile || !hasAppAccess(profile)) redirect("/account-unavailable");
  return profile;
}

// The active teachers row of the signed-in user: a teacher, or an admin who also teaches.
export const getTeachingId = cache(async (): Promise<string | null> => {
  const { profile } = await getCurrentProfile();
  if (!profile) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("teachers")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("status", "active")
    .maybeSingle();
  return data?.id ?? null;
});

// Teacher actions: open to teachers, and to admins whose teaching is on.
export async function requireTeaching(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "teacher" && !(await getTeachingId())) redirect("/forbidden");
  return profile;
}

export async function requireRole(roles: readonly Role[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/forbidden");
  return profile;
}
