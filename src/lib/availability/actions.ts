"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { isAdminRole } from "@/lib/auth/roles";
import { requireProfile, requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { lessonDecisionsSchema } from "@/lib/validation/lessons";
import {
  absenceSchema,
  availabilitySlotSchema,
  decisionSchema,
  removalSchema,
  requestVersionSchema,
} from "@/lib/validation/availability";

// After an admin's direct change, how many upcoming lessons it hit (they are flagged "needs attention").
async function flaggedMessage(supabase: Awaited<ReturnType<typeof createClient>>, requestId: string, done: string) {
  const { data } = await supabase.rpc("availability_request_impact", { p_request_id: requestId });
  const count = data?.length ?? 0;
  if (!count) return undefined;
  const lessons = count === 1 ? "שיעור עתידי אחד" : `${count} שיעורים עתידיים`;
  return `${done} ${lessons} ${count === 1 ? "סומן" : "סומנו"} ”דורש טיפול” בלוח השנה, ולא שונו.`;
}

// Shared by teachers and admins. Whether the caller may act for this teacher, and whether a removal
// is a pending request (teacher) or applied at once (admin), is decided by the database from the
// signed-in user; the form never carries a role.

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

const INACTIVE = { teacher_inactive: "המורה אינו פעיל, ולא ניתן להוסיף לו זמינות." };

function revalidateAvailability() {
  revalidatePath("/teacher/availability");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/teachers/[id]", "page");
}

export async function addAvailability(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = availabilitySlotSchema.safeParse({
    teacherId: text(formData, "teacherId"),
    day: text(formData, "day"),
    start: text(formData, "start"),
    end: text(formData, "end"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_availability", {
    p_teacher_id: parsed.data.teacherId,
    p_day: parsed.data.day,
    p_start: parsed.data.start,
    p_end: parsed.data.end,
  });
  if (error) return { error: dbErrorMessage(error, INACTIVE) };

  revalidateAvailability();
  return { ok: true };
}

export async function removeAvailability(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = removalSchema.safeParse({
    availabilityId: text(formData, "availabilityId"),
    kind: formData.get("kind") ?? undefined,
    date: text(formData, "date"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: requestId, error } = await supabase.rpc("remove_availability", {
    p_availability_id: parsed.data.availabilityId,
    p_kind: parsed.data.kind,
    p_date: parsed.data.date,
    p_reason: parsed.data.reason,
  });
  if (error) {
    if (["date_not_matching_day", "slot_not_valid_on_date", "date_past"].includes(error.message)) {
      return { fieldErrors: { date: dbErrorMessage(error) } };
    }
    return { error: dbErrorMessage(error) };
  }

  revalidateAvailability();
  revalidatePath("/admin/calendar");
  const profile = await requireProfile();
  const success = isAdminRole(profile.role) ? await flaggedMessage(supabase, requestId, "הזמינות הוסרה.") : undefined;
  return { ok: true, success };
}

export async function reportAbsence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = absenceSchema.safeParse({
    teacherId: text(formData, "teacherId"),
    mode: formData.get("mode") ?? undefined,
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
    startTime: text(formData, "startTime"),
    endTime: text(formData, "endTime"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const v = parsed.data;
  const hours = v.mode === "hours";
  const supabase = await createClient();
  const { data: requestId, error } = await supabase.rpc("report_absence", {
    p_teacher_id: v.teacherId,
    p_start_date: v.startDate,
    p_end_date: hours ? v.startDate : v.endDate,
    p_start_time: (hours ? v.startTime : null) as unknown as string,
    p_end_time: (hours ? v.endTime : null) as unknown as string,
    p_reason: v.reason,
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidateAvailability();
  revalidatePath("/admin/calendar");
  const profile = await requireProfile();
  const success = isAdminRole(profile.role) ? await flaggedMessage(supabase, requestId, "ההיעדרות נשמרה.") : undefined;
  return { ok: true, success };
}

export async function cancelRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = requestVersionSchema.safeParse({ id: text(formData, "id"), version: text(formData, "version") });
  if (!parsed.success) return { error: dbErrorMessage(null) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_availability_request", { p_id: parsed.data.id, p_version: parsed.data.version });
  revalidateAvailability();
  if (error) {
    return { error: dbErrorMessage(error, { request_already_handled: "הבקשה כבר טופלה בידי מנהל. הרשימה עודכנה." }) };
  }
  return { ok: true };
}

export type ImpactedLesson = {
  lessonId: string;
  startAt: string;
  endAt: string;
  studentName: string;
  lessonTypeName: string;
  color: string;
  location: "school" | "zoom";
};

// Lessons an approval would take out of the teacher's availability (admins only).
export async function getAvailabilityImpact(requestId: string): Promise<ImpactedLesson[]> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { data } = await supabase.rpc("availability_request_impact", { p_request_id: requestId });
  return (data ?? []).map((l) => ({
    lessonId: l.lesson_id,
    startAt: l.start_at,
    endAt: l.end_at,
    studentName: l.student_name,
    lessonTypeName: l.lesson_type_name,
    color: l.color,
    location: l.location,
  }));
}

export async function decideRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const parsed = decisionSchema.safeParse({
    id: text(formData, "id"),
    version: text(formData, "version"),
    decision: text(formData, "decision"),
    note: text(formData, "note"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  // Per-lesson decisions come from the approval dialog as JSON; none means "keep and flag".
  let decisions: ReturnType<typeof lessonDecisionsSchema.parse> = [];
  const raw = text(formData, "decisions");
  if (raw) {
    try {
      decisions = lessonDecisionsSchema.parse(JSON.parse(raw));
    } catch {
      return { error: dbErrorMessage({ message: "invalid_input" }) };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_availability_request", {
    p_id: parsed.data.id,
    p_version: parsed.data.version,
    p_approve: parsed.data.decision === "approve",
    p_note: parsed.data.note,
    p_decisions: decisions.map((d) => ({
      lesson_id: d.lessonId,
      action: d.action,
      teacher_id: d.teacherId,
      date: d.date || undefined,
      start: d.start || undefined,
    })),
  });
  // Refresh either way: on a conflict the list must show the other admin's decision.
  revalidateAvailability();
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  if (error) {
    const failed = error.message === "decision_failed" ? (error as { details?: string }).details : undefined;
    return { error: dbErrorMessage(error), failedId: failed };
  }
  const result = data as { cancelled: number; substituted: number; moved: number; requested: number; kept: number };
  const parts = [
    result.cancelled && `${result.cancelled} בוטלו`,
    result.substituted && `${result.substituted} הועברו למורה מחליף`,
    result.moved && `${result.moved} הועברו למועד אחר`,
    result.requested && `${result.requested} ממתינים לאישור מורה`,
    result.kept && `${result.kept} סומנו ”דורש טיפול”`,
  ].filter(Boolean);
  return { ok: true, success: parts.length ? `הבקשה אושרה. שיעורים: ${parts.join(", ")}.` : undefined };
}
