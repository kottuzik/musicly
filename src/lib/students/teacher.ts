import "server-only";
import { redirect } from "next/navigation";
import { TEACHER_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Students are visible to active teachers only; an inactive teacher may only view their lesson history.
export async function requireActiveTeacher() {
  const profile = await requireRole(TEACHER_ROLES);
  if (profile.status !== "active") redirect("/teacher");
  const supabase = await createClient();
  const { data: teacher } = await supabase.from("teachers").select("id").eq("profile_id", profile.id).maybeSingle();
  return { profile, teacherId: teacher?.id ?? null, supabase };
}
