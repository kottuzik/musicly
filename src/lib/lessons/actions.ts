"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES, TEACHER_ROLES } from "@/lib/auth/roles";
import { requireProfile, requireRole, requireTeaching } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { requestVersionSchema } from "@/lib/validation/availability";
import {
  attendanceSchema,
  attentionSchema,
  bookLessonSchema,
  cancelLessonSchema,
  decideChangeRequestSchema,
  editLessonSchema,
  exceptionDecisionSchema,
  extendSeriesSchema,
  lessonChangeRequestSchema,
  restoreLessonSchema,
  seriesChangeSchema,
  seriesSchema,
  stopSeriesSchema,
} from "@/lib/validation/lessons";
import { SKIP_REASON_LABELS } from "./labels";
import { schoolTime, utcBounds } from "./time";

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
  results?: {
    day: number;
    start: string;
    result: "series" | "request" | "failed";
    created?: number;
    skipped?: SkippedDate[];
    note?: string | null;
  }[];
};

const BOOKING_FIELDS: Record<string, string> = {
  teacher_busy: "start",
  student_busy: "start",
  closed_day: "date",
  date_past: "date",
};

// An admin's own booking outside their availability is answered at once by the database, and only
// the request's status tells how it ended. Null means it still waits for the teacher.
async function selfDecided(id: string, done: string): Promise<{ ok?: boolean; success?: string; error?: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("exception_booking_requests").select("status, result_note").eq("id", id).maybeSingle();
  if (data?.status === "approved") return { ok: true, success: data.result_note ? `${done} ${data.result_note}.` : done };
  if (data?.status === "cannot_schedule") return { error: data.result_note ?? "לא ניתן לשבץ במועד הזה." };
  return null;
}

function revalidateLessons() {
  revalidatePath("/admin/my-teaching");
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/requests");
  revalidatePath("/teacher");
  revalidatePath("/teacher/calendar");
  revalidatePath("/teacher/requests");
  revalidatePath("/admin/activity");
  revalidatePath("/admin/students", "layout");
  revalidatePath("/admin/teachers", "layout");
  revalidatePath("/teacher/students", "layout");
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
  const { result, id } = data as { result: string; id: string };
  if (result === "request") {
    const decided = await selfDecided(id, "השיעור נקבע.");
    if (decided) return decided;
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
  const results = await Promise.all(
    (data as (NonNullable<SeriesState["results"]>[number] & { id: string })[]).map(async (r) => {
      if (r.result !== "request") return r;
      const { data: request } = await supabase
        .from("exception_booking_requests")
        .select("status, series_id, result_note")
        .eq("id", r.id)
        .maybeSingle();
      if (request?.status === "cannot_schedule") return { ...r, result: "failed" as const, note: request.result_note };
      if (request?.status !== "approved" || !request.series_id) return r;
      const { count } = await supabase
        .from("lessons")
        .select("id", { count: "exact", head: true })
        .eq("series_id", request.series_id)
        .eq("status", "scheduled");
      return { ...r, result: "series" as const, created: count ?? 0, note: request.result_note };
    }),
  );
  return { ok: true, results };
}

// The requested teacher approves or rejects a booking outside their availability.
export async function respondExceptionRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireTeaching();
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

// ---------------------------------------------------------------------------
// Changing, cancelling and restoring lessons and series (Milestone 6)
// ---------------------------------------------------------------------------

// Null for an empty form value (the generated types do not mark SQL arguments as nullable).
const orNull = (value: string | undefined) => (value || null) as unknown as string;
const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

export type ChangeState = ActionState & {
  needsConfirm?: boolean;
  // Outside the teacher's availability: a request was sent instead of making the change.
  requested?: boolean;
  // Restore: the time was taken; other start times on the same day.
  suggestions?: string[];
};

export type LessonChangePreview = { problem: string | null; outsideHours: boolean; needsRequest: boolean };

export type SubstituteOption = { id: string; name: string; available: boolean };

export type SeriesChangePreview = {
  meetings: { lesson_id: string; series_id: string; old_start: string; new_start: string; outcome: string }[];
  outside_hours: boolean;
  needs_request: boolean;
  regular_teacher_changes: boolean;
};

const REQUEST_SENT = "המועד מחוץ לזמינות המורה, ולכן נשלחה למורה בקשת אישור. עד שיאשר, הכול נשאר כפי שהיה.";

const CHANGE_FIELDS: Record<string, string> = {
  teacher_busy: "start",
  student_busy: "start",
  closed_day: "date",
  date_past: "date",
  date_taken: "date",
  invalid_time_step: "start",
};

function changeError(error: { message?: string; code?: string; hint?: string }): ChangeState {
  if (error.message === "outside_hours_confirm_required") return { needsConfirm: true };
  const message = dbErrorMessage(error);
  const field = CHANGE_FIELDS[error.message ?? ""];
  return field ? { fieldErrors: { [field]: message }, error: message } : { error: message };
}

// What changing one lesson would hit, shown before saving.
export async function previewLessonChange(input: {
  lessonId: string;
  date: string;
  start: string;
  duration: number;
  teacherId: string;
}): Promise<{ preview?: LessonChangePreview; error?: string }> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_lesson_change", {
    p_lesson_id: input.lessonId,
    p_date: input.date,
    p_start: input.start,
    p_duration: input.duration,
    p_teacher_id: input.teacherId,
  });
  if (error) return { error: dbErrorMessage(error) };
  const v = data as { problem: string | null; outside_hours: boolean; needs_request: boolean };
  return { preview: { problem: v.problem, outsideHours: v.outside_hours, needsRequest: v.needs_request } };
}

