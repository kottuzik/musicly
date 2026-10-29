"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import type { ReturnMode, StudentLevel } from "@/lib/students/labels";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { studentSchema, studentStatusSchema, studentSubjectSchema } from "@/lib/validation/students";

function revalidateStudents(id?: string) {
  revalidatePath("/admin/students");
  revalidatePath("/teacher/students");
  if (id) {
    revalidatePath(`/admin/students/${id}`);
    revalidatePath(`/teacher/students/${id}`);
  }
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

export async function saveStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const id = text(formData, "id") || null;
  const parsed = studentSchema.safeParse({
    fullName: formData.get("fullName"),
    birthDate: text(formData, "birthDate"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    parentName: text(formData, "parentName"),
    parentPhone: text(formData, "parentPhone"),
    parentEmail: text(formData, "parentEmail"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: studentId, error } = await supabase.rpc("save_student", {
    p_id: id as unknown as string,
    p_full_name: parsed.data.fullName,
    p_birth_date: parsed.data.birthDate,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email,
    p_parent_name: parsed.data.parentName,
    p_parent_phone: parsed.data.parentPhone,
    p_parent_email: parsed.data.parentEmail,
  });
  if (error || !studentId) {
    if (error?.message === "birth_date_future") return { fieldErrors: { birthDate: dbErrorMessage(error) } };
    return { error: dbErrorMessage(error) };
  }

  revalidateStudents(studentId);
  if (!id) redirect(`/admin/students/${studentId}?tab=subjects&notice=created`);
  return { ok: true };
}

export async function setStudentStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const id = text(formData, "id");
  const parsed = studentStatusSchema.safeParse({
    status: text(formData, "status"),
    returnDate: text(formData, "returnDate"),
    returnMode: text(formData, "returnMode") || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const inactive = parsed.data.status === "inactive" ? parsed.data : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_student_status", {
    p_id: id,
    p_status: parsed.data.status,
    p_return_date: (inactive?.returnDate || null) as unknown as string,
    p_return_mode: (inactive?.returnDate ? inactive.returnMode : null) as unknown as ReturnMode,
  });
  if (error) {
    const message = dbErrorMessage(error);
    if (error.message === "return_mode_required") return { fieldErrors: { returnMode: message } };
    if (error.message === "return_date_past") return { fieldErrors: { returnDate: message } };
    return { error: message };
  }
  revalidateStudents(id);
  return { ok: true };
}

export async function saveStudentSubject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const id = text(formData, "id") || null;
  const studentId = text(formData, "studentId");
  const parsed = studentSubjectSchema.safeParse({
    lessonTypeId: text(formData, "lessonTypeId"),
    teacherId: text(formData, "teacherId"),
    level: text(formData, "level"),
    background: text(formData, "background"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_student_subject", {
    p_id: id as unknown as string,
    p_student_id: studentId,
    p_lesson_type_id: parsed.data.lessonTypeId,
    p_teacher_id: parsed.data.teacherId,
    p_level: parsed.data.level as StudentLevel,
    p_background: parsed.data.background,
  });
  if (error) {
    const message = dbErrorMessage(error);
    if (error.message === "subject_taken") return { fieldErrors: { lessonTypeId: message } };
    if (error.message === "teacher_not_qualified" || error.message === "teacher_inactive") {
      return { fieldErrors: { teacherId: message } };
    }
    return { error: message };
  }
  revalidateStudents(studentId);
  return { ok: true };
}

export async function removeStudentSubject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_student_subject", { p_id: text(formData, "id") });
  if (error) return { error: dbErrorMessage(error) };
  revalidateStudents(text(formData, "studentId"));
  return { ok: true };
}
