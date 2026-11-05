"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { isAdminRole } from "@/lib/auth/roles";
import { requireProfile, requireRole } from "@/lib/auth/session";
import { dbErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { WEEKDAY_LABELS } from "@/lib/time/weekdays";
import { fieldErrors } from "@/lib/validation/auth";
import { lessonDecisionsSchema } from "@/lib/validation/lessons";
import {
  absenceSchema,
  availabilityEditSchema,
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
  revalidatePath("/admin/my-teaching");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/teachers/[id]", "page");
}

// Adds the hours on each given day, as one or two ranges. A day the hours do not fit,
// or that already has overlapping availability, is skipped and reported; the others are still added.
async function addAvailabilityRanges(formData: FormData, days: number[], ranges: { start: string; end: string }[]): Promise<ActionState> {
  const supabase = await createClient();
  const added: string[] = [];
  const skipped: string[] = [];

  for (const day of days) {
    let failure: string | null = null;
    let addedAny = false;
    for (const range of ranges) {
      const parsed = availabilitySlotSchema.safeParse({ teacherId: text(formData, "teacherId"), day: String(day), ...range });
      if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

      const { error } = await supabase.rpc("add_availability", {
        p_teacher_id: parsed.data.teacherId,
        p_day: parsed.data.day,
        p_start: parsed.data.start,
        p_end: parsed.data.end,
      });
      if (!error) addedAny = true;
      else if (error.message === "outside_operating_hours") failure = "מחוץ לשעות הפעילות";
      else if (error.message === "availability_overlap") failure = "חופף לזמינות קיימת";
      else return { error: dbErrorMessage(error, INACTIVE) };
    }
    if (addedAny) added.push(WEEKDAY_LABELS[day]);
    if (failure) skipped.push(`${WEEKDAY_LABELS[day]}${addedAny ? " — חלק מהשעות" : ""} (${failure})`);
  }

  revalidateAvailability();
  if (!added.length) return { error: `לא נוספה זמינות. ${skipped.join(", ")}.` };
  if (!skipped.length) return { ok: true };
  return { ok: true, success: `נוסף לימים: ${added.join(", ")}. לא נוסף לימים: ${skipped.join(", ")}.` };
}

// The form's hours: one range, or two on the same day (for example 10:00-13:00 and 16:00-21:00).
function rangesFrom(formData: FormData): { ranges: { start: string; end: string }[] } | { errors: Record<string, string> } {
  const start = text(formData, "start");
  const end = text(formData, "end");
  if (formData.get("withSecond") !== "on") return { ranges: [{ start, end }] };
  const secondStart = text(formData, "secondStart");
  const secondEnd = text(formData, "secondEnd");
  if (!start) return { errors: { start: "יש לבחור שעת התחלה" } };
  if (!end) return { errors: { end: "יש לבחור שעת סיום" } };
  if (!secondStart) return { errors: { secondStart: "יש לבחור שעת התחלה לטווח השני" } };
  if (!secondEnd) return { errors: { secondEnd: "יש לבחור שעת סיום לטווח השני" } };
  if (secondStart < end) return { errors: { secondStart: "הטווח השני צריך להתחיל אחרי סיום הטווח הראשון" } };
  if (secondEnd <= secondStart) return { errors: { secondEnd: "שעת הסיום צריכה להיות אחרי שעת ההתחלה" } };
  return { ranges: [{ start, end }, { start: secondStart, end: secondEnd }] };
}

export async function addAvailability(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const allWeek = formData.get("allWeek") === "on";
  if (allWeek || formData.get("withSecond") === "on") {
    const parsedRanges = rangesFrom(formData);
    if ("errors" in parsedRanges) return { fieldErrors: parsedRanges.errors };
    if (!allWeek && !text(formData, "day")) return { fieldErrors: { day: "יש לבחור יום" } };
    const supabase = await createClient();
    const { data: hours } = await supabase.from("operating_hours").select("day_of_week").order("day_of_week");
    const days = allWeek ? (hours ?? []).map((h) => h.day_of_week) : [Number(text(formData, "day"))];
    return addAvailabilityRanges(formData, days, parsedRanges.ranges);
  }
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

const flaggedNote = (count: number) =>
  count === 1 ? "שיעור עתידי אחד סומן ”דורש טיפול” בלוח השנה." : `${count} שיעורים עתידיים סומנו ”דורש טיפול” בלוח השנה.`;

// Changes one slot's hours or, on request, every slot of this teacher with the same hours. A day that
// cannot change is skipped and reported; the others are still changed.
export async function updateAvailability(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireProfile();
  const parsed = availabilityEditSchema.safeParse({
    availabilityId: text(formData, "availabilityId"),
    start: text(formData, "start"),
    end: text(formData, "end"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { availabilityId, start, end } = parsed.data;
  const parsedRanges = rangesFrom(formData);
  if ("errors" in parsedRanges) return { fieldErrors: parsedRanges.errors };
  const second = parsedRanges.ranges[1];

  const supabase = await createClient();
  const { data: slot } = await supabase
    .from("teacher_availability")
    .select("teacher_id, day_of_week, start_time, end_time")
    .eq("id", availabilityId)
    .maybeSingle();
  if (!slot) return { error: dbErrorMessage({ message: "not_found" }) };

  const targets =
    formData.get("sameHours") === "on"
      ? ((
          await supabase
            .from("teacher_availability")
            .select("id, day_of_week")
            .eq("teacher_id", slot.teacher_id)
            .eq("start_time", slot.start_time)
            .eq("end_time", slot.end_time)
            .is("valid_to", null)
            .order("day_of_week")
        ).data ?? [])
      : [{ id: availabilityId, day_of_week: slot.day_of_week }];

  let flagged = 0;
  let changed = 0;
  const skipped: string[] = [];
  for (const target of targets) {
    const { data, error } = await supabase.rpc("update_availability", {
      p_availability_id: target.id,
      p_start: start,
      p_end: end,
      // Null means "one range" (the generated types do not mark SQL arguments as nullable).
      p_second_start: (second?.start ?? null) as unknown as string,
      p_second_end: (second?.end ?? null) as unknown as string,
    });
    if (!error) {
      changed += 1;
      flagged += data ?? 0;
    } else if (targets.length === 1 || error.message === "availability_narrowing_needs_request" || error.message === "not_allowed") {
      // The same answer for every day, so there is nothing to report day by day.
      if (changed) revalidateAvailability();
      return { error: dbErrorMessage(error, INACTIVE) };
    } else {
      skipped.push(`${WEEKDAY_LABELS[target.day_of_week]} (${dbErrorMessage(error, INACTIVE)})`);
    }
  }

  revalidateAvailability();
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  if (!changed) return { error: `השעות לא עודכנו. ${skipped.join(", ")}` };
  const notes = [skipped.length ? `לא עודכן לימים: ${skipped.join(", ")}` : "", flagged ? flaggedNote(flagged) : ""].filter(Boolean);
  return notes.length ? { ok: true, success: `השעות עודכנו. ${notes.join(" ")}` } : { ok: true };
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
