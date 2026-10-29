"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessPath, hasAppAccess, homePathForRole, safeNextPath } from "@/lib/auth/roles";
import { fieldErrors, forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/lib/validation/auth";

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  values?: { email?: string };
};

const GENERIC_ERROR = "אירעה שגיאה. נסו שוב בעוד רגע.";

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { email } };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    // Same message for unknown user and wrong password: do not reveal which accounts exist.
    const isCredentialsError = !error || error.status === 400;
    return { error: isCredentialsError ? "האימייל או הסיסמה שגויים" : GENERIC_ERROR, values: { email } };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || !hasAppAccess(profile)) redirect("/account-unavailable");

  const next = safeNextPath(String(formData.get("next") ?? ""));
  redirect(next && canAccessPath(profile.role, next) ? next : homePathForRole(profile.role));
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { email } };

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/reset-password`,
  });
  if (error && error.status !== 429 && error.status !== 400) {
    console.error("Password reset request failed", error.status, error.code);
    return { error: GENERIC_ERROR, values: { email } };
  }

  // Same message whether or not the address exists.
  return { success: "אם הכתובת רשומה במערכת, נשלח אליה קישור לאיפוס הסיסמה. הקישור תקף לזמן מוגבל." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { error: "הקישור לאיפוס הסיסמה פג או אינו תקין. בקשו קישור חדש." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { error: "הסיסמה החדשה חייבת להיות שונה מהסיסמה הקודמת." };
    if (error.code === "weak_password") return { error: "הסיסמה חלשה מדי. בחרו סיסמה ארוכה ומגוונת יותר." };
    return { error: GENERIC_ERROR };
  }

  redirect("/?notice=password-updated");
}