// Teachers who could take the lesson: free at its time, and whether it is also inside their availability.
export async function listSubstitutes(lessonId: string): Promise<SubstituteOption[]> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_substitutes", { p_lesson_id: lessonId });
  // An admin choosing themself needs nobody's approval, so they count as available.
  const { data: me } = await supabase.rpc("current_teacher_id");
  return (data ?? []).map((t) => ({ id: t.teacher_id, name: t.teacher_name, available: t.available || t.teacher_id === me }));
}

export async function updateLesson(input: Record<string, unknown>): Promise<ChangeState> {
  await requireRole(ADMIN_ROLES);
  const parsed = editLessonSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_lesson", {
    p_id: v.lessonId,
    p_version: v.version,
    p_date: v.date,
    p_start: v.start,
    p_duration: v.duration,
    p_teacher_id: v.teacherId,
    p_location: v.location,
    p_confirm_outside_hours: v.confirmOutsideHours,
    p_change_request_id: orNull(v.changeRequestId),
  });
  revalidateLessons();
  if (error) return changeError(error);
  const outcome = data as { result: string; id: string };
  if (outcome.result === "request") {
    return (await selfDecided(outcome.id, "השיעור עודכן.")) ?? { ok: true, requested: true, success: REQUEST_SENT };
  }
  return { ok: true, success: "השיעור עודכן." };
}

export async function cancelLesson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const parsed = cancelLessonSchema.safeParse({
    id: text(formData, "id"),
    version: text(formData, "version"),
    reason: text(formData, "reason"),
    confirmHeld: text(formData, "confirmHeld"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_lesson", {
    p_id: parsed.data.id,
    p_version: parsed.data.version,
    p_reason: parsed.data.reason,
    p_confirm_held: parsed.data.confirmHeld,
  });
  revalidateLessons();
  if (error) return { error: dbErrorMessage(error) };
  return { ok: true, success: "השיעור בוטל." };
}

// Admin or the lesson's own teacher. A taken time returns other start times for the same day.
export async function restoreLesson(input: Record<string, unknown>): Promise<ChangeState> {
  await requireProfile();
  const parsed = restoreLessonSchema.safeParse(input);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("restore_lesson", {
    p_id: v.id,
    p_version: v.version,
    p_date: orNull(v.date),
    p_start: orNull(v.start),
    p_confirm_outside_hours: v.confirmOutsideHours,
  });
  revalidateLessons();
  if (error) return changeError(error);

  const result = data as { result: string; id: string; suggestions?: string[] };
  if (result.result === "slot_taken") {
    return { error: dbErrorMessage({ message: "slot_taken" }), suggestions: result.suggestions ?? [] };
  }
  if (result.result === "request") {
    return (await selfDecided(result.id, "השיעור שוחזר.")) ?? { ok: true, requested: true, success: REQUEST_SENT };
  }
  return { ok: true, success: "השיעור שוחזר." };
}

