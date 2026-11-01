"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES, TEACHER_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { requestVersionSchema } from "@/lib/validation/availability";
import { bookLessonSchema, exceptionDecisionSchema, seriesSchema } from "@/lib/validation/lessons";
import { SKIP_REASON_LABELS } from "./labels";

// Every scheduling rule (permissions, conflicts, hours, availability) is enforced by the database
// functions; these actions validate input, call them and translate the outcome for the UI.

export type SkippedDate = { date: string; reason: string };

export type BookingState = ActionState & {
  // The time is outside school hours and the admin has not confirmed yet.
  needsConfirm?: boolean;
  // Outside the teacher's availability: a request was sent instead of booking.
  requested?: boolean;
};

export type SeriesPreview = {
  day: number;
  start: string;
  first_date: string;
  outside_hours: boolean;
  needs_request: boolean;
  scheduled: number;
  closed_dates: string[];
  skipped: SkippedDate[];
}[];

export type SeriesState = ActionState & {
  needsConfirm?: boolean;
  preview?: SeriesPreview;
  results?: { day: number; start: string; result: "series" | "request"; created?: number; skipped?: SkippedDate[] }[];
};

const BOOKING_FIELDS: Record<string, string> = {
  teacher_busy: "start",
  student_busy: "start",
  closed_day: "date",
  date_past: "date",
};

function revalidateLessons() {
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/requests");
  revalidatePath("/teacher");
  revalidatePath("/teacher/calendar");
  revalidatePath("/teacher/requests");
}

export async function bookLesson(input: Record<string, unknown>): Promise<BookingState> {
  await requireRole(ADMIN_ROLES);
  const parsed = bookLessonSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_lesson", {
    p_student_id: v.studentId,
    p_lesson_type_id: v.lessonTypeId,
    p_teacher_id: v.teacherId,
    p_date: v.date,
    p_start_time: v.start,
    p_duration: v.duration,
    p_location: v.location,
    p_confirm_outside_hours: v.confirmOutsideHours,
  });
  if (error) {
    if (error.message === "outside_hours_confirm_required") return { needsConfirm: true };
    const field = BOOKING_FIELDS[error.message ?? ""];
    const message = dbErrorMessage(error);
    return field ? { fieldErrors: { [field]: message }, error: message } : { error: message };
  }

  revalidateLessons();
  const result = (data as { result: string }).result;
  if (result === "request") {
    return {
      ok: true,
      requested: true,
      success: "המועד מחוץ לזמינות המורה, ולכן נשלחה למורה בקשת אישור. השעה אינה שמורה עד שהמורה יאשר.",
    };
  }
  return { ok: true, success: "השיעור נקבע." };
}

function seriesArgs(input: Record<string, unknown>) {
  const parsed = seriesSchema.safeParse(input);
  if (!parsed.success) return { error: fieldErrors(parsed.error) } as const;
  const v = parsed.data;
  return {
    v,
    args: {
      p_student_id: v.studentId,
      p_lesson_type_id: v.lessonTypeId,
      p_meetings: v.meetings,
      p_start_date: v.startDate,
      p_end_date: (v.endDate || null) as unknown as string,
    },
  } as const;
}

// What a series would create, shown for confirmation before saving.
export async function previewSeries(input: Record<string, unknown>): Promise<SeriesState> {
  await requireRole(ADMIN_ROLES);
  const parsed = seriesArgs(input);
  if ("error" in parsed) return { fieldErrors: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_series", parsed.args);
  if (error) return { error: dbErrorMessage(error) };
  return { preview: data as SeriesPreview };
}

export async function createSeries(input: Record<string, unknown>): Promise<SeriesState> {
  await requireRole(ADMIN_ROLES);
  const parsed = seriesArgs(input);
  if ("error" in parsed) return { fieldErrors: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_series", {
    ...parsed.args,
    p_location: parsed.v.location,
    p_confirm_outside_hours: parsed.v.confirmOutsideHours,
  });
  if (error) {
    if (error.message === "outside_hours_confirm_required") return { needsConfirm: true };
    return { error: dbErrorMessage(error) };
  }

  revalidateLessons();
  return { ok: true, results: data as SeriesState["results"] };
}

// The requested teacher approves or rejects a booking outside their availability.
export async function respondExceptionRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(TEACHER_ROLES);
  const parsed = exceptionDecisionSchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_exception_request", {
    p_id: parsed.data.id,
    p_version: parsed.data.version,
    p_approve: parsed.data.decision === "approve",
    p_note: parsed.data.note,
  });
  revalidateLessons();
  if (error) return { error: dbErrorMessage(error) };

  const outcome = data as { result: string; reason?: string; skipped?: SkippedDate[] };
  if (outcome.result === "cannot_schedule") {
    return { error: `לא ניתן לשבץ: ${outcome.reason}. הבקשה נסגרה, והמנהל יכול לפתוח בקשה חדשה.` };
  }
  if (outcome.result === "approved" && outcome.skipped?.length) {
    const dates = outcome.skipped.map((s) => `${s.date} (${SKIP_REASON_LABELS[s.reason] ?? s.reason})`).join(", ");
    return { ok: true, success: `השיבוץ אושר. מפגשים שלא נוצרו: ${dates}.` };
  }
  return { ok: true, success: outcome.result === "approved" ? "השיבוץ אושר." : "הבקשה נדחתה." };
}

export async function cancelExceptionRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const parsed = requestVersionSchema.safeParse({ id: formData.get("id"), version: formData.get("version") });
  if (!parsed.success) return { error: dbErrorMessage({ message: "invalid_input" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_exception_request", {
    p_id: parsed.data.id,
    p_version: parsed.data.version,
  });
  revalidateLessons();
  if (error) return { error: dbErrorMessage(error) };
  return { ok: true };
}

// Details for the lesson panel (permissions checked by get_lesson).
export async function getLessonDetails(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_lesson", { p_id: id });
  return data?.[0] ?? null;
}
