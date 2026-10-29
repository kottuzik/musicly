"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { InviteState } from "@/components/invitations/CreateInviteButton";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createInvitation } from "@/lib/invitations/create";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { teacherSchema } from "@/lib/validation/staff";

function revalidateTeachers(id?: string) {
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/users");
  if (id) revalidatePath(`/admin/teachers/${id}`);
}

export async function saveTeacher(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const id = String(formData.get("id") ?? "") || null;
  const parsed = teacherSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    lessonTypeIds: formData.getAll("lessonTypeIds"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: teacherId, error } = await supabase.rpc("save_teacher", {
    p_id: id as unknown as string,
    p_full_name: parsed.data.fullName,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_lesson_type_ids: parsed.data.lessonTypeIds,
  });
  if (error || !teacherId) {
    const message = dbErrorMessage(error);
    if (error?.message === "email_taken" || error?.message === "email_locked") return { fieldErrors: { email: message } };
    if (error?.message === "skills_required" || error?.message === "skill_in_use") return { fieldErrors: { lessonTypeIds: message } };
    return { error: message };
  }

  revalidateTeachers(teacherId);
  if (!id) redirect(`/admin/teachers/${teacherId}?notice=created`);
  return { ok: true };
}

export async function setTeacherStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "inactive" ? "inactive" : "active";
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_teacher_status", { p_teacher_id: id, p_status: status });
  if (error) return { error: dbErrorMessage(error) };
  revalidateTeachers(id);
  return { ok: true };
}

export async function createTeacherInvitation(_prev: InviteState, formData: FormData): Promise<InviteState> {
  await requireRole(ADMIN_ROLES);
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { data: teacher } = await supabase.from("teachers").select("full_name, email").eq("id", id).maybeSingle();
  if (!teacher) return { error: dbErrorMessage({ message: "not_found" }) };

  const result = await createInvitation({ role: "teacher", teacherId: id, fullName: teacher.full_name, email: teacher.email });
  if (result.ok) revalidateTeachers(id);
  return result;
}

export async function revokeInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: String(formData.get("id") ?? "") });
  if (error) return { error: dbErrorMessage(error) };
  revalidateTeachers(String(formData.get("teacherId") ?? "") || undefined);
  return { ok: true };
}