// "Leave it as it is": an admin looked at a flagged lesson and keeps it unchanged.
export async function clearAttention(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const parsed = attentionSchema.safeParse({ id: text(formData, "id"), version: text(formData, "version") });
  if (!parsed.success) return { error: dbErrorMessage({ message: "invalid_input" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_lesson_attention", { p_id: parsed.data.id, p_version: parsed.data.version });
  revalidateLessons();
  if (error) return { error: dbErrorMessage(error) };
  return { ok: true };
}

function seriesChangeArgs(input: Record<string, unknown>) {
  const parsed = seriesChangeSchema.safeParse(input);
  if (!parsed.success) return { error: fieldErrors(parsed.error) } as const;
  const v = parsed.data;
  return {
    v,
    args: {
      p_series_id: v.seriesId,
      p_from_date: v.fromDate,
      p_day: v.day,
      p_start: v.start,
      p_duration: v.duration,
      p_teacher_id: v.teacherId,
      p_location: v.location,
    },
  } as const;
}

// Per upcoming meeting from the date: old time, new time and what would happen to it.
export async function previewSeriesChange(
  input: Record<string, unknown>,
): Promise<ActionState & { preview?: SeriesChangePreview }> {
  await requireRole(ADMIN_ROLES);
  const parsed = seriesChangeArgs(input);
  if ("error" in parsed) return { fieldErrors: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_series_change", parsed.args);
  if (error) return { error: dbErrorMessage(error) };
  return { preview: data as SeriesChangePreview };
}

export async function changeSeries(input: Record<string, unknown>): Promise<ChangeState & { flagged?: number; moved?: number }> {
  await requireRole(ADMIN_ROLES);
  const parsed = seriesChangeArgs(input);
  if ("error" in parsed) return { fieldErrors: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("change_series", {
    ...parsed.args,
    p_confirm_outside_hours: parsed.v.confirmOutsideHours,
  });
  revalidateLessons();
  if (error) return changeError(error);

  const result = data as { result: string; id: string; moved?: number; flagged?: number };
  if (result.result === "request") {
    return (await selfDecided(result.id, "הסדרה עודכנה.")) ?? { ok: true, requested: true, success: REQUEST_SENT };
  }
  const flagged = result.flagged ?? 0;
  return {
    ok: true,
    moved: result.moved,
    flagged,
    success: flagged
      ? `הסדרה עודכנה. ${flagged} מפגשים נשארו במועד המקורי ומסומנים ”דורש טיפול”.`
      : "הסדרה עודכנה.",
  };
}

export async function stopSeries(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const parsed = stopSeriesSchema.safeParse({ seriesId: text(formData, "seriesId"), fromDate: text(formData, "fromDate") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stop_series", { p_series_id: parsed.data.seriesId, p_from_date: parsed.data.fromDate });
  revalidateLessons();
  if (error) return { error: dbErrorMessage(error) };
  return { ok: true, success: `הסדרה הופסקה. ${(data as { cancelled: number }).cancelled} מפגשים בוטלו.` };
}

function extendArgs(input: Record<string, unknown>) {
  const parsed = extendSeriesSchema.safeParse(input);
  if (!parsed.success) return { error: fieldErrors(parsed.error) } as const;
  return {
    args: {
      p_series_id: parsed.data.seriesId,
      p_end_date: orNull(parsed.data.endDate),
      p_resume_from: orNull(parsed.data.resumeFrom),
    },
  } as const;
}

export async function previewSeriesExtend(
  input: Record<string, unknown>,
): Promise<ActionState & { preview?: { create: number; restore: number; problems: { date: string; reason: string }[] } }> {
  await requireRole(ADMIN_ROLES);
  const parsed = extendArgs(input);
  if ("error" in parsed) return { fieldErrors: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_series_extend", parsed.args);
  if (error) return { error: dbErrorMessage(error) };
  return { preview: data as { create: number; restore: number; problems: { date: string; reason: string }[] } };
}

// Extends the end date, removes it, or resumes a stopped series from a later date.
export async function extendSeries(input: Record<string, unknown>): Promise<ActionState & { skipped?: SkippedDate[] }> {
  await requireRole(ADMIN_ROLES);
  const parsed = extendArgs(input);
  if ("error" in parsed) return { fieldErrors: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("extend_series", parsed.args);
  revalidateLessons();
  if (error) return { error: dbErrorMessage(error) };
  const result = data as { restored: number; skipped: SkippedDate[] };
  return { ok: true, skipped: result.skipped, success: "הסדרה עודכנה." };
}

// ---------------------------------------------------------------------------
// Teacher requests to change or cancel a lesson
// ---------------------------------------------------------------------------

export async function requestLessonChange(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(TEACHER_ROLES);
  const parsed = lessonChangeRequestSchema.safeParse({
    lessonId: text(formData, "lessonId"),
    kind: text(formData, "kind"),
    date: text(formData, "date"),
    start: text(formData, "start"),
    reason: text(formData, "reason"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_lesson_change", {
    p_lesson_id: parsed.data.lessonId,
    p_kind: parsed.data.kind,
    p_date: orNull(parsed.data.date),
    p_start: orNull(parsed.data.start),
    p_reason: parsed.data.reason,
  });
  revalidateLessons();
  if (error) {
    const message = dbErrorMessage(error);
    return error.message === "date_past" ? { fieldErrors: { date: message }, error: message } : { error: message };
  }
  return { ok: true, success: "הבקשה נשלחה למנהל." };
}

// An admin answers. Approving a change is done by setting the new time (updateLesson with the request id).
export async function decideLessonChangeRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const parsed = decideChangeRequestSchema.safeParse({
    id: text(formData, "id"),
    version: text(formData, "version"),
    decision: text(formData, "decision"),
    note: text(formData, "note"),
    counterDate: text(formData, "counterDate"),
    counterStart: text(formData, "counterStart"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_lesson_change_request", {
    p_id: parsed.data.id,
    p_version: parsed.data.version,
    p_approve: parsed.data.decision === "approve",
    p_note: parsed.data.note,
    p_counter_date: orNull(parsed.data.counterDate),
    p_counter_start: orNull(parsed.data.counterStart),
  });
  revalidateLessons();
  if (error) {
    // The request is for a lesson already marked "held": the warning and confirmation live on the lesson itself.
    if (error.message === "held_confirmation_required") {
      return { error: "השיעור כבר סומן כ„התקיים”. כדי לבטל אותו יש לבטל אותו ישירות מכרטיס השיעור בלוח השנה, שם יוצג חלון אישור." };
    }
    return { error: dbErrorMessage(error) };
  }
  return { ok: true };
}

export async function cancelLessonChangeRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(TEACHER_ROLES);
  const parsed = requestVersionSchema.safeParse({ id: text(formData, "id"), version: text(formData, "version") });
  if (!parsed.success) return { error: dbErrorMessage({ message: "invalid_input" }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_lesson_change_request", {
    p_id: parsed.data.id,
    p_version: parsed.data.version,
  });
  revalidateLessons();
  if (error) return { error: dbErrorMessage(error) };
  return { ok: true };
}

// Report or correct attendance (an admin on any scheduled lesson, an active teacher on their own;
// the database enforces it). "version" is the version of the report the form was opened on.
export async function setAttendance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = attendanceSchema.safeParse({
    lessonId: text(formData, "lessonId"),
    status: text(formData, "status"),
    note: text(formData, "note"),
    version: text(formData, "version"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_attendance", {
    p_lesson_id: parsed.data.lessonId,
    p_status: parsed.data.status,
    p_note: parsed.data.note,
    p_version: (parsed.data.version === "" ? null : parsed.data.version) as number,
  });
  revalidateLessons();
  if (error) return { error: dbErrorMessage(error) };
  return { ok: true, success: "הנוכחות נשמרה." };
}

// Everything that happened to a lesson (admins only; names are looked up when read).
export async function getLessonHistory(id: string) {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_lesson_history", { p_lesson_id: id });
  return data ?? [];
}

export type BusyRange = { start: string; end: string; who: "teacher" | "student" };

// Lessons that already hold time on a date for the teacher or the student (school-local HH:MM),
// so a time picker can show taken start times as unavailable. The database still checks on save.
export async function getBusyTimes(input: {
  date: string;
  teacherId?: string;
  studentId?: string;
  excludeLessonId?: string;
}): Promise<BusyRange[]> {
  await requireProfile();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || (!input.teacherId && !input.studentId)) return [];
  const supabase = await createClient();
  const bounds = utcBounds(input.date, input.date);
  const who = [input.teacherId && `teacher_id.eq.${input.teacherId}`, input.studentId && `student_id.eq.${input.studentId}`]
    .filter(Boolean)
    .join(",");
  const { data } = await supabase
    .from("lessons")
    .select("id, teacher_id, start_at, end_at")
    .eq("status", "scheduled")
    .lt("start_at", bounds.to)
    .gt("end_at", bounds.from)
    .or(who);
  return (data ?? [])
    .filter((l) => l.id !== input.excludeLessonId)
    .map((l) => ({
      start: schoolTime(l.start_at),
      end: schoolTime(l.end_at),
      who: l.teacher_id === input.teacherId ? "teacher" : "student",
    }));
}

export type WeekLesson = { date: string; start: string; end: string };

// The teacher's scheduled lessons over a range of school dates (admins), for the weekly overview
// in the booking dialog.
export async function getTeacherLessons(input: { teacherId: string; from: string; to: string }): Promise<WeekLesson[]> {
  await requireRole(ADMIN_ROLES);
  if (!input.teacherId) return [];
  const supabase = await createClient();
  const bounds = utcBounds(input.from, input.to);
  const { data } = await supabase
    .from("lessons")
    .select("occurrence_date, start_at, end_at")
    .eq("teacher_id", input.teacherId)
    .eq("status", "scheduled")
    .gte("start_at", bounds.from)
    .lt("start_at", bounds.to)
    .order("start_at");
  return (data ?? []).map((l) => ({ date: l.occurrence_date, start: schoolTime(l.start_at), end: schoolTime(l.end_at) }));
}
