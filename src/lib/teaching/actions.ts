"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

// An admin turns teaching on or off for themself; the super admin also for other admins. The
// database functions enforce who may do what.
function revalidateTeaching() {
  revalidatePath("/", "layout");
}

export async function enableTeaching(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const lessonTypeIds = formData.getAll("lessonTypeIds").map(String);
  if (!lessonTypeIds.length) return { fieldErrors: { lessonTypeIds: dbErrorMessage({ message: "skills_required" }) } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("enable_admin_teaching", {
    p_profile_id: String(formData.get("id") ?? ""),
    p_lesson_type_ids: lessonTypeIds,
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidateTeaching();
  return { ok: true, success: "פרטי ההוראה נשמרו." };
}

export async function stopTeaching(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { error } = await supabase.rpc("stop_admin_teaching", { p_profile_id: String(formData.get("id") ?? "") });
  if (error) return { error: dbErrorMessage(error) };
  revalidateTeaching();
  return { ok: true };
}
