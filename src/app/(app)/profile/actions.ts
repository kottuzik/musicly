"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { requireProfile } from "@/lib/auth/session";
import { dbErrorMessage, GENERIC_ERROR } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, fieldErrors } from "@/lib/validation/auth";
import { profileSchema } from "@/lib/validation/staff";

export async function updateOwnProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = profileSchema.safeParse({ fullName: formData.get("fullName"), phone: formData.get("phone") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_profile", {
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath("/", "layout");
  return { ok: true, success: "הפרטים נשמרו." };
}

export async function changePassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireProfile();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  // Confirm the current password before allowing a change.
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) return { fieldErrors: { currentPassword: "הסיסמה הנוכחית שגויה" } };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "הסיסמה החדשה חייבת להיות שונה מהנוכחית." } };
    if (error.code === "weak_password") return { fieldErrors: { password: "הסיסמה חלשה מדי. בחרו סיסמה ארוכה ומגוונת יותר." } };
    return { error: GENERIC_ERROR };
  }
  return { ok: true, success: "הסיסמה עודכנה." };
}
