"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import type { ActionState } from "@/lib/actions";
import { dbErrorMessage } from "@/lib/errors";
import { LESSON_TYPE_COLOR_VALUES } from "@/lib/lesson-types/colors";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { durationSeriesSchema } from "@/lib/validation/lessons";
import { lessonTypeSchema } from "@/lib/validation/staff";

const PATH = "/admin/settings/lesson-types";
const NAME_TAKEN = { "23505": "כבר קיים תחום בשם הזה." };

function parse(formData: FormData) {
  return lessonTypeSchema.safeParse({
    name: formData.get("name"),
    defaultDurationMinutes: formData.get("defaultDurationMinutes"),
    color: formData.get("color") || undefined,
  });
}

type CreatedLessonType = { id: string; name: string; color: string };

// Shared by the settings page and the "new lesson type" form inside the teacher dialog.
async function insertLessonType(formData: FormData): Promise<ActionState & { lessonType?: CreatedLessonType }> {
  await requireRole(ADMIN_ROLES);
  const parsed = parse(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  let color = parsed.data.color;
  if (!color) {
    const { data, error } = await supabase.rpc("pick_lesson_type_color", { p_palette: LESSON_TYPE_COLOR_VALUES });
    if (error || !data) return { error: dbErrorMessage(error) };
    color = data;
  }

  const { data, error } = await supabase
    .from("lesson_types")
    .insert({ name: parsed.data.name, default_duration_minutes: parsed.data.defaultDurationMinutes, color })
    .select("id, name, color")
    .single();
  if (error) return { error: dbErrorMessage(error, NAME_TAKEN) };

  revalidatePath(PATH);
  revalidatePath("/admin/teachers");
  return { ok: true, success: "התחום נוסף.", lessonType: data };
}

export async function createLessonType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await insertLessonType(formData);
  delete result.lessonType;
  return result;
}

export async function createLessonTypeInline(formData: FormData) {
  return insertLessonType(formData);
}

export async function updateLessonType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const id = String(formData.get("id") ?? "");
  const parsed = parse(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  if (!parsed.data.color) return { fieldErrors: { color: "יש לבחור צבע" } };

  // Series the admin chose to apply a new duration to ("durationSeries", JSON); none = new bookings only.
  let series: ReturnType<typeof durationSeriesSchema.parse> = [];
  const raw = String(formData.get("durationSeries") ?? "");
  if (raw) {
    try {
      series = durationSeriesSchema.parse(JSON.parse(raw));
    } catch {
      return { error: dbErrorMessage({ message: "invalid_input" }) };
    }
  }

  const supabase = await createClient();
  const { data: current } = await supabase.from("lesson_types").select("default_duration_minutes").eq("id", id).single();
  const { data, error } = await supabase
    .from("lesson_types")
    .update({ name: parsed.data.name, color: parsed.data.color })
    .eq("id", id)
    .select("id");
  if (error) return { error: dbErrorMessage(error, NAME_TAKEN) };
  if (!data?.length) return { error: dbErrorMessage({ message: "not_found" }) };

  // The duration changes through a function that also settles the series the admin chose.
  if (current && current.default_duration_minutes !== parsed.data.defaultDurationMinutes) {
    const { error: durationError } = await supabase.rpc("apply_lesson_type_duration", {
      p_id: id,
      p_new_duration: parsed.data.defaultDurationMinutes,
      p_series: series.map((s) => ({
        series_id: s.seriesId,
        alternatives: s.alternatives.map((a) => ({ lesson_id: a.lessonId, start: a.start || null })),
      })),
    });
    if (durationError) {
      const failed = durationError.message === "decision_failed" ? (durationError as { details?: string }).details : undefined;
      return { error: dbErrorMessage(durationError), failedId: failed };
    }
  }

  revalidatePath(PATH);
  revalidatePath("/admin/calendar");
  return { ok: true, success: "התחום עודכן." };
}

export type LessonTypeDeleteInfo = {
  students: number;
  lessons: number;
  teachers: { id: string; name: string; only_skill: boolean }[];
};

// What blocks deleting a lesson type, and which teachers would lose it.
export async function getLessonTypeDeleteInfo(id: string): Promise<LessonTypeDeleteInfo | null> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lesson_type_delete_info", { p_id: id });
  if (error) return null;
  return data as LessonTypeDeleteInfo;
}

// Deletes the lesson type, and (when confirmed) removes it from all its teachers in the same transaction.
export async function deleteLessonType(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_lesson_type", {
    p_id: String(formData.get("id") ?? ""),
    p_remove_from_teachers: formData.get("removeFromTeachers") === "true",
  });
  if (error) return { error: dbErrorMessage(error) };

  revalidatePath(PATH);
  revalidatePath("/admin/teachers");
  return { ok: true };
}

export type DurationImpactSeries = {
  series_id: string;
  student_name: string;
  teacher_name: string;
  day: number;
  start: string;
  current_duration: number;
  meetings: number;
  conflicts: { lesson_id: string; date: string; start: string; suggestions: string[] }[];
};

// Active series of the subject that a new duration would touch, with the meetings that would clash.
export async function getDurationImpact(id: string, newDuration: number): Promise<DurationImpactSeries[]> {
  await requireRole(ADMIN_ROLES);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lesson_type_duration_impact", { p_id: id, p_new_duration: newDuration });
  if (error) return [];
  return data as unknown as DurationImpactSeries[];
}
