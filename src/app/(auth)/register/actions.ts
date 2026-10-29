"use server";

import { redirect } from "next/navigation";
import { homePathForRole } from "@/lib/auth/roles";
import { dbErrorMessage, GENERIC_ERROR } from "@/lib/errors";
import { hashInvitationToken } from "@/lib/invitations/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, resetPasswordSchema } from "@/lib/validation/auth";
import { findValidInvitation } from "./invitation";

export type RegisterState = { error?: string; fieldErrors?: Record<string, string> };

const INVALID = dbErrorMessage({ message: "invitation_invalid" });

// Creates the account for an invitation. The role comes only from the invitation record
// in the database; nothing in the form can choose it.
export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const token = String(formData.get("token") ?? "");
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const invitation = await findValidInvitation(token);
  if (!invitation) return { error: INVALID };

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    if (createError?.code === "weak_password") return { fieldErrors: { password: "הסיסמה חלשה מדי. בחרו סיסמה ארוכה ומגוונת יותר." } };
    if (createError?.code === "email_exists") return { error: "כתובת האימייל כבר רשומה במערכת. נסו להתחבר." };
    console.error("Registration: createUser failed", createError?.status, createError?.code);
    return { error: GENERIC_ERROR };
  }

  const { data: role, error: acceptError } = await admin.rpc("accept_invitation", {
    p_token_hash: hashInvitationToken(token),
    p_user_id: created.user.id,
  });
  if (acceptError || !role) {
    // Never leave an auth account without a role.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: acceptError?.message === "invitation_invalid" ? INVALID : GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: invitation.email,
    password: parsed.data.password,
  });
  if (signInError) redirect("/login?notice=registered");

  redirect(homePathForRole(role));
}
