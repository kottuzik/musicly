"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { InviteState } from "@/components/invitations/CreateInviteButton";
import type { ActionState } from "@/lib/actions";
import { requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createInvitation } from "@/lib/invitations/create";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { adminInviteSchema } from "@/lib/validation/staff";

// Every action here is Super Admin only; the database functions check it again.
const SUPER_ADMIN = ["super_admin"] as const;
const PATH = "/admin/users";

export async function inviteAdmin(_prev: InviteState, formData: FormData): Promise<InviteState> {
  await requireRole(SUPER_ADMIN);
  const parsed = adminInviteSchema.safeParse({ fullName: formData.get("fullName"), email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const result = await createInvitation({ role: "admin", ...parsed.data });
  if (result.error === dbErrorMessage({ message: "email_taken" })) return { fieldErrors: { email: result.error } };
  if (result.ok) revalidatePath(PATH);
  return result;
}

export async function regenerateAdminInvitation(_prev: InviteState, formData: FormData): Promise<InviteState> {
  await requireRole(SUPER_ADMIN);
  const supabase = await createClient();
  const { data: invitations } = await supabase.rpc("list_open_invitations");
  const invitation = invitations?.find((i) => i.id === formData.get("id") && i.role === "admin");
  if (!invitation) return { error: dbErrorMessage({ message: "not_found" }) };

  const result = await createInvitation({ role: "admin", fullName: invitation.full_name, email: invitation.email });
  if (result.ok) revalidatePath(PATH);
  return result;
}

export async function setAdminStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(SUPER_ADMIN);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_status", {
    p_profile_id: String(formData.get("id") ?? ""),
    p_status: formData.get("status") === "inactive" ? "inactive" : "active",
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(PATH);
  return { ok: true };
}

export async function setAdminPermissions(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(SUPER_ADMIN);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_permissions", {
    p_profile_id: String(formData.get("id") ?? ""),
    p_delete_student_history: formData.get("deleteStudentHistory") === "on",
  });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath(PATH);
  return { ok: true };
}

export async function transferSuperAdmin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(SUPER_ADMIN);
  const target = String(formData.get("targetId") ?? "");
  if (!target) return { fieldErrors: { targetId: "יש לבחור מנהל" } };
  if (formData.get("confirm") !== "on") return { fieldErrors: { confirm: "יש לאשר את העברת התפקיד" } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_super_admin", { p_target_profile_id: target });
  if (error) return { error: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  redirect(`${PATH}?notice=transferred`);
}
