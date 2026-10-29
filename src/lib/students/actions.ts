"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { requireProfile } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { professionalInfoSchema } from "@/lib/validation/students";
import type { StudentLevel } from "./labels";

// Shared by admins and teachers. Who may edit which enrollment is decided by the database
// from the signed-in user; no role or teacher id is taken from the form.
export async function updateProfessionalInfo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const id = String(formData.get("id") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const parsed = professionalInfoSchema.safeParse({
    level: String(formData.get("level") ?? ""),
    background: String(formData.get("background") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_professional_info", {
    p_id: id,
    p_level: parsed.data.level as StudentLevel,
    p_background: parsed.data.background,
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath(`/teacher/students/${studentId}`);
  revalidatePath("/admin/students");
  revalidatePath("/teacher/students");
  return { ok: true };
}
