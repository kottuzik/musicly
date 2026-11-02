"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { findHoliday } from "@/lib/holidays/israeli";
import { schoolToday } from "@/lib/students/age";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time/weekdays";
import { fieldErrors } from "@/lib/validation/auth";
import { closureSchema } from "@/lib/validation/availability";

function revalidateClosures() {
  revalidatePath("/admin/settings/closures");
  revalidatePath("/teacher/availability");
}

// The holiday's name and dates are computed on the server from its key, never taken from the form.
export async function addHolidayClosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const today = schoolToday();
  const holiday = findHoliday(String(formData.get("key") ?? ""), today, addDays(today, 366));
  if (!holiday) return { error: dbErrorMessage({ message: "not_found" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_closure", {
    p_name: holiday.name,
    p_start_date: holiday.startDate,
    p_end_date: holiday.endDate,
    p_holiday_key: holiday.key,
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidateClosures();
  return { ok: true };
}

export async function addCustomClosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const parsed = closureSchema.safeParse({
    name: formData.get("name"),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_closure", {
    p_name: parsed.data.name,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_holiday_key: "",
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidateClosures();
  return { ok: true };
}

export type ClosureLesson = {
  lessonId: string;
  startAt: string;
  endAt: string;
  studentName: string;
  teacherName: string;
  lessonTypeName: string;
  // False when the lesson's time was taken while the day was closed: it cannot come back.
  free: boolean;
};

// Lessons "not held" because of the closure, for the admin to choose which come back.
export async function getClosureImpact(id: string): Promise<ClosureLesson[]> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { data } = await supabase.rpc("closure_impact", { p_id: id });
  return (data ?? []).map((l) => ({
    lessonId: l.lesson_id,
    startAt: l.start_at,
    endAt: l.end_at,
    studentName: l.student_name,
    teacherName: l.teacher_name,
    lessonTypeName: l.lesson_type_name,
    free: l.free,
  }));
}

// Fields: id; "choose" = true with one "restore" value per lesson to bring back (the rest are
// cancelled). Without "choose", every lesson that is still free comes back.
export async function cancelClosure(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const choose = formData.get("choose") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_closure", {
    p_id: String(formData.get("id") ?? ""),
    ...(choose ? { p_restore: formData.getAll("restore").map(String) } : {}),
  });
  revalidateClosures();
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  if (error) {
    const failed = error.message === "decision_failed" ? (error as { details?: string }).details : undefined;
    return { error: dbErrorMessage(error), failedId: failed };
  }
  const result = data as { restored: number; cancelled: number };
  return {
    ok: true,
    success: result.restored || result.cancelled ? `יום הסגירה בוטל. ${result.restored} שיעורים שוחזרו, ${result.cancelled} בוטלו.` : undefined,
  };
}
